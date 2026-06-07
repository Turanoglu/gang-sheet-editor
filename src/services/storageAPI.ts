import type { GangSheetDesign, Order } from '../types/order';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Listen for customer data posted from Shopify parent window (iframe embedding)
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    const allowedOrigins = [
      'https://n9e1pw-qr.myshopify.com',
      'https://www.inkdyno.com',
      'https://inkdyno.com',
    ];
    if (!allowedOrigins.includes(event.origin)) return;
    if (event.data?.type !== 'SHOPIFY_CUSTOMER') return;
    const { customerId, customerEmail, customerName } = event.data;
    if (customerId) {
      localStorage.setItem('gang-sheet-customer-id', String(customerId));
      (window as any).__SHOPIFY_CUSTOMER_ID__ = String(customerId);
    }
    if (customerEmail) {
      localStorage.setItem('gang-sheet-customer-email', customerEmail);
    }
    if (customerName) {
      localStorage.setItem('gang-sheet-customer-name', customerName);
    }
    if (event.data.shopDomain) {
      localStorage.setItem('gang-sheet-shop-domain', event.data.shopDomain);
    }
  });
}

// Get customer ID from Shopify (will be passed from parent window when embedded)
export function getCustomerId(): string {
  // Check if embedded in Shopify and customer ID is available
  const shopifyCustomerId = (window as any).__SHOPIFY_CUSTOMER_ID__;
  if (shopifyCustomerId) {
    localStorage.setItem('gang-sheet-customer-id', shopifyCustomerId);
    return shopifyCustomerId;
  }

  // Check URL params (for testing or direct access)
  const urlParams = new URLSearchParams(window.location.search);
  const customerIdParam = urlParams.get('customerId');
  if (customerIdParam) {
    // Persist to localStorage so it survives navigation (e.g. to /admin)
    localStorage.setItem('gang-sheet-customer-id', customerIdParam);
    const emailParam = urlParams.get('customerEmail');
    if (emailParam) localStorage.setItem('gang-sheet-customer-email', emailParam);
    const nameParam = urlParams.get('customerName');
    if (nameParam) localStorage.setItem('gang-sheet-customer-name', nameParam);
    const shopDomainParam = urlParams.get('shopDomain');
    if (shopDomainParam) localStorage.setItem('gang-sheet-shop-domain', shopDomainParam);
    return customerIdParam;
  }

  // Check persisted customer ID (set from a previous page load with URL params)
  const savedCustomerId = localStorage.getItem('gang-sheet-customer-id');
  if (savedCustomerId) return savedCustomerId;

  // Fallback to anonymous session ID
  let sessionId = localStorage.getItem('gang-sheet-session-id');
  if (!sessionId) {
    sessionId = `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('gang-sheet-session-id', sessionId);
  }
  return sessionId;
}

export function getStoredCustomerId(): string {
  return localStorage.getItem('gang-sheet-customer-id') ||
         localStorage.getItem('gang-sheet-session-id') ||
         'anonymous';
}

export function getStoredCustomerEmail(): string | null {
  return localStorage.getItem('gang-sheet-customer-email');
}

export function getShopDomain(): string {
  try {
    return localStorage.getItem('gang-sheet-shop-domain') || '';
  } catch {
    return '';
  }
}

export function getCustomerName(): string {
  try {
    return localStorage.getItem('gang-sheet-customer-name') || '';
  } catch {
    return '';
  }
}

export function getCustomerEmail(): string {
  try {
    return localStorage.getItem('gang-sheet-customer-email') || '';
  } catch {
    return '';
  }
}

export function getCustomerInitials(): string {
  try {
    const name = getCustomerName().trim();
    if (name) {
      const parts = name.split(/\s+/);
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    // Fallback: use first char of email
    const email = getCustomerEmail();
    if (email) return email.charAt(0).toUpperCase();
    return 'GS';
  } catch {
    return 'GS';
  }
}

export function isAuthenticated(): boolean {
  // Shopify global variable (set by Liquid template)
  if ((window as any).__SHOPIFY_CUSTOMER_ID__) return true;
  // URL param passed from Shopify Liquid
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('customerId')) return true;
  // Previously stored real customer ID from a Shopify session
  return !!localStorage.getItem('gang-sheet-customer-id');
}

// Helper for fetch with customer ID header
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const customerId = getCustomerId();
  const shopDomain = getShopDomain();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Customer-Id': customerId,
      ...(shopDomain && { 'X-Shop-Domain': shopDomain }),
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

export async function getDesignFromCloud(designId: string, overrideCustomerId?: string): Promise<GangSheetDesign | null> {
  try {
    const url = `${API_BASE_URL}/api/storage/designs/${designId}`;
    const response = await (overrideCustomerId
      ? fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Customer-Id': overrideCustomerId,
          },
        })
      : fetchWithAuth(url));

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
  imageType: 'thumbnail' | 'full-export' | 'asset' = 'thumbnail',
  fileType: string = 'image/png',
  assetId?: string
): Promise<{ success: boolean; key: string; viewUrl: string }> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/storage/upload-image`, {
      method: 'POST',
      body: JSON.stringify({
        designId,
        imageData,
        imageType,
        fileType,
        ...(assetId && { assetId }),
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

// ==================== ADMIN API ====================

export async function getAdminOrdersFromCloud(adminKey: string, shopDomain?: string): Promise<Order[]> {
  const headers: Record<string, string> = { 'X-Admin-Key': adminKey };
  if (shopDomain) headers['X-Shop-Domain'] = shopDomain;
  const response = await fetch(`${API_BASE_URL}/api/storage/admin/orders`, { headers });
  if (response.status === 401) throw new Error('Unauthorized');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.orders || [];
}

export async function getAdminDesignsFromCloud(adminKey: string, shopDomain?: string): Promise<GangSheetDesign[]> {
  const headers: Record<string, string> = { 'X-Admin-Key': adminKey };
  if (shopDomain) headers['X-Shop-Domain'] = shopDomain;
  const response = await fetch(`${API_BASE_URL}/api/storage/admin/designs`, { headers });
  if (response.status === 401) throw new Error('Unauthorized');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.designs || [];
}

export async function updateAdminOrderStatus(
  customerId: string, orderId: string, status: string, adminKey: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/storage/admin/orders/${customerId}/${orderId}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ status }),
    }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function updateAdminOrderNotes(
  customerId: string, orderId: string, notes: string, adminKey: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/storage/admin/orders/${customerId}/${orderId}/notes`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ notes }),
    }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function deleteAdminOrder(
  customerId: string, orderId: string, adminKey: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/storage/admin/orders/${customerId}/${orderId}`,
    { method: 'DELETE', headers: { 'X-Admin-Key': adminKey } }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function deleteAdminDesign(
  customerId: string, designId: string, adminKey: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/storage/admin/designs/${customerId}/${designId}`,
    { method: 'DELETE', headers: { 'X-Admin-Key': adminKey } }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
