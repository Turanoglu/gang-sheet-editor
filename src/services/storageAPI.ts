import type { GangSheetDesign, Order } from '../types/order';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Get customer ID from Shopify (will be passed from parent window when embedded)
function getCustomerId(): string {
  // Check if embedded in Shopify and customer ID is available
  const shopifyCustomerId = (window as any).__SHOPIFY_CUSTOMER_ID__;
  if (shopifyCustomerId) {
    return shopifyCustomerId;
  }

  // Check URL params (for testing or direct access)
  const urlParams = new URLSearchParams(window.location.search);
  const customerIdParam = urlParams.get('customerId');
  if (customerIdParam) {
    return customerIdParam;
  }

  // Fallback to localStorage session ID for anonymous users
  let sessionId = localStorage.getItem('gang-sheet-session-id');
  if (!sessionId) {
    sessionId = `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('gang-sheet-session-id', sessionId);
  }
  return sessionId;
}

// Helper for fetch with customer ID header
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const customerId = getCustomerId();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Customer-Id': customerId,
      ...options.headers,
    },
  });
}

// ==================== DESIGNS ====================

export async function saveDesignToCloud(design: GangSheetDesign): Promise<{ success: boolean; designId: string }> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/designs`, {
      method: 'POST',
      body: JSON.stringify({ design }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to save design to cloud:', error);
    throw error;
  }
}

export async function getDesignsFromCloud(): Promise<GangSheetDesign[]> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/designs`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.designs || [];
  } catch (error) {
    console.error('Failed to fetch designs from cloud:', error);
    throw error;
  }
}

export async function getDesignFromCloud(designId: string): Promise<GangSheetDesign | null> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/designs/${designId}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.design;
  } catch (error) {
    console.error('Failed to fetch design from cloud:', error);
    throw error;
  }
}

export async function deleteDesignFromCloud(designId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/designs/${designId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to delete design from cloud:', error);
    throw error;
  }
}

// ==================== ORDERS ====================

export async function saveOrderToCloud(order: Order): Promise<{ success: boolean; orderId: string }> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/orders`, {
      method: 'POST',
      body: JSON.stringify({ order }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to save order to cloud:', error);
    throw error;
  }
}

export async function getOrdersFromCloud(): Promise<Order[]> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/orders`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.orders || [];
  } catch (error) {
    console.error('Failed to fetch orders from cloud:', error);
    throw error;
  }
}

export async function updateOrderStatusInCloud(
  orderId: string,
  status: string
): Promise<{ success: boolean; order: Order }> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to update order status in cloud:', error);
    throw error;
  }
}

export async function deleteOrderFromCloud(orderId: string): Promise<boolean> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/orders/${orderId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to delete order from cloud:', error);
    throw error;
  }
}

// ==================== IMAGES ====================

export async function uploadImageToCloud(
  designId: string,
  imageData: string,
  imageType: 'thumbnail' | 'full-export' = 'thumbnail',
  fileType: string = 'image/png'
): Promise<{ success: boolean; key: string; viewUrl: string }> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/upload-image`, {
      method: 'POST',
      body: JSON.stringify({
        designId,
        imageData,
        imageType,
        fileType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to upload image to cloud:', error);
    throw error;
  }
}

export async function getImageDownloadUrl(key: string): Promise<string> {
  try {
    const response = await fetchWithAuth(
      `${API_BASE_URL}/api/storage/download-url?key=${encodeURIComponent(key)}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.downloadUrl;
  } catch (error) {
    console.error('Failed to get image download URL:', error);
    throw error;
  }
}

// ==================== SYNC UTILITY ====================

export async function syncLocalToCloud(): Promise<{
  designsSynced: number;
  ordersSynced: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let designsSynced = 0;
  let ordersSynced = 0;

  try {
    // Get local data from localStorage
    const localData = localStorage.getItem('gang-sheet-orders');
    if (!localData) {
      return { designsSynced, ordersSynced, errors };
    }

    const parsed = JSON.parse(localData);
    const state = parsed.state || parsed;

    // Sync designs
    if (state.designs && Array.isArray(state.designs)) {
      for (const design of state.designs) {
        try {
          await saveDesignToCloud(design);
          designsSynced++;
        } catch (err) {
          errors.push(`Failed to sync design ${design.id}: ${err}`);
        }
      }
    }

    // Sync orders
    if (state.orders && Array.isArray(state.orders)) {
      for (const order of state.orders) {
        try {
          await saveOrderToCloud(order);
          ordersSynced++;
        } catch (err) {
          errors.push(`Failed to sync order ${order.id}: ${err}`);
        }
      }
    }
  } catch (error) {
    errors.push(`Sync failed: ${error}`);
  }

  return { designsSynced, ordersSynced, errors };
}
