import type { CartItem } from '../types/order';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export interface ShopifyOrderResponse {
  success: boolean;
  message?: string;
  order?: {
    id: string;
    name: string;
    totalPrice: string;
  };
  error?: string;
}

export interface ShopifyTestResponse {
  message: string;
  configured: boolean;
  storeUrl: string;
}

/**
 * Test Shopify API connection
 */
export async function testShopifyConnection(): Promise<ShopifyTestResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/shopify/test`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to test Shopify connection:', error);
    throw error;
  }
}

/**
 * Create draft order in Shopify
 */
export async function createShopifyOrder(
  cartItems: CartItem[],
  customerEmail?: string
): Promise<ShopifyOrderResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/shopify/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: cartItems,
        customer: {
          email: customerEmail || 'guest@example.com',
        },
        totalPrice: cartItems.reduce(
          (total, item) => total + item.pricePerUnit * item.quantity,
          0
        ),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to create Shopify order:', error);
    throw error;
  }
}

/**
 * Get products from Shopify (optional - for future use)
 */
export async function getShopifyProducts() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/shopify/products`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch Shopify products:', error);
    throw error;
  }
}
