const express = require('express');
const router = express.Router();

// Shopify cart işlemleri liquid template üzerinden yapılıyor
router.get('/test', (req, res) => {
  res.json({ message: 'Shopify routes active', configured: true });
});

module.exports = router;
