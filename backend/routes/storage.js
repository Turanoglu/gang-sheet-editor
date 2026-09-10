const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sendStatusEmail } = require('./email');
const { adminRateLimit } = require('../lib/rateLimit');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Helper: Get customer ID from request (from Shopify)
// Shopify customer IDs are numeric strings. We validate format to prevent path traversal
// (e.g. "../../admin") — a numeric-only ID cannot escape the users/ prefix in R2 keys.
const VALID_CUSTOMER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// The Liquid template (rendered server-side by Shopify, a trusted context) signs
// `${customerId}:${ts}` with this shared secret and passes the signature to the iframe.
// Without a valid signature we never trust a client-claimed *numeric* (Shopify-shaped)
// customer ID — that's what closes the cross-customer IDOR (any visitor could otherwise
// just send someone else's numeric customer ID and read/edit/delete their data).
// 30 days. The signature is minted server-side by Shopify's Liquid template on every
// page load, so a returning customer refreshes it constantly; the only case a longer
// window helps is a tab/link opened days later (e.g. the "My Orders" panel) — a 24h
// window there silently dropped the customer to "anonymous" and showed an empty list.
const CUSTOMER_SIG_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const verifyCustomerSignature = (customerId, ts, sig) => {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || !customerId || !ts || !sig) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - tsNum;
  if (ageSeconds < -60 || ageSeconds > CUSTOMER_SIG_MAX_AGE_SECONDS) return false; // small clock-skew allowance

  const expectedHex = crypto.createHmac('sha256', secret).update(`${customerId}:${ts}`).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  let got;
  try { got = Buffer.from(String(sig), 'hex'); } catch { return false; }
  if (expected.length !== got.length) return false;
  return crypto.timingSafeEqual(expected, got);
};

// Resolves who is actually calling us:
//  1. A verified admin (X-Admin-Key) may act on behalf of any customer — same trust
//     level already used by the /admin/* routes (e.g. "Edit in Builder" for a customer).
//  2. A Shopify customer ID is only trusted when it carries a valid HMAC signature.
//  3. Otherwise, a non-numeric, self-issued guest session ID is allowed (bearer-secret
//     model — the same trust level as an anonymous cart cookie). A numeric ID without a
//     valid signature is NEVER trusted, since that's exactly what a real customer ID looks like.
const getCustomerId = (req) => {
  const raw = req.headers['x-shopify-customer-id'] || req.query.customerId || req.body?.customerId || '';
  const claimed = String(raw).trim();

  const adminKey = req.headers['x-admin-key'];
  if (adminKey && process.env.ADMIN_SECRET_KEY && adminKey === process.env.ADMIN_SECRET_KEY) {
    if (claimed && VALID_CUSTOMER_ID_RE.test(claimed)) return claimed;
  }

  if (claimed && VALID_CUSTOMER_ID_RE.test(claimed)) {
    const sig = req.headers['x-customer-sig'];
    const ts = req.headers['x-customer-ts'];
    if (verifyCustomerSignature(claimed, ts, sig)) return claimed;
    if (!/^\d+$/.test(claimed)) return claimed; // opaque guest session id — not Shopify-shaped
    console.warn('[storage] Rejected unsigned numeric customer ID:', JSON.stringify(claimed).slice(0, 80));
  }

  return 'anonymous';
};

// Helper: Get shop domain from request
const getShopDomain = (req) => {
  const domain = req.headers['x-shop-domain'] || req.query.shopDomain || '';
  return domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
};

// Owner shop domain (existing data without shopDomain field belongs to this store)
const OWNER_SHOP_DOMAIN = (process.env.DEFAULT_SHOP_DOMAIN || '').toLowerCase();

// Check if an item belongs to the requested shop domain
// Legacy data (no shopDomain field) is treated as belonging to the owner store
const itemBelongsToShop = (item, requestedShopDomain) => {
  if (!requestedShopDomain) return true; // No filter = super admin sees all
  const itemDomain = (item.shopDomain || '').toLowerCase();
  if (!itemDomain) return requestedShopDomain === OWNER_SHOP_DOMAIN || !OWNER_SHOP_DOMAIN;
  return itemDomain === requestedShopDomain;
};

// Admin auth middleware — rate-limited to slow down brute-forcing ADMIN_SECRET_KEY
const requireAdminKey = [adminRateLimit, (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.ADMIN_SECRET_KEY) {
    return res.status(500).json({ error: 'Admin key not configured on server' });
  }
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    req._rateLimitRecord?.();
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}];

// Helper: Convert stream to string
const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
};

// Helper: list ALL objects under a prefix, following pagination.
// A bare ListObjectsV2Command page tops out at 1000 keys (or a lower MaxKeys); once the
// store accumulates more orders+designs than that, older/newer items would silently
// disappear from admin listings. This walks every page via ContinuationToken instead.
const listAllObjects = async (prefix) => {
  const all = [];
  let ContinuationToken;
  do {
    const page = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken,
    }));
    all.push(...(page.Contents || []));
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return all;
};

// ──────────────────────────────────────────────────────────────────────────────
// Admin list cache — /admin/orders and /admin/designs each walk the whole bucket
// and GET every JSON object. With the auto-refresh poll every 60s plus manual
// "Yenile" clicks that is a lot of R2 Class-B traffic for data that barely changes.
// A short TTL cache absorbs the repeats; any admin write invalidates it immediately.
// ──────────────────────────────────────────────────────────────────────────────
const ADMIN_CACHE_TTL_MS = 30_000;
const adminCache = new Map(); // key -> { ts, data }

const getAdminCache = (key) => {
  const hit = adminCache.get(key);
  if (hit && Date.now() - hit.ts < ADMIN_CACHE_TTL_MS) return hit.data;
  adminCache.delete(key);
  return null;
};
const setAdminCache = (key, data) => adminCache.set(key, { ts: Date.now(), data });
const invalidateAdminCache = () => adminCache.clear();

// Any successful write through this router (customer or admin) drops the admin list
// cache so the next /admin/orders or /admin/designs read reflects it immediately.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) invalidateAdminCache();
  });
  next();
});

// Re-sign the thumbnail URL for each item in an order. Presigned URLs stored inside
// the order JSON expire (24h), so without this every order preview in the customer
// and admin panels breaks a day after checkout. `ownerCustomerId` is the customer the
// order belongs to (used when an item's design has no customerId of its own).
const refreshOrderItemThumbnails = async (order, ownerCustomerId) => {
  if (!order || !Array.isArray(order.items)) return order;
  await Promise.all(order.items.map(async (item) => {
    const designId = item?.design?.id;
    if (!designId) return;
    const cid = item.design.customerId || ownerCustomerId;
    if (!cid) return;
    const thumbKey = `exports/${cid}/${designId}/thumbnail.png`;
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }));
      item.design.thumbnailUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }),
        { expiresIn: 86400 }
      );
    } catch { /* no thumbnail in R2 — leave whatever the JSON had */ }
  }));
  return order;
};

// ==================== DESIGNS ====================

// Save a design
router.post('/designs', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const shopDomain = getShopDomain(req);
    const { design } = req.body;

    if (!design || !design.id) {
      return res.status(400).json({ error: 'Design data with ID is required' });
    }

    const key = `users/${customerId}/designs/${design.id}.json`;
    // Strip only base64-heavy fields; keep canvasData and assetsMetadata (URL refs, not blobs)
    const { assetsData, fullExportUrl, ...lightDesign } = design;
    const designToSave = shopDomain ? { ...lightDesign, shopDomain } : lightDesign;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(designToSave),
      ContentType: 'application/json',
    }));

    res.json({ success: true, designId: design.id, key });
  } catch (error) {
    console.error('Error saving design:', error);
    res.status(500).json({ error: 'Failed to save design', message: error.message });
  }
});

// Get all designs for a customer
router.get('/designs', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const prefix = `users/${customerId}/designs/`;

    const objects = await listAllObjects(prefix);

    if (objects.length === 0) {
      return res.json({ designs: [] });
    }

    // Fetch each design and refresh thumbnail URL
    const designs = await Promise.all(
      objects.map(async (obj) => {
        try {
          const getResponse = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key,
          }));
          const bodyContents = await streamToString(getResponse.Body);
          const design = JSON.parse(bodyContents);
          // Regenerate fresh presigned thumbnail URL only if file exists in R2
          const thumbKey = `exports/${customerId}/${design.id}/thumbnail.png`;
          try {
            await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }));
            design.thumbnailUrl = await getSignedUrl(
              s3Client,
              new GetObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }),
              { expiresIn: 86400 }
            );
          } catch { /* thumbnail.png not in R2 — keep existing thumbnailUrl from design JSON */ }
          // Regenerate signed URLs for individual asset images
          if (design.assetsMetadata && typeof design.assetsMetadata === 'object') {
            await Promise.all(Object.entries(design.assetsMetadata).map(async ([, meta]) => {
              if (meta && meta.r2Key) {
                try {
                  meta.viewUrl = await getSignedUrl(
                    s3Client,
                    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: meta.r2Key }),
                    { expiresIn: 86400 }
                  );
                } catch { /* skip if asset missing */ }
              }
            }));
          }
          return design;
        } catch (err) {
          console.error(`Error reading design ${obj.Key}:`, err);
          return null;
        }
      })
    );

    res.json({ designs: designs.filter(Boolean) });
  } catch (error) {
    console.error('Error fetching designs:', error);
    res.status(500).json({ error: 'Failed to fetch designs', message: error.message });
  }
});

// Get a single design
router.get('/designs/:designId', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { designId } = req.params;
    const key = `users/${customerId}/designs/${designId}.json`;

    const response = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));

    const bodyContents = await streamToString(response.Body);
    const design = JSON.parse(bodyContents);

    // Refresh assetsMetadata viewUrls so they are always valid when editor loads
    if (design.assetsMetadata && typeof design.assetsMetadata === 'object') {
      await Promise.all(Object.entries(design.assetsMetadata).map(async ([, meta]) => {
        if (meta && meta.r2Key) {
          try {
            meta.viewUrl = await getSignedUrl(
              s3Client,
              new GetObjectCommand({ Bucket: BUCKET_NAME, Key: meta.r2Key }),
              { expiresIn: 86400 }
            );
          } catch { /* skip missing asset */ }
        }
      }));
    }

    // If assetsMetadata is missing but canvasData is present, reconstruct from R2 asset files
    if (!design.assetsMetadata && design.canvasData) {
      try {
        const items = JSON.parse(design.canvasData);
        const assetIds = [...new Set(items.map(i => i.assetId).filter(Boolean))];
        if (assetIds.length > 0) {
          const assetsMetadata = {};
          await Promise.all(assetIds.map(async (assetId) => {
            const assetKey = `exports/${customerId}/${designId}/assets/${assetId}.png`;
            try {
              const viewUrl = await getSignedUrl(
                s3Client,
                new GetObjectCommand({ Bucket: BUCKET_NAME, Key: assetKey }),
                { expiresIn: 86400 }
              );
              assetsMetadata[assetId] = { name: assetId, originalWidth: 0, originalHeight: 0, r2Key: assetKey, viewUrl };
            } catch { /* asset file not in R2 */ }
          }));
          if (Object.keys(assetsMetadata).length > 0) design.assetsMetadata = assetsMetadata;
        }
      } catch { /* ignore canvasData parse errors */ }
    }

    res.json({ design });
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'Design not found' });
    }
    console.error('Error fetching design:', error);
    res.status(500).json({ error: 'Failed to fetch design', message: error.message });
  }
});

// Delete a design
router.delete('/designs/:designId', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { designId } = req.params;
    const key = `users/${customerId}/designs/${designId}.json`;

    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));

    res.json({ success: true, designId });
  } catch (error) {
    console.error('Error deleting design:', error);
    res.status(500).json({ error: 'Failed to delete design', message: error.message });
  }
});

// ==================== ORDERS ====================

// Save an order
router.post('/orders', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const shopDomain = getShopDomain(req);
    const { order } = req.body;

    if (!order || !order.id) {
      return res.status(400).json({ error: 'Order data with ID is required' });
    }

    const key = `users/${customerId}/orders/${order.id}.json`;
    // Strip heavy base64 fields from root and from each item's design — keep items array
    const { canvasData, assetsData, ...withItems } = order;
    const lightItems = (order.items ?? []).map(item => {
      if (!item?.design) return item;
      const { canvasData: _c, assetsData: _a, thumbnailUrl, fullExportUrl, ...lightDesign } = item.design;
      // Only keep URLs that are real presigned URLs, not base64 blobs
      if (thumbnailUrl && !thumbnailUrl.startsWith('data:')) lightDesign.thumbnailUrl = thumbnailUrl;
      if (fullExportUrl && !fullExportUrl.startsWith('data:')) lightDesign.fullExportUrl = fullExportUrl;
      return { ...item, design: lightDesign };
    });
    const orderToSave = { ...withItems, items: lightItems };
    if (shopDomain) orderToSave.shopDomain = shopDomain;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(orderToSave),
      ContentType: 'application/json',
    }));

    res.json({ success: true, orderId: order.id, key });
  } catch (error) {
    console.error('Error saving order:', error);
    res.status(500).json({ error: 'Failed to save order', message: error.message });
  }
});

// Get all orders for a customer
router.get('/orders', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const prefix = `users/${customerId}/orders/`;

    const objects = await listAllObjects(prefix);

    if (objects.length === 0) {
      return res.json({ orders: [] });
    }

    const orders = await Promise.all(
      objects.map(async (obj) => {
        try {
          const getResponse = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key,
          }));
          const bodyContents = await streamToString(getResponse.Body);
          const order = JSON.parse(bodyContents);
          return await refreshOrderItemThumbnails(order, customerId);
        } catch (err) {
          console.error(`Error reading order ${obj.Key}:`, err);
          return null;
        }
      })
    );

    res.json({ orders: orders.filter(Boolean) });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders', message: error.message });
  }
});

// Statuses a customer may set on their own order. Fulfillment states (Ordered /
// Processing / Completed) are set only by an admin or a Shopify webhook.
const CUSTOMER_SETTABLE_STATUSES = ['Draft', 'Created', 'In Cart', 'Cancelled'];

// Update order status
router.patch('/orders/:orderId/status', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { orderId } = req.params;
    const { status } = req.body;

    const isAdmin = req.headers['x-admin-key'] &&
      process.env.ADMIN_SECRET_KEY &&
      req.headers['x-admin-key'] === process.env.ADMIN_SECRET_KEY;

    if (!isAdmin && !CUSTOMER_SETTABLE_STATUSES.includes(status)) {
      return res.status(403).json({ error: `Customers cannot set status "${status}"` });
    }

    const key = `users/${customerId}/orders/${orderId}.json`;

    // Get existing order
    const getResponse = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    const bodyContents = await streamToString(getResponse.Body);
    const order = JSON.parse(bodyContents);

    // A customer may not move an order that has already progressed to fulfillment.
    if (!isAdmin && !CUSTOMER_SETTABLE_STATUSES.includes(order.status)) {
      return res.status(403).json({ error: 'This order can no longer be changed. Contact support.' });
    }

    // Update status
    order.status = status;
    order.updatedAt = new Date().toISOString();

    // Save back
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(order),
      ContentType: 'application/json',
    }));

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status', message: error.message });
  }
});

// Delete an order (customer). Only orders that never became a real purchase may be
// removed by the customer — anything from Ordered onward is kept for the record.
const CUSTOMER_DELETABLE_STATUSES = ['Draft', 'Created', 'In Cart'];

router.delete('/orders/:orderId', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { orderId } = req.params;
    const key = `users/${customerId}/orders/${orderId}.json`;

    const isAdmin = req.headers['x-admin-key'] &&
      process.env.ADMIN_SECRET_KEY &&
      req.headers['x-admin-key'] === process.env.ADMIN_SECRET_KEY;

    if (!isAdmin) {
      try {
        const existing = JSON.parse(await streamToString(
          (await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }))).Body
        ));
        if (!CUSTOMER_DELETABLE_STATUSES.includes(existing.status)) {
          return res.status(403).json({ error: 'A placed order cannot be deleted. Contact support to cancel.' });
        }
      } catch (e) {
        if (e.name === 'NoSuchKey') return res.json({ success: true, orderId });
        throw e;
      }
    }

    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));

    res.json({ success: true, orderId });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order', message: error.message });
  }
});

// ==================== IMAGES / EXPORTS ====================

// Proxy an R2 object to frontend (avoids CORS issues with presigned URLs)
router.get('/proxy-image', requireAdminKey, async (req, res) => {
  try {
    const { customerId, designId } = req.query;
    if (!customerId || !designId) return res.status(400).json({ error: 'customerId and designId are required' });

    // Try full-export first, fall back to thumbnail
    const keys = [
      `exports/${customerId}/${designId}/full-export.png`,
      `exports/${customerId}/${designId}/thumbnail.png`,
    ];

    for (const key of keys) {
      try {
        const getResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
        res.setHeader('Content-Type', getResponse.ContentType || 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        getResponse.Body.pipe(res);
        return;
      } catch (e) {
        if (e.name !== 'NoSuchKey') throw e;
      }
    }

    res.status(404).json({ error: 'Image not found in R2' });
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ error: 'Failed to proxy image', message: error.message });
  }
});

// Upload image directly (for smaller images)
router.post('/upload-image', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { designId, imageData, imageType, fileType, assetId } = req.body;

    if (!designId || !imageData) {
      return res.status(400).json({ error: 'designId and imageData are required' });
    }

    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const extension = fileType?.split('/')[1] || 'png';
    let key;
    if (imageType === 'thumbnail') {
      key = `exports/${customerId}/${designId}/thumbnail.${extension}`;
    } else if (imageType === 'asset' && assetId) {
      key = `exports/${customerId}/${designId}/assets/${assetId}.${extension}`;
    } else {
      key = `exports/${customerId}/${designId}/full-export.${extension}`;
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: fileType || 'image/png',
    }));

    // Generate a presigned URL for accessing the image
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const viewUrl = await getSignedUrl(s3Client, command, { expiresIn: 86400 }); // 24 hours

    res.json({
      success: true,
      key,
      viewUrl
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image', message: error.message });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Strip heavy fields not needed by admin UI.
// canvasData is kept — it's plain JSON (positions/sizes), not base64. Editor needs it.
// Only assetsData (base64 image blobs) is stripped.
const stripHeavyFields = (obj) => {
  const { assetsData, ...light } = obj;
  if (Array.isArray(light.items)) {
    light.items = light.items.map(item => {
      if (!item || !item.design) return item;
      const { canvasData: _c, assetsData: _a, thumbnailUrl, fullExportUrl, ...lightDesign } = item.design;
      // Only keep thumbnailUrl/fullExportUrl if they are real URLs (not base64)
      if (thumbnailUrl && !thumbnailUrl.startsWith('data:')) lightDesign.thumbnailUrl = thumbnailUrl;
      if (fullExportUrl && !fullExportUrl.startsWith('data:')) lightDesign.fullExportUrl = fullExportUrl;
      return { ...item, design: lightDesign };
    });
  }
  return light;
};

// Get ALL orders from ALL customers (admin only, scoped to shopDomain)
router.get('/admin/orders', requireAdminKey, async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const cacheKey = `orders:${shopDomain || '*'}`;
    if (!req.query.fresh) {
      const cached = getAdminCache(cacheKey);
      if (cached) return res.json({ success: true, orders: cached, cached: true });
    }
    const objects = await listAllObjects('users/');

    const orderKeys = objects.filter(obj => obj.Key.includes('/orders/') && obj.Key.endsWith('.json'));

    const orders = [];
    for (const obj of orderKeys) {
      try {
        const getResponse = await s3Client.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
        }));
        const body = await streamToString(getResponse.Body);
        const parsed = stripHeavyFields(JSON.parse(body));
        const parts = obj.Key.split('/');
        parsed.customerId = parts[1];
        if (itemBelongsToShop(parsed, shopDomain)) {
          await refreshOrderItemThumbnails(parsed, parsed.customerId);
          orders.push(parsed);
        }
      } catch (e) {
        console.error('Error reading order:', obj.Key, e.message);
      }
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setAdminCache(cacheKey, orders);
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders', message: error.message });
  }
});

// Get ALL designs from ALL customers (admin only, scoped to shopDomain)
router.get('/admin/designs', requireAdminKey, async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const cacheKey = `designs:${shopDomain || '*'}`;
    if (!req.query.fresh) {
      const cached = getAdminCache(cacheKey);
      if (cached) return res.json({ success: true, designs: cached, cached: true });
    }
    const objects = await listAllObjects('users/');

    const designKeys = objects.filter(obj => obj.Key.includes('/designs/') && obj.Key.endsWith('.json'));

    const designs = [];
    for (const obj of designKeys) {
      try {
        const getResponse = await s3Client.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
        }));
        const body = await streamToString(getResponse.Body);
        const parsed = stripHeavyFields(JSON.parse(body));
        const parts = obj.Key.split('/');
        parsed.customerId = parts[1];
        // Refresh thumbnail presigned URL only if file exists in R2
        const thumbKey = `exports/${parsed.customerId}/${parsed.id}/thumbnail.png`;
        try {
          await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }));
          parsed.thumbnailUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }),
            { expiresIn: 86400 }
          );
        } catch { /* thumbnail.png not in R2 — thumbnailUrl from design JSON is used */ }
        // Refresh assetsMetadata viewUrls so Edit in Builder can load images
        if (parsed.assetsMetadata && typeof parsed.assetsMetadata === 'object') {
          await Promise.all(Object.entries(parsed.assetsMetadata).map(async ([, meta]) => {
            if (meta && meta.r2Key) {
              try {
                meta.viewUrl = await getSignedUrl(
                  s3Client,
                  new GetObjectCommand({ Bucket: BUCKET_NAME, Key: meta.r2Key }),
                  { expiresIn: 86400 }
                );
              } catch { /* skip */ }
            }
          }));
        }
        if (itemBelongsToShop(parsed, shopDomain)) designs.push(parsed);
      } catch (e) {
        console.error('Error reading design:', obj.Key, e.message);
      }
    }

    designs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setAdminCache(cacheKey, designs);
    res.json({ success: true, designs });
  } catch (error) {
    console.error('Error fetching all designs:', error);
    res.status(500).json({ error: 'Failed to fetch designs', message: error.message });
  }
});

// ==================== ADMIN CRUD ====================

// Admin: rename any customer's design
router.patch('/admin/designs/:customerId/:designId/name', requireAdminKey, async (req, res) => {
  try {
    const { customerId, designId } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

    const key = `users/${customerId}/designs/${designId}.json`;
    const getResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    const design = JSON.parse(await streamToString(getResponse.Body));

    design.name = name.trim();
    design.updatedAt = new Date().toISOString();

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME, Key: key,
      Body: JSON.stringify(design), ContentType: 'application/json',
    }));

    res.json({ success: true, designId, name: design.name });
  } catch (error) {
    console.error('Error renaming design (admin):', error);
    res.status(500).json({ error: 'Failed to rename design', message: error.message });
  }
});

// Admin: update any customer's order status
router.patch('/admin/orders/:customerId/:orderId/status', requireAdminKey, async (req, res) => {
  try {
    const { customerId, orderId } = req.params;
    const { status } = req.body;
    const key = `users/${customerId}/orders/${orderId}.json`;

    const getResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    const bodyContents = await streamToString(getResponse.Body);
    const order = JSON.parse(bodyContents);

    order.status = status;
    order.updatedAt = new Date().toISOString();

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME, Key: key,
      Body: JSON.stringify(order), ContentType: 'application/json',
    }));

    // Fire-and-forget email notification
    sendStatusEmail(order, status);

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating order status (admin):', error);
    res.status(500).json({ error: 'Failed to update order status', message: error.message });
  }
});

// Admin: update notes on any customer's order
router.patch('/admin/orders/:customerId/:orderId/notes', requireAdminKey, async (req, res) => {
  try {
    const { customerId, orderId } = req.params;
    const { notes } = req.body;
    const key = `users/${customerId}/orders/${orderId}.json`;

    const getResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    const order = JSON.parse(await streamToString(getResponse.Body));

    order.notes = (notes || '').trim();
    order.updatedAt = new Date().toISOString();

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME, Key: key,
      Body: JSON.stringify(order), ContentType: 'application/json',
    }));

    res.json({ success: true, orderId, notes: order.notes });
  } catch (error) {
    console.error('Error updating order notes (admin):', error);
    res.status(500).json({ error: 'Failed to update notes', message: error.message });
  }
});

// Admin: delete any customer's order
router.delete('/admin/orders/:customerId/:orderId', requireAdminKey, async (req, res) => {
  try {
    const { customerId, orderId } = req.params;
    const key = `users/${customerId}/orders/${orderId}.json`;
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    res.json({ success: true, orderId });
  } catch (error) {
    console.error('Error deleting order (admin):', error);
    res.status(500).json({ error: 'Failed to delete order', message: error.message });
  }
});

// Admin: delete any customer's design (JSON + all R2 export/asset files)
router.delete('/admin/designs/:customerId/:designId', requireAdminKey, async (req, res) => {
  try {
    const { customerId, designId } = req.params;
    const designKey = `users/${customerId}/designs/${designId}.json`;
    const exportsPrefix = `exports/${customerId}/${designId}/`;

    // List all export/asset files for this design
    const exportObjects = await listAllObjects(exportsPrefix);

    // Delete all export/asset files
    const deletePromises = exportObjects.map((obj) =>
      s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: obj.Key }))
    );
    // Delete design JSON
    deletePromises.push(s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: designKey })));

    await Promise.all(deletePromises);
    res.json({ success: true, designId, deletedAssets: exportObjects.length });
  } catch (error) {
    console.error('Error deleting design (admin):', error);
    res.status(500).json({ error: 'Failed to delete design', message: error.message });
  }
});

// Admin: cleanup heavy fields from all existing design files in R2
router.post('/admin/cleanup-designs', requireAdminKey, async (req, res) => {
  try {
    const objects = await listAllObjects('users/');

    const designKeys = objects.filter(obj => obj.Key.includes('/designs/') && obj.Key.endsWith('.json'));

    let cleaned = 0;
    let skipped = 0;
    for (const obj of designKeys) {
      try {
        const getResponse = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: obj.Key }));
        const body = await streamToString(getResponse.Body);
        const parsed = JSON.parse(body);
        if (!parsed.canvasData && !parsed.assetsData && !parsed.fullExportUrl) {
          skipped++;
          continue;
        }
        const { canvasData, assetsData, fullExportUrl, ...light } = parsed;
        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
          Body: JSON.stringify(light),
          ContentType: 'application/json',
        }));
        cleaned++;
      } catch (e) {
        console.error('Cleanup error for', obj.Key, e.message);
      }
    }

    res.json({ success: true, cleaned, skipped, total: designKeys.length });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed', message: error.message });
  }
});

// Admin: sweep abandoned carts. Any order still sitting in "In Cart" / "Created"
// (never paid) older than `days` (default 14) is moved to "Cancelled" so it stops
// polluting the order list and the abandoned-cart metrics. Non-destructive — the
// records stay, just re-labelled — and safe to run repeatedly.
router.post('/admin/cleanup-stale-orders', requireAdminKey, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.body?.days) || 14));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const shopDomain = getShopDomain(req);

    const objects = await listAllObjects('users/');
    const orderKeys = objects.filter(o => o.Key.includes('/orders/') && o.Key.endsWith('.json'));

    let cancelled = 0;
    let scanned = 0;
    for (const obj of orderKeys) {
      try {
        const order = JSON.parse(await streamToString(
          (await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: obj.Key }))).Body
        ));
        scanned++;
        if (!['In Cart', 'Created'].includes(order.status)) continue;
        if (shopDomain && !itemBelongsToShop(order, shopDomain)) continue;
        const createdMs = new Date(order.createdAt).getTime();
        if (!Number.isFinite(createdMs) || createdMs > cutoff) continue;

        order.status = 'Cancelled';
        order.updatedAt = new Date().toISOString();
        order.cancelledAt = new Date().toISOString();
        order.notes = [order.notes, `Auto-cancelled: abandoned > ${days} days`].filter(Boolean).join(' | ');
        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME, Key: obj.Key,
          Body: JSON.stringify(order), ContentType: 'application/json',
        }));
        cancelled++;
      } catch (e) {
        console.error('cleanup-stale-orders: failed for', obj.Key, e.message);
      }
    }

    invalidateAdminCache();
    res.json({ success: true, cancelled, scanned, days });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed', message: error.message });
  }
});

module.exports = router;
// Let other routers (e.g. the Shopify webhook handler, which writes order JSON
// directly) drop the admin list cache after they mutate storage.
module.exports.invalidateAdminCache = invalidateAdminCache;
