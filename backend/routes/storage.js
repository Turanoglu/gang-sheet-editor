const express = require('express');
const router = express.Router();
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
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
const getCustomerId = (req) => {
  return req.headers['x-shopify-customer-id'] ||
         req.query.customerId ||
         req.body?.customerId ||
         'anonymous';
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

// Admin auth middleware
const requireAdminKey = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.ADMIN_SECRET_KEY) {
    return res.status(500).json({ error: 'Admin key not configured on server' });
  }
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Helper: Convert stream to string
const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
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

    const listResponse = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    }));

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return res.json({ designs: [] });
    }

    // Fetch each design and refresh thumbnail URL
    const designs = await Promise.all(
      listResponse.Contents.map(async (obj) => {
        try {
          const getResponse = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key,
          }));
          const bodyContents = await streamToString(getResponse.Body);
          const design = JSON.parse(bodyContents);
          // Regenerate fresh presigned thumbnail URL (original expires after 24h)
          const thumbKey = `exports/${customerId}/${design.id}/thumbnail.png`;
          try {
            design.thumbnailUrl = await getSignedUrl(
              s3Client,
              new GetObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }),
              { expiresIn: 86400 }
            );
          } catch { /* keep existing url if key generation fails */ }
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
    const { canvasData, assetsData, items, ...lightOrder } = order;
    const orderToSave = shopDomain ? { ...lightOrder, shopDomain } : lightOrder;

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

    const listResponse = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    }));

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return res.json({ orders: [] });
    }

    const orders = await Promise.all(
      listResponse.Contents.map(async (obj) => {
        try {
          const getResponse = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key,
          }));
          const bodyContents = await streamToString(getResponse.Body);
          return JSON.parse(bodyContents);
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

// Update order status
router.patch('/orders/:orderId/status', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { orderId } = req.params;
    const { status } = req.body;
    const key = `users/${customerId}/orders/${orderId}.json`;

    // Get existing order
    const getResponse = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    const bodyContents = await streamToString(getResponse.Body);
    const order = JSON.parse(bodyContents);

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

// Delete an order
router.delete('/orders/:orderId', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { orderId } = req.params;
    const key = `users/${customerId}/orders/${orderId}.json`;

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

// Get presigned URL for uploading an image
router.post('/upload-url', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { designId, fileType, imageType } = req.body;

    if (!designId || !fileType) {
      return res.status(400).json({ error: 'designId and fileType are required' });
    }

    // imageType: 'thumbnail' or 'full-export'
    const extension = fileType.split('/')[1] || 'png';
    const filename = imageType === 'thumbnail' ? 'thumbnail' : 'full-export';
    const key = `exports/${customerId}/${designId}/${filename}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.json({
      uploadUrl,
      key,
      publicUrl: `https://${BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL', message: error.message });
  }
});

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

// Get presigned URL for downloading/viewing an image
router.get('/download-url', async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.json({ downloadUrl });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL', message: error.message });
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
    const listResponse = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'users/',
      MaxKeys: 2000,
    }));

    const orderKeys = (listResponse.Contents || [])
      .filter(obj => obj.Key.includes('/orders/') && obj.Key.endsWith('.json'));

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
        if (itemBelongsToShop(parsed, shopDomain)) orders.push(parsed);
      } catch (e) {
        console.error('Error reading order:', obj.Key, e.message);
      }
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    const listResponse = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'users/',
      MaxKeys: 2000,
    }));

    const designKeys = (listResponse.Contents || [])
      .filter(obj => obj.Key.includes('/designs/') && obj.Key.endsWith('.json'));

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
        // Refresh thumbnail presigned URL
        const thumbKey = `exports/${parsed.customerId}/${parsed.id}/thumbnail.png`;
        try {
          parsed.thumbnailUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: thumbKey }),
            { expiresIn: 86400 }
          );
        } catch { /* keep existing */ }
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
    res.json({ success: true, designs });
  } catch (error) {
    console.error('Error fetching all designs:', error);
    res.status(500).json({ error: 'Failed to fetch designs', message: error.message });
  }
});

// ==================== ADMIN CRUD ====================

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

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating order status (admin):', error);
    res.status(500).json({ error: 'Failed to update order status', message: error.message });
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
    const listResp = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: exportsPrefix,
    }));

    // Delete all export/asset files
    const deletePromises = (listResp.Contents || []).map((obj) =>
      s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: obj.Key }))
    );
    // Delete design JSON
    deletePromises.push(s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: designKey })));

    await Promise.all(deletePromises);
    res.json({ success: true, designId, deletedAssets: (listResp.Contents || []).length });
  } catch (error) {
    console.error('Error deleting design (admin):', error);
    res.status(500).json({ error: 'Failed to delete design', message: error.message });
  }
});

// Admin: cleanup heavy fields from all existing design files in R2
router.post('/admin/cleanup-designs', requireAdminKey, async (req, res) => {
  try {
    const listResponse = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'users/',
      MaxKeys: 2000,
    }));

    const designKeys = (listResponse.Contents || [])
      .filter(obj => obj.Key.includes('/designs/') && obj.Key.endsWith('.json'));

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

module.exports = router;
