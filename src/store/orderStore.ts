import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { OrderStore, GangSheetDesign, Order, OrderStatus, CartItem } from '../types/order';

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
      // Try to clear old thumbnails from designs to free space
      try {
        const data = JSON.parse(localStorage.getItem(name) || '{}');
        if (data.state?.designs) {
          // Keep only recent 10 designs and remove thumbnails from older ones
          data.state.designs = data.state.designs.slice(-10).map((d: GangSheetDesign) => ({
            ...d,
            thumbnailUrl: '', // Clear thumbnails to save space
            fullExportUrl: '',
          }));
          localStorage.setItem(name, JSON.stringify(data));
        }
      } catch {
        // If still failing, clear the storage entirely
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

export const useOrderStore = create<OrderStore>()(
  persist(
    (set, get) => ({
      orders: [],
      designs: [],
      currentDesign: null,

      // Designs
      saveDesign: (design: GangSheetDesign) => {
        set((state) => {
          // Limit to 50 designs max to prevent storage overflow
          let newDesigns = [...state.designs];
          
          // Check if design already exists
          const existingIndex = newDesigns.findIndex((d) => d.id === design.id);
          if (existingIndex >= 0) {
            newDesigns[existingIndex] = { ...design, updatedAt: new Date() };
          } else {
            newDesigns.push(design);
          }
          
          // Keep only last 50 designs
          if (newDesigns.length > 50) {
            newDesigns = newDesigns.slice(-50);
          }
          
          return { designs: newDesigns };
        });
      },

      updateDesign: (id: string, updates: Partial<GangSheetDesign>) => {
        set((state) => ({
          designs: state.designs.map((design) =>
            design.id === id
              ? { ...design, ...updates, updatedAt: new Date() }
              : design
          ),
        }));
      },

      deleteDesign: (id: string) => {
        set((state) => ({
          designs: state.designs.filter((design) => design.id !== id),
        }));
      },

      setCurrentDesign: (design: GangSheetDesign | null) => {
        set({ currentDesign: design });
      },

      // Orders
      createOrder: (customerName: string, cartItems: CartItem[]): Order => {
        const totalAmount = cartItems.reduce(
          (total, item) => total + item.pricePerUnit * item.quantity,
          0
        );

        const order: Order = {
          id: uuidv4(),
          orderNumber: generateOrderNumber(),
          customerName,
          items: cartItems,
          status: 'Created',
          totalAmount,
          createdAt: new Date(),
          updatedAt: new Date(),
          product: 'Gang Sheet',
        };

        set((state) => ({
          orders: [order, ...state.orders],
        }));

        return order;
      },

      updateOrderStatus: (orderId: string, status: OrderStatus) => {
        set((state) => ({
          orders: state.orders.map((order) =>
            order.id === orderId
              ? { ...order, status, updatedAt: new Date() }
              : order
          ),
        }));
      },

      deleteOrder: (orderId: string) => {
        set((state) => ({
          orders: state.orders.filter((order) => order.id !== orderId),
        }));
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
        designs: state.designs,
      }),
    }
  )
);

