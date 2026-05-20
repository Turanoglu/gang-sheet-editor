require('dotenv').config();
const express = require('express');
const cors = require('cors');
const storageRoutes = require('./routes/storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify webhook route needs raw body for HMAC verification — mount BEFORE express.json()
const shopifyRoutes = require('./routes/shopify');
app.use('/api/shopify', shopifyRoutes);

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://gang-sheet-editor.vercel.app',
  'https://gang-sheet-test1.myshopify.com',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow any myshopify.com or shopify.com subdomain
    if (origin.endsWith('.myshopify.com') || origin.endsWith('.shopify.com')) {
      return callback(null, true);
    }
    callback(new Error('CORS not allowed: ' + origin));
  },
  credentials: true
}));
// Increase payload limit for large images (Base64 encoded)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Routes
app.use('/api/storage', storageRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on ${process.env.HOST || `http://localhost:${PORT}`}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL}`);
});
