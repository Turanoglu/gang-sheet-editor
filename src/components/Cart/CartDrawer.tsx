import React, { useState } from 'react';
import { useCartStore } from '../../store/cartStore';
import { useOrderStore } from '../../store/orderStore';
import { getVariantId, areVariantsConfigured } from '../../config/shopifyVariants';
import { getCustomerName, getCustomerId, getShopDomain } from '../../services/storageAPI';

// Detect if the editor is embedded inside an iframe (e.g. inkdyno.com)
const isEmbedded = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent → assume embedded
  }
};

export const CartDrawer: React.FC = () => {
  const { items, isOpen, closeCart, removeFromCart, updateQuantity, getTotal, clearCart } = useCartStore();
  const { createOrder, updateOrderStatus } = useOrderStore();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<string>('');

  const handleCheckout = async () => {
    if (items.length === 0) return;

    // If embedded in Shopify and customer not logged in, request login via parent
    if (isEmbedded() && areVariantsConfigured() && !getCustomerId()) {
      window.parent.postMessage({ type: 'gang-sheet-login-required' }, '*');
      return;
    }

    setIsCheckingOut(true);
    setCheckoutStatus('Preparing order...');

    try {
      // Update existing 'In Cart' orders to 'Created', or create new orders if needed
      const customerName = getCustomerName() || 'Customer';
      for (const item of items) {
        if (item.orderId) {
          updateOrderStatus(item.orderId, 'Created');
        } else {
          createOrder(customerName, [item], 'Created');
        }
      }

      if (isEmbedded() && areVariantsConfigured()) {
        // ── GET navigation via window.open(_top) ─────────────────────
        // Works from cross-origin iframes; bypasses all JS interceptors (Kommo CRM etc.)
        // Does NOT depend on the Shopify liquid — the iframe navigates the top window directly.
        const lineItems = items.map(item => {
          const variantId = getVariantId(
            item.design.boardSize.width,
            item.design.boardSize.height
          );
          if (!variantId) {
            throw new Error(
              `No Shopify variant configured for ${item.design.boardSize.label}. ` +
              `Please update src/config/shopifyVariants.ts.`
            );
          }
          return {
            variantId,
            quantity: item.quantity,
            properties: {
              'Design Name': item.design.name,
              'Board Size': item.design.boardSize.label,
              'Images Count': String(item.design.imageCount),
            },
          };
        });

        // Build absolute Shopify store URL for cart/add GET navigation
        const shopDomain = getShopDomain() || 'www.inkdyno.com';
        const storeBase = `https://${shopDomain}`;

        // return_to must be relative — Shopify rejects absolute URLs as open-redirect
        let finalUrl = `${storeBase}/checkout`;
        for (let i = lineItems.length - 1; i >= 0; i--) {
          const item = lineItems[i];
          const params = new URLSearchParams();
          params.set('id', String(item.variantId));
          params.set('quantity', String(item.quantity));
          Object.entries(item.properties).forEach(([k, v]) => {
            params.set(`properties[${k}]`, v);
          });
          params.set('return_to', '/checkout');
          finalUrl = `${storeBase}/cart/add?` + params.toString();
        }

        setCheckoutStatus('Redirecting to checkout...');
        clearCart();
        closeCart();

        // Navigate top-level window — allowed from cross-origin iframes
        window.open(finalUrl, '_top');

      } else {
        // ── Standalone / fallback ──────────────────────────────────────
        clearCart();
        closeCart();
        alert('✅ Order saved!');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert(
        `❌ Checkout failed!\n\n` +
        `${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsCheckingOut(false);
      setCheckoutStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={closeCart}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600">
          <div className="flex items-center gap-2 text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-lg font-semibold">Shopping Cart</h2>
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-sm">
              {items.length} items
            </span>
          </div>
          <button 
            onClick={closeCart}
            className="text-white hover:bg-white/20 p-1 rounded transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-lg font-medium">Your cart is empty</p>
              <p className="text-sm mt-1">Add GangFlow sheets to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div 
                  key={item.id}
                  className="bg-gray-50 rounded-xl p-4 border border-gray-200"
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="w-20 h-20 bg-white rounded-lg border border-gray-200 flex-shrink-0 overflow-hidden">
                      {item.design.thumbnailUrl ? (
                        <img 
                          src={item.design.thumbnailUrl} 
                          alt={item.design.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-800 truncate">{item.design.name}</h3>
                      <p className="text-sm text-gray-500">
                        {item.design.boardSize.label} • {item.design.imageCount} images
                      </p>
                      <p className="text-emerald-600 font-semibold mt-1">
                        ${item.pricePerUnit.toFixed(2)}
                      </p>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Quantity */}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Quantity:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center
                                   hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center
                                   hover:bg-gray-100 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between">
                    <span className="text-sm text-gray-500">Subtotal:</span>
                    <span className="font-semibold text-gray-800">
                      ${(item.pricePerUnit * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            {/* Total */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-medium text-gray-700">Total:</span>
              <span className="text-2xl font-bold text-emerald-600">
                ${getTotal().toFixed(2)}
              </span>
            </div>

            {/* Checkout Button */}
            <button
              onClick={handleCheckout}
              disabled={isCheckingOut}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700
                         text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl
                         transition-all transform hover:scale-[1.02]
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isCheckingOut ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {checkoutStatus || 'Processing...'}
                </span>
              ) : (
                'Proceed to Checkout'
              )}
            </button>

            {/* Continue Shopping */}
            <button
              onClick={closeCart}
              className="w-full mt-2 text-gray-600 hover:text-gray-800 py-2 text-sm font-medium transition-colors"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default CartDrawer;


