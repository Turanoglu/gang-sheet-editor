import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { CartStore, GangSheetDesign, CartItem } from '../types/order';
import { getPriceForBoard } from '../types/order';

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addToCart: (design: GangSheetDesign, quantity: number) => {
        const price = getPriceForBoard(design.boardSize.width, design.boardSize.height);
        
        const newItem: CartItem = {
          id: uuidv4(),
          designId: design.id,
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
    }
  )
);


