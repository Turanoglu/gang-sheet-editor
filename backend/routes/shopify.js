const express = require('express');
const router = express.Router();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_products', 'write_orders'],
  hostName: process.env.HOST?.replace('http://', '').replace('https://', '') || 'localhost:3000',
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

// Helper function to create Shopify session
const createShopifySession = () => {
  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN in environment variables');
  }

  const session = shopify.session.customAppSession(process.env.SHOPIFY_STORE_URL);
  session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  return session;
};

// Helper function to create GraphQL client
const createGraphQLClient = () => {
  const session = createShopifySession();
  return new shopify.clients.Graphql({ session });
};

// Test endpoint
router.get('/test', (req, res) => {
  const isConfigured = !!(
    process.env.SHOPIFY_API_KEY &&
    process.env.SHOPIFY_API_SECRET &&
    process.env.SHOPIFY_STORE_URL &&
    process.env.SHOPIFY_ACCESS_TOKEN !== 'YOUR_ACCESS_TOKEN_HERE'
  );

  res.json({
    message: 'Shopify API routes working',
    configured: isConfigured,
    storeUrl: process.env.SHOPIFY_STORE_URL || 'Not configured'
  });
});

// Create order endpoint
router.post('/orders', async (req, res) => {
  try {
    const { items, customer, totalPrice } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items provided'
      });
    }

    const client = createGraphQLClient();

    // Prepare line items for Shopify
    const lineItems = items.map(item => ({
      title: item.design?.name || 'Gang Sheet Design',
      quantity: item.quantity || 1,
      originalUnitPrice: (item.pricePerUnit || totalPrice / items.length).toFixed(2),
      requiresShipping: true
    }));

    // Create draft order mutation
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            totalPrice
            lineItems(first: 10) {
              edges {
                node {
                  title
                  quantity
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lineItems: lineItems,
        email: customer?.email || '',
        note: 'Gang Sheet Editor Order',
        tags: ['gang-sheet', 'dtf-printing']
      }
    };

    const response = await client.request(mutation, { variables });

    if (response.data.draftOrderCreate.userErrors.length > 0) {
      throw new Error(response.data.draftOrderCreate.userErrors[0].message);
    }

    res.json({
      success: true,
      message: 'Draft order created successfully in Shopify',
      order: response.data.draftOrderCreate.draftOrder
    });
  } catch (error) {
    console.error('Error creating Shopify order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get products endpoint
router.get('/products', async (req, res) => {
  try {
    const client = createGraphQLClient();

    const query = `
      query {
        products(first: 10) {
          edges {
            node {
              id
              title
              description
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await client.request(query);

    const products = response.data.products.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      description: edge.node.description,
      price: edge.node.variants.edges[0]?.node.price || '0'
    }));

    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single product
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = createGraphQLClient();

    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          description
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
              }
            }
          }
        }
      }
    `;

    const response = await client.request(query, {
      variables: { id: `gid://shopify/Product/${id}` }
    });

    res.json({
      success: true,
      product: response.data.product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
