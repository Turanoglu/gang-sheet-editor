const express = require('express');
const crypto = require('crypto');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');

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

const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
};

// Verify Shopify HMAC signature
const verifyShopifyWebhook = (rawBody, hmacHeader) => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification');
    return true;
  }
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
};

// Update 'Created' orders → 'Ordered' for a given Shopify customer
const markOrdersAsPaid = async (customerId) => {
  const prefix = `users/${customerId}/orders/`;
  const listResponse = await s3Client.send(new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  }));

  const keys = (listResponse.Contents || []).filter(o => o.Key.endsWith('.json'));
  let updated = 0;

  for (const obj of keys) {
    try {
      const getRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: obj.Key }));
      const body = await streamToString(getRes.Body);
      const order = JSON.parse(body);

      if (order.status === 'Created') {
        order.status = 'Ordered';
        order.updatedAt = new Date().toISOString();
        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
          Body: JSON.stringify(order),
          ContentType: 'application/json',
        }));
        updated++;
        console.log(`Webhook: order ${order.id} → Ordered (customer ${customerId})`);
      }
    } catch (e) {
      console.error(`Webhook: failed to update order ${obj.Key}:`, e.message);
    }
  }

  return updated;
};

// POST /api/shopify/webhooks/orders-paid
// Raw body required for HMAC — this route is mounted before express.json()
router.post(
  '/webhooks/orders-paid',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];

    if (!hmacHeader) {
      console.warn('Shopify webhook: missing HMAC header');
      return res.status(401).json({ error: 'Missing HMAC header' });
    }

    if (!verifyShopifyWebhook(req.body, hmacHeader)) {
      console.warn('Shopify webhook: HMAC verification failed');
      return res.status(401).json({ error: 'HMAC verification failed' });
    }

    // Respond quickly — Shopify expects a 200 within 5 seconds
    res.status(200).json({ received: true });

    try {
      const payload = JSON.parse(req.body.toString());
      const customerId = String(payload?.customer?.id || '');

      if (!customerId) {
        console.warn('Shopify webhook: no customer.id in payload');
        return;
      }

      const updated = await markOrdersAsPaid(customerId);
      console.log(`Shopify orders/paid webhook: updated ${updated} order(s) for customer ${customerId}`);
    } catch (err) {
      console.error('Shopify webhook processing error:', err.message);
    }
  }
);

router.get('/test', (req, res) => {
  res.json({ message: 'Shopify routes active', configured: true });
});

module.exports = router;
