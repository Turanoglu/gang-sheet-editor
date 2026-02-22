require('dotenv').config();
const express = require('express');
const cors = require('cors');
const shopifyRoutes = require('./routes/shopify');
const storageRoutes = require('./routes/storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
// Increase payload limit for large images (Base64 encoded)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/shopify', shopifyRoutes);
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
