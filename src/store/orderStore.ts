import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { OrderStore, GangSheetDesign, Order, OrderStatus, CartItem } from '../types/order';
import {
  saveDesignToCloud,
  getDesignsFromCloud,
  deleteDesignFromCloud,
  saveOrderToCloud,
  getOrdersFromCloud,
  updateOrderStatusInCloud,
  deleteOrderFromCloud,
  uploadImageToCloud,
  getStoredCustomerId,
} from '../services/storageAPI';

const LAST_CUSTOMER_KEY = 'gang-sheet-last-customer-id';

// Generate order number
function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `#${timestamp}${random}`;
}

// Custom storage with error handling for quota exceeded
const safeLocalStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      console.warn('Failed to read from localStorage');
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.warn('Failed to write to localStorage (quota exceeded). Clearing old data...');
      try {
        const data = JSON.parse(localStorage.getItem(name) || '{}');
        if (data.state?.designs) {
          data.state.designs = data.state.designs.slice(-10).map((d: GangSheetDesign) => ({
            ...d,
            thumbnailUrl: '',
            fullExportUrl: '',
          }));
          localStorage.setItem(name, JSON.stringify(data));
        }
      } catch {
        localStorage.removeItem(name);
        console.warn('Cleared localStorage to free space');
      }
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      console.warn('Failed to remove from localStorage');
    }
  },
}));

// Extended store interface with cloud sync
interface ExtendedOrderStore extends OrderStore {
  isCloudSyncing: boolean;
  cloudSyncError: string | null;
  lastCloudSync: Date | null;
  loadFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<void>;
}

export const useOrderStore = create<ExtendedOrderStore>()(
  persist(
    (set, get) => ({
      orders: [],
      designs: [],
      currentDesign: null,
      isCloudSyncing: false,
      cloudSyncError: null,
      lastCloudSync: null,

      // Load data from cloud (call on app init)
      loadFromCloud: async () => {
        const currentCustomerId = getStoredCustomerId();
        localStorage.getItem(LAST_CUSTOMER_KEY); // read to preserve migration history, value unused intentionally
        localStorage.setItem(LAST_CUSTOMER_KEY, currentCustomerId);

        // If customer changed (anon → logged-in), keep local designs/orders in memory.
        // The cloud sync below detects them as local-only and re-saves under the new
        // customer ID, migrating anon data automatically.

        // Cross-tab sync: merge localStorage state into in-memory state.
        // This handles orders created in another tab (e.g. editor tab) that are
        // not yet in this tab's in-memory store.
        try {
          const persisted = localStorage.getItem('gang-sheet-orders');
          if (persisted) {
            const parsed = JSON.parse(persisted);
            const persistedOrders: Order[] = parsed.state?.orders || [];
            const persistedDesigns: GangSheetDesign[] = parsed.state?.designs || [];
            const currentOrderIds = new Set(get().orders.map(o => o.id));
            const currentDesignIds = new Set(get().designs.map(d => d.id));
            const extraOrders = persistedOrders.filter(o => !currentOrderIds.has(o.id));
            const extraDesigns = persistedDesigns.filter(d => !currentDesignIds.has(d.id));
            if (extraOrders.length > 0 || extraDesigns.length > 0) {
              set(state => ({
                orders: [...state.orders, ...extraOrders],
                designs: [...state.designs, ...extraDesigns],
              }));
            }
          }
        } catch {
          // Silent fail — localStorage read errors must not break cloud sync
        }

        set({ isCloudSyncing: true, cloudSyncError: null });
        try {
          const [cloudDesigns, cloudOrders] = await Promise.all([
            getDesignsFromCloud(),
            getOrdersFromCloud(),
          ]);

          // Merge cloud data with local (cloud takes priority)
          const localDesigns = get().designs;
          const localOrders = get().orders;

          // Create maps for quick lookup
          const cloudDesignMap = new Map(cloudDesigns.map(d => [d.id, d]));
          const cloudOrderMap = new Map(cloudOrders.map(o => [o.id, o]));

          // Merge: cloud overwrites local, keep local-only items for sync
          const mergedDesigns = [...cloudDesigns];
          const localOnlyDesigns = localDesigns.filter(d => !cloudDesignMap.has(d.id));

          const mergedOrders = [...cloudOrders];
          const localOnlyOrders = localOrders.filter(o => !cloudOrderMap.has(o.id));

          // Sync local-only items to cloud
          for (const design of localOnlyDesigns) {
            try {
              await saveDesignToCloud(design);
              mergedDesigns.push(design);
            } catch (err) {
              console.warn('Failed to sync local design to cloud:', err);
              mergedDesigns.push(design); // Keep locally anyway
            }
          }

          for (const order of localOnlyOrders) {
            try {
              await saveOrderToCloud(order);
              mergedOrders.push(order);
            } catch (err) {
              console.warn('Failed to sync local order to cloud:', err);
              mergedOrders.push(order);
            }
          }

          set({
            designs: mergedDesigns,
            orders: mergedOrders,
            isCloudSyncing: false,
            lastCloudSync: new Date(),
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Cloud sync failed';
          const isNetworkError = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch');
          if (isNetworkError) {
            // Backend is likely sleeping (Render free tier) — don't show error, retry silently
            console.warn('Cloud sync: backend unreachable, will retry in 15s');
            set({ isCloudSyncing: false });
            setTimeout(() => {
              useOrderStore.getState().loadFromCloud();
            }, 15000);
          } else {
            console.error('Failed to load from cloud:', error);
            set({ isCloudSyncing: false, cloudSyncError: msg });
          }
        }
      },

      // Manual sync trigger
      syncToCloud: async () => {
        const { designs, orders } = get();
        set({ isCloudSyncing: true, cloudSyncError: null });

        try {
          await Promise.all([
            ...designs.map(d => saveDesignToCloud(d)),
            ...orders.map(o => saveOrderToCloud(o)),
          ]);

          set({
            isCloudSyncing: false,
            lastCloudSync: new Date(),
          });
        } catch (error) {
          console.error('Failed to sync to cloud:', error);
          set({
            isCloudSyncing: false,
            cloudSyncError: error instanceof Error ? error.message : 'Cloud sync failed',
          });
        }
      },

      // Designs
      saveDesign: async (design: GangSheetDesign) => {
        // Update local state immediately
        set((state) => {
          let newDesigns = [...state.designs];
          const existingIndex = newDesigns.findIndex((d) => d.id === design.id);
          if (existingIndex >= 0) {
            newDesigns[existingIndex] = { ...design, updatedAt: new Date() };
          } else {
            newDesigns.push(design);
          }
          if (newDesigns.length > 50) {
            newDesigns = newDesigns.slice(-50);
          }
          return { designs: newDesigns };
        });

        // Sync to cloud in background
        try {
          // Upload images to R2 if they exist
          let cloudDesign = { ...design };

          if (design.thumbnailUrl && design.thumbnailUrl.startsWith('data:')) {
            try {
              const result = await uploadImageToCloud(design.id, design.thumbnailUrl, 'thumbnail');
              cloudDesign.thumbnailUrl = result.viewUrl;
            } catch (err) {
              console.warn('Failed to upload thumbnail:', err);
            }
          }

          if (design.fullExportUrl && design.fullExportUrl.startsWith('data:')) {
            try {
              const result = await uploadImageToCloud(design.id, design.fullExportUrl, 'full-export');
              cloudDesign.fullExportUrl = result.viewUrl;
            } catch (err) {
              console.warn('Failed to upload full export:', err);
            }
          }

          await saveDesignToCloud(cloudDesign);

          // Replace base64 with cloud URLs in local state to avoid localStorage quota issues
          set((state) => ({
            designs: state.designs.map((d) =>
              d.id === design.id
                ? { ...d, thumbnailUrl: cloudDesign.thumbnailUrl, fullExportUrl: cloudDesign.fullExportUrl }
                : d
            ),
          }));
        } catch (error) {
          console.error('Failed to save design to cloud:', error);
          set({ cloudSyncError: 'Failed to save design to cloud' });
        }
      },

      updateDesign: async (id: string, updates: Partial<GangSheetDesign>) => {
        // Update local state immediately
        set((state) => ({
          designs: state.designs.map((design) =>
            design.id === id
              ? { ...design, ...updates, updatedAt: new Date() }
              : design
          ),
        }));

        // Sync to cloud
        const design = get().designs.find(d => d.id === id);
        if (design) {
          try {
            await saveDesignToCloud(design);
          } catch (error) {
            console.error('Failed to update design in cloud:', error);
          }
        }
      },

      deleteDesign: async (id: string) => {
        // Delete locally immediately
        set((state) => ({
          designs: state.designs.filter((design) => design.id !== id),
        }));

        // Delete from cloud
        try {
          await deleteDesignFromCloud(id);
        } catch (error) {
          console.error('Failed to delete design from cloud:', error);
        }
      },

      setCurrentDesign: (design: GangSheetDesign | null) => {
        set({ currentDesign: design });
      },

      // Orders
      createOrder: (customerName: string, cartItems: CartItem[], initialStatus: OrderStatus = 'In Cart'): Order => {
        const totalAmount = cartItems.reduce(
          (total, item) => total + item.pricePerUnit * item.quantity,
          0
        );

        const order: Order = {
          id: uuidv4(),
          orderNumber: generateOrderNumber(),
          customerName,
          items: cartItems,
          status: initialStatus,
          totalAmount,
          createdAt: new Date(),
          updatedAt: new Date(),
          product: 'GangFlow',
        };

        // Update local state
        set((state) => ({
          orders: [order, ...state.orders],
        }));

        // Sync to cloud
        saveOrderToCloud(order).catch(error => {
          console.error('Failed to save order to cloud:', error);
        });

        return order;
      },

      updateOrderStatus: async (orderId: string, status: OrderStatus) => {
        // Update locally
        set((state) => ({
          orders: state.orders.map((order) =>
            order.id === orderId
              ? { ...order, status, updatedAt: new Date() }
              : order
          ),
        }));

        // Sync to cloud
        try {
          await updateOrderStatusInCloud(orderId, status);
        } catch (error) {
          console.error('Failed to update order status in cloud:', error);
        }
      },

      deleteOrder: async (orderId: string) => {
        // Delete locally
        set((state) => ({
          orders: state.orders.filter((order) => order.id !== orderId),
        }));

        // Delete from cloud
        try {
          await deleteOrderFromCloud(orderId);
        } catch (error) {
          console.error('Failed to delete order from cloud:', error);
        }
      },

      getOrdersByStatus: (status: OrderStatus): Order[] => {
        const { orders } = get();
        return orders.filter((order) => order.status === status);
      },
    }),
    {
      name: 'gang-sheet-orders',
      storage: safeLocalStorage,
      partialize: (state) => ({
        orders: state.orders,
        // Strip large base64 fields — they are stored in R2 cloud, not localStorage
        designs: state.designs.map(({ canvasData: _c, assetsData: _a, thumbnailUrl: _t, fullExportUrl: _f, ...d }) => d),
      }),
    }
  )
);

// Initialize cloud sync on module load
if (typeof window !== 'undefined') {
  // Delay cloud sync to not block initial render
  setTimeout(() => {
    useOrderStore.getState().loadFromCloud();
  }, 1000);
}
