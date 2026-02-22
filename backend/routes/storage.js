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
  // Customer ID can come from header, query, or body
  return req.headers['x-shopify-customer-id'] ||
         req.query.customerId ||
         req.body?.customerId ||
         'anonymous';
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
    const { design } = req.body;

    if (!design || !design.id) {
      return res.status(400).json({ error: 'Design data with ID is required' });
    }

    const key = `users/${customerId}/designs/${design.id}.json`;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(design),
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

    // Fetch each design
    const designs = await Promise.all(
      listResponse.Contents.map(async (obj) => {
        try {
          const getResponse = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key,
          }));
          const bodyContents = await streamToString(getResponse.Body);
          return JSON.parse(bodyContents);
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
    res.json({ design: JSON.parse(bodyContents) });
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
    const { order } = req.body;

    if (!order || !order.id) {
      return res.status(400).json({ error: 'Order data with ID is required' });
    }

    const key = `users/${customerId}/orders/${order.id}.json`;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(order),
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
    const { designId, imageData, imageType, fileType } = req.body;

    if (!designId || !imageData) {
      return res.status(400).json({ error: 'designId and imageData are required' });
    }

    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const extension = fileType?.split('/')[1] || 'png';
    const filename = imageType === 'thumbnail' ? 'thumbnail' : 'full-export';
    const key = `exports/${customerId}/${designId}/${filename}.${extension}`;

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

module.exports = router;
