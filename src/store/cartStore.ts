import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { CartStore, GangSheetDesign, CartItem } from '../types/order';
import { getPriceForBoard } from '../types/order';

// Safe localStorage wrapper: clears the key and retries if QuotaExceededError
const safeStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try { return localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch (e) {
      if (e instanceof Error && (e.name === 'QuotaExceededError' || e.message.includes('quota'))) {
        console.warn('[cartStore] localStorage quota exceeded, clearing and retrying...');
        try { localStorage.removeItem(name); } catch {}
        try { localStorage.setItem(name, value); } catch {}
      }
    }
  },
  removeItem: (name: string) => {
    try { localStorage.removeItem(name); } catch {}
  },
}));

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addToCart: (design: GangSheetDesign, quantity: number, orderId?: string) => {
        const price = getPriceForBoard(design.boardSize.width, design.boardSize.height);

        const newItem: CartItem = {
          id: uuidv4(),
          designId: design.id,
          orderId,
          design,
          quantity,
          pricePerUnit: price,
          addedAt: new Date(),
        };

        set((state) => ({
          items: [...state.items, newItem],
          isOpen: true, // Open cart when adding
        }));
      },

      removeFromCart: (itemId: string) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== itemId),
        }));
      },

      updateQuantity: (itemId: string, quantity: number) => {
        if (quantity < 1) return;
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId ? { ...item, quantity } : item
          ),
        }));
      },

      clearCart: () => {
        set({ items: [] });
      },

      getTotal: () => {
        const { items } = get();
        return items.reduce((total, item) => total + item.pricePerUnit * item.quantity, 0);
      },

      getItemCount: () => {
        const { items } = get();
        return items.reduce((count, item) => count + item.quantity, 0);
      },

      toggleCart: () => {
        set((state) => ({ isOpen: !state.isOpen }));
      },

      openCart: () => {
        set({ isOpen: true });
      },

      closeCart: () => {
        set({ isOpen: false });
      },
    }),
    {
      name: 'gang-sheet-cart',
      storage: safeStorage,
      // Strip heavy base64 fields before saving to localStorage (prevents quota exceeded errors)
      partialize: (state) => ({
        isOpen: state.isOpen,
        items: state.items.map((item) => ({
          ...item,
          design: {
            ...item.design,
            thumbnailUrl: '',      // base64 thumbnail - too large to persist
            fullExportUrl: '',     // base64 full export - too large to persist
            canvasData: '',        // canvas JSON - regenerated from R2 when needed
            assetsData: '',        // assets JSON - regenerated from R2 when needed
          },
        })),
      }),
    }
  )
);


