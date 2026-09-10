const express = require('express');
const crypto = require('crypto');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { sendStatusEmail } = require('./email');
const { invalidateAdminCache } = require('./storage');

const router = express.Router();

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
};

const readJson = async (Key) => {
  const res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key }));
  return JSON.parse(await streamToString(res.Body));
};

const writeJson = async (Key, value) => {
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key,
    Body: JSON.stringify(value),
    ContentType: 'application/json',
  }));
};

// ──────────────────────────────────────────────────────────────────────────────
// HMAC verification
// ──────────────────────────────────────────────────────────────────────────────
const verifyShopifyWebhook = (rawBody, hmacHeader) => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    // Never skip verification in production — an unverified webhook can move money-
    // adjacent state (order status, cancellations). Only tolerate a missing secret
    // in local/dev so the endpoint can be exercised without Shopify.
    if (IS_PRODUCTION) {
      console.error('SHOPIFY_WEBHOOK_SECRET not set in production — rejecting webhook');
      return false;
    }
    console.warn('SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification (dev only)');
    return true;
  }
  if (!hmacHeader || typeof hmacHeader !== 'string') return false;

  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(digest);
  let b;
  try { b = Buffer.from(hmacHeader, 'base64'); } catch { return false; }
  // timingSafeEqual throws on length mismatch — guard first, but still run the
  // comparison on equal-length buffers so timing stays constant for valid-shaped input.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// ──────────────────────────────────────────────────────────────────────────────
// Line-item ↔ R2 order reconciliation
//
// Checkout stamps each Shopify line item with hidden properties:
//   _gsOrderId     — the R2 order id  (users/<cid>/orders/<orderId>.json)
//   _gsCustomerId  — the R2 customer id (Shopify customer id, or a guest UUID)
//   _gsDesignId    — the R2 design id
// so a webhook updates exactly the orders that were actually purchased instead of
// every "Created" order the customer happens to have lying around.
// ──────────────────────────────────────────────────────────────────────────────
const propsToObject = (props) => {
  if (!props) return {};
  // Shopify sends line_item.properties as [{name, value}, ...]
  if (Array.isArray(props)) {
    return props.reduce((acc, p) => {
      if (p && p.name != null) acc[p.name] = p.value;
      return acc;
    }, {});
  }
  if (typeof props === 'object') return props;
  return {};
};

const collectLineItems = (payload) => {
  const out = [];
  if (Array.isArray(payload?.line_items)) out.push(...payload.line_items);
  // orders/refunded carries the refunded lines under refunds[].refund_line_items[].line_item
  if (Array.isArray(payload?.refunds)) {
    for (const refund of payload.refunds) {
      for (const rli of (refund.refund_line_items || [])) {
        if (rli && rli.line_item) out.push(rli.line_item);
      }
    }
  }
  return out;
};

// Returns a de-duplicated list of { key, customerId, orderId, designId }
const extractGsRefs = (payload) => {
  const seen = new Set();
  const refs = [];
  for (const li of collectLineItems(payload)) {
    const p = propsToObject(li?.properties);
    const orderId = p._gsOrderId;
    const customerId = p._gsCustomerId;
    if (!orderId || !customerId) continue;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(customerId))) continue;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(orderId))) continue;
    const key = `users/${customerId}/orders/${orderId}.json`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ key, customerId: String(customerId), orderId: String(orderId), designId: p._gsDesignId });
  }
  return refs;
};

const shopifyOrderFields = (payload) => ({
  shopifyOrderId: payload?.id,
  shopifyOrderName: payload?.name,
  shopifyOrderNumber: payload?.order_number,
  financialStatus: payload?.financial_status,
});

// Advance matched orders to a target status. `allowedFrom` gates which current
// statuses may transition (so we never knock a Completed order back to Ordered).
const applyToMatchedOrders = async (refs, { target, allowedFrom, extra = {}, emailStatus }) => {
  let updated = 0;
  for (const ref of refs) {
    try {
      const order = await readJson(ref.key);
      if (allowedFrom && !allowedFrom.includes(order.status)) continue;
      order.status = target;
      order.updatedAt = new Date().toISOString();
      Object.assign(order, extra);
      await writeJson(ref.key, order);
      updated++;
      console.log(`Webhook: order ${ref.orderId} → ${target} (customer ${ref.customerId})`);
      if (emailStatus) sendStatusEmail(order, emailStatus);
    } catch (e) {
      if (e.name === 'NoSuchKey') {
        console.warn(`Webhook: R2 order not found for ref ${ref.key}`);
      } else {
        console.error(`Webhook: failed to update ${ref.key}:`, e.message);
      }
    }
  }
  return updated;
};

// ──────────────────────────────────────────────────────────────────────────────
// Legacy fallback — only used for carts checked out before line-item stamping
// existed. Scoped to a single Shopify customer and, for safety, only touches
// orders created in the last 24h so an old abandoned "Created" order is left alone.
// ──────────────────────────────────────────────────────────────────────────────
const RECENT_MS = 24 * 60 * 60 * 1000;

const legacyUpdateByCustomer = async (customerId, { from, target, extra = {}, emailStatus }) => {
  if (!customerId) return 0;
  const prefix = `users/${customerId}/orders/`;
  const listResponse = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix }));
  const keys = (listResponse.Contents || []).filter(o => o.Key.endsWith('.json'));
  let updated = 0;
  for (const obj of keys) {
    try {
      const order = await readJson(obj.Key);
      if (!from.includes(order.status)) continue;
      const createdMs = new Date(order.createdAt).getTime();
      if (Number.isFinite(createdMs) && Date.now() - createdMs > RECENT_MS) continue;
      order.status = target;
      order.updatedAt = new Date().toISOString();
      Object.assign(order, extra);
      await writeJson(obj.Key, order);
      updated++;
      console.log(`Webhook (legacy): order ${order.id} → ${target} (customer ${customerId})`);
      if (emailStatus) sendStatusEmail(order, emailStatus);
    } catch (e) {
      console.error(`Webhook (legacy): failed for ${obj.Key}:`, e.message);
    }
  }
  return updated;
};

// ──────────────────────────────────────────────────────────────────────────────
// Idempotency — Shopify retries webhooks; a webhook id we've already processed
// for a given topic is a no-op. Small in-memory LRU is enough for one instance.
// ──────────────────────────────────────────────────────────────────────────────
const processedWebhooks = new Map(); // `${topic}:${webhookId}` -> ts
const WEBHOOK_DEDUPE_TTL = 60 * 60 * 1000;
const alreadyProcessed = (topic, id) => {
  if (!id) return false;
  const k = `${topic}:${id}`;
  const now = Date.now();
  for (const [key, ts] of processedWebhooks) {
    if (now - ts > WEBHOOK_DEDUPE_TTL) processedWebhooks.delete(key);
  }
  if (processedWebhooks.has(k)) return true;
  processedWebhooks.set(k, now);
  return false;
};

// ──────────────────────────────────────────────────────────────────────────────
// Route factory
// ──────────────────────────────────────────────────────────────────────────────
const webhookHandler = (topic, process) => [
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    if (!verifyShopifyWebhook(req.body, hmacHeader)) {
      console.warn(`Shopify webhook ${topic}: HMAC verification failed`);
      return res.status(401).json({ error: 'HMAC verification failed' });
    }

    // Respond fast — Shopify expects a 200 within 5s, then does the work async.
    res.status(200).json({ received: true });

    try {
      const payload = JSON.parse(req.body.toString());
      const webhookId = req.headers['x-shopify-webhook-id'];
      if (alreadyProcessed(topic, webhookId)) {
        console.log(`Shopify webhook ${topic}: duplicate ${webhookId} ignored`);
        return;
      }
      await process(payload);
      invalidateAdminCache?.();
    } catch (err) {
      console.error(`Shopify webhook ${topic} processing error:`, err.message);
    }
  },
];

// POST /api/shopify/webhooks/orders-paid
router.post('/webhooks/orders-paid', ...webhookHandler('orders/paid', async (payload) => {
  const refs = extractGsRefs(payload);
  const extra = { ...shopifyOrderFields(payload), paidAt: new Date().toISOString() };

  if (refs.length > 0) {
    const n = await applyToMatchedOrders(refs, {
      target: 'Ordered',
      allowedFrom: ['Draft', 'Created', 'In Cart'],
      extra,
      emailStatus: 'Ordered',
    });
    console.log(`orders/paid: matched ${refs.length} line ref(s), updated ${n} order(s)`);
    return;
  }

  const customerId = String(payload?.customer?.id || '');
  const n = await legacyUpdateByCustomer(customerId, {
    from: ['Created'], target: 'Ordered', extra, emailStatus: 'Ordered',
  });
  console.log(`orders/paid (legacy): updated ${n} order(s) for customer ${customerId}`);
}));

// POST /api/shopify/webhooks/orders-cancelled
router.post('/webhooks/orders-cancelled', ...webhookHandler('orders/cancelled', async (payload) => {
  const refs = extractGsRefs(payload);
  const extra = { ...shopifyOrderFields(payload), cancelledAt: new Date().toISOString() };

  if (refs.length > 0) {
    const n = await applyToMatchedOrders(refs, {
      target: 'Cancelled',
      allowedFrom: ['Draft', 'Created', 'In Cart', 'Ordered', 'Processing'],
      extra,
      emailStatus: 'Cancelled',
    });
    console.log(`orders/cancelled: updated ${n} order(s)`);
    return;
  }

  const customerId = String(payload?.customer?.id || '');
  const n = await legacyUpdateByCustomer(customerId, {
    from: ['Created', 'In Cart', 'Ordered', 'Processing'],
    target: 'Cancelled', extra, emailStatus: 'Cancelled',
  });
  console.log(`orders/cancelled (legacy): updated ${n} order(s) for customer ${customerId}`);
}));

// POST /api/shopify/webhooks/orders-refunded
router.post('/webhooks/orders-refunded', ...webhookHandler('orders/refunded', async (payload) => {
  const refs = extractGsRefs(payload);
  const isPartial = payload?.financial_status === 'partially_refunded';
  const extra = shopifyOrderFields(payload);

  if (refs.length === 0) {
    // No per-line refs on a refund we can't map — do nothing rather than cancel
    // unrelated orders. Full-order refunds still come through orders/cancelled.
    console.warn('orders/refunded: no _gsOrderId refs on refund line items — skipping');
    return;
  }

  if (isPartial) {
    // Only the refunded lines are represented in refs — cancel just those.
    const n = await applyToMatchedOrders(refs, {
      target: 'Cancelled',
      allowedFrom: ['Created', 'In Cart', 'Ordered', 'Processing'],
      extra: { ...extra, cancelledAt: new Date().toISOString() },
      emailStatus: 'Cancelled',
    });
    console.log(`orders/refunded (partial): cancelled ${n} refunded line(s)`);
  } else {
    const n = await applyToMatchedOrders(refs, {
      target: 'Cancelled',
      allowedFrom: ['Created', 'In Cart', 'Ordered', 'Processing'],
      extra: { ...extra, cancelledAt: new Date().toISOString() },
      emailStatus: 'Cancelled',
    });
    console.log(`orders/refunded: cancelled ${n} order(s)`);
  }
}));

router.get('/test', (req, res) => {
  res.json({ message: 'Shopify routes active', configured: !!process.env.SHOPIFY_WEBHOOK_SECRET });
});

module.exports = router;
