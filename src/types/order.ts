// Order and Cart Types

export type OrderStatus = 'Draft' | 'Created' | 'In Cart' | 'Ordered' | 'Processing' | 'Completed' | 'Cancelled';

export interface GangSheetDesign {
  id: string;
  name: string;
  boardSize: {
    width: number;
    height: number;
    label: string;
  };
  imageCount: number;
  createdAt: Date;
  updatedAt: Date;
  thumbnailUrl: string; // Base64 - low res thumbnail for preview
  fullExportUrl?: string; // Base64 - full resolution export for download
  canvasData: string; // JSON string of canvas items
  assetsData: string; // JSON string of assets
  customerId?: string; // Attached by admin endpoints
}

export interface CartItem {
  id: string;
  designId: string;
  design: GangSheetDesign;
  quantity: number;
  pricePerUnit: number;
  addedAt: Date;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  items: CartItem[];
  status: OrderStatus;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
  product: string;
  customerId?: string; // Attached by admin endpoints
}

// Price calculation based on board size
export const BOARD_PRICES: Record<string, number> = {
  '22x24': 18.99,
  '22x36': 29.99,
  '22x48': 34.99,
  '22x60': 39.99,
  '22x84': 49.99,
  '22x108': 59.99,
  '22x120': 69.99,
  '22x180': 89.99,
  '22x240': 119.99,
};

export function getPriceForBoard(width: number, height: number): number {
  const key = `${width}x${height}`;
  return BOARD_PRICES[key] || 29.99;
}

// Cart State
export interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

export interface CartActions {
  addToCart: (design: GangSheetDesign, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

export type CartStore = CartState & CartActions;

// Order Store State
export interface OrderState {
  orders: Order[];
  designs: GangSheetDesign[];
  currentDesign: GangSheetDesign | null;
}

export interface OrderActions {
  // Designs
  saveDesign: (design: GangSheetDesign) => void;
  updateDesign: (id: string, updates: Partial<GangSheetDesign>) => void;
  deleteDesign: (id: string) => void;
  setCurrentDesign: (design: GangSheetDesign | null) => void;
  
  // Orders
  createOrder: (customerName: string, cartItems: CartItem[]) => Order;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  deleteOrder: (orderId: string) => void;
  getOrdersByStatus: (status: OrderStatus) => Order[];
}

export type OrderStore = OrderState & OrderActions;

