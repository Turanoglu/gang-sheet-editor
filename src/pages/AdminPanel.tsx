import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { WelcomeDashboard } from '../components/Dashboard';
import { EditorSettings, AdminSettings } from '../components/Settings';
import { useCloudSync } from '../hooks';
import type { OrderStatus, Order, GangSheetDesign } from '../types/order';
import {
  getAdminOrdersFromCloud,
  getAdminDesignsFromCloud,
  updateAdminOrderStatus,
  deleteAdminOrder,
  deleteAdminDesign,
  isAuthenticated,
  getCustomerInitials,
  getCustomerEmail,
  getCustomerId,
  getCustomerName,
  getShopDomain,
} from '../services/storageAPI';

const SHOPIFY_STORE_URL = import.meta.env.VITE_SHOPIFY_STORE_URL || 'https://gang-sheet-test1.myshopify.com/pages/gang-sheet';

type TabType = 'All' | 'Draft' | 'In Cart' | 'Ordered' | 'Completed';
type SidebarView = 'Welcome' | 'Designs' | 'Orders' | 'EditorSettings' | 'AdminSettings';

const STATUS_COLORS: Record<OrderStatus, string> = {
  'Draft': 'bg-gray-100 text-gray-600',
  'Created': 'bg-blue-100 text-blue-700',
  'In Cart': 'bg-yellow-100 text-yellow-700',
  'Ordered': 'bg-purple-100 text-purple-700',
  'Processing': 'bg-orange-100 text-orange-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700',
};

// View Modal Component
const ViewModal: React.FC<{
  design: GangSheetDesign | null;
  onClose: () => void;
}> = ({ design, onClose }) => {
  if (!design) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600">
            <h3 className="text-lg font-semibold text-white">{design.name}</h3>
            <button 
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Thumbnail */}
            <div className="bg-gray-100 rounded-xl p-4 mb-6 flex items-center justify-center">
              {design.thumbnailUrl ? (
                <img 
                  src={design.thumbnailUrl} 
                  alt={design.name}
                  className="max-w-full max-h-64 object-contain rounded-lg shadow-md"
                />
              ) : (
                <div className="w-64 h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Board Size</span>
                <span className="font-semibold text-gray-800">{design.boardSize.label}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Image Count</span>
                <span className="font-semibold text-gray-800">{design.imageCount} images</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Created</span>
                <span className="font-semibold text-gray-800">
                  {new Date(design.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Last Updated</span>
                <span className="font-semibold text-gray-800">
                  {new Date(design.updatedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// Order View Modal
const OrderViewModal: React.FC<{
  order: Order | null;
  onClose: () => void;
}> = ({ order, onClose }) => {
  if (!order) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600">
            <div>
              <h3 className="text-lg font-semibold text-white">Order {order.orderNumber}</h3>
              <p className="text-emerald-100 text-sm">{order.customerName}</p>
            </div>
            <button 
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {/* Order Info */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Status</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                  {order.status}
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Total Amount</span>
                <span className="font-bold text-emerald-600 text-lg">${order.totalAmount.toFixed(2)}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Order Date</span>
                <span className="font-semibold text-gray-800">
                  {new Date(order.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>

            {/* Items */}
            <h4 className="font-semibold text-gray-800 mb-3">Order Items ({order.items?.length ?? 0})</h4>
            <div className="space-y-3">
              {(order.items ?? []).map((item) => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-4 flex gap-4">
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
                    <h5 className="font-medium text-gray-800">{item.design?.name || '-'}</h5>
                    <p className="text-sm text-gray-500">
                      {item.design?.boardSize?.label || '-'} • {item.design?.imageCount ?? 0} images
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-sm text-gray-600">Qty: {item.quantity}</span>
                      <span className="text-sm font-semibold text-emerald-600">
                        ${(item.pricePerUnit * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// Edit Name Modal
const EditNameModal: React.FC<{
  design: GangSheetDesign | null;
  onClose: () => void;
  onSave: (id: string, name: string) => void;
}> = ({ design, onClose, onSave }) => {
  const [name, setName] = useState(design?.name || '');

  if (!design) return null;

  const handleSave = () => {
    if (name.trim()) {
      onSave(design.id, name.trim());
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">Edit Design Name</h3>
          </div>

          {/* Content */}
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Design Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              maxLength={50}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter design name..."
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{name.length}/50</p>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const {
    orders: myOrders,
    designs: myDesigns,
    updateOrderStatus,
    deleteOrder,
    deleteDesign,
    updateDesign,
    setCurrentDesign,
    isCloudSyncing,
    cloudSyncError,
    lastCloudSync,
    loadFromCloud,
  } = useOrderStore();

  // Enable cloud sync polling for admin panel
  useCloudSync();

  const [activeTab, setActiveTab] = useState<TabType>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [perPage, setPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarView, setSidebarView] = useState<SidebarView>('Welcome');

  // Admin mode state — key is kept in sessionStorage only (tab-scoped, not persistent).
  // Never stored in localStorage so it doesn't appear in DevTools Application → Local Storage.
  const [adminMode, setAdminMode] = useState(() => !!sessionStorage.getItem('gang-sheet-admin-key'));
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');

  // Admin mode data (all customers)
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminDesigns, setAdminDesigns] = useState<GangSheetDesign[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [tiffDownloading, setTiffDownloading] = useState<string | null>(null); // designId being downloaded

  // Active data source based on mode
  const orders = adminMode ? adminOrders : myOrders;
  const designs = adminMode ? adminDesigns : myDesigns;

  // Build editor URL with customer context so the editor knows who the user is
  const editorUrl = (() => {
    const cid = getCustomerId();
    const params = new URLSearchParams({ customerId: cid });
    const name = getCustomerName();
    const email = getCustomerEmail();
    const shopDomain = getShopDomain();
    if (name) params.set('customerName', name);
    if (email) params.set('customerEmail', email);
    if (shopDomain) params.set('shopDomain', shopDomain);
    return `/?${params.toString()}`;
  })();

  const loadAdminData = useCallback(async () => {
    if (!adminMode) {
      loadFromCloud();
      return;
    }
    const key = sessionStorage.getItem('gang-sheet-admin-key');
    if (!key) return;
    setAdminLoading(true);
    try {
      const shopDomain = getShopDomain();
      const [fetchedOrders, fetchedDesigns] = await Promise.all([
        getAdminOrdersFromCloud(key, shopDomain || undefined),
        getAdminDesignsFromCloud(key, shopDomain || undefined),
      ]);
      setAdminOrders(fetchedOrders);
      setAdminDesigns(fetchedDesigns);
    } catch (e) {
      console.error('Failed to load admin data:', e);
      if (e instanceof Error && e.message === 'Unauthorized') {
        sessionStorage.removeItem('gang-sheet-admin-key');
        setAdminMode(false);
      }
    } finally {
      setAdminLoading(false);
    }
  }, [adminMode, loadFromCloud]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleAdminLogin = async () => {
    if (!adminKeyInput.trim()) return;
    setAdminLoading(true);
    setAdminLoginError('');

    const MAX_RETRIES = 4;
    const RETRY_DELAY = 8000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const [fetchedOrders, fetchedDesigns] = await Promise.all([
          getAdminOrdersFromCloud(adminKeyInput),
          getAdminDesignsFromCloud(adminKeyInput),
        ]);
        sessionStorage.setItem('gang-sheet-admin-key', adminKeyInput);
        setAdminOrders(fetchedOrders);
        setAdminDesigns(fetchedDesigns);
        setAdminMode(true);
        setShowAdminLogin(false);
        setAdminKeyInput('');
        setAdminLoading(false);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isNetwork = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.toLowerCase().includes('fetch');

        if (!isNetwork || attempt === MAX_RETRIES) {
          if (msg === 'Unauthorized') {
            setAdminLoginError('Geçersiz admin şifresi. Tekrar deneyin.');
          } else if (isNetwork) {
            setAdminLoginError('Backend\'e ulaşılamıyor. Render.com dashboard\'dan manuel olarak uyandır ve tekrar dene.');
          } else {
            setAdminLoginError(`Hata: ${msg}`);
          }
          setAdminLoading(false);
          return;
        }

        setAdminLoginError(`Backend uyanıyor, bekleniyor... (${attempt}/${MAX_RETRIES - 1})`);
        await new Promise(res => setTimeout(res, RETRY_DELAY));
      }
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('gang-sheet-admin-key');
    setAdminMode(false);
    setAdminOrders([]);
    setAdminDesigns([]);
  };

  const handleCleanupDesigns = async () => {
    const key = sessionStorage.getItem('gang-sheet-admin-key');
    if (!key) return;
    if (!confirm('R2\'deki eski design dosyalarındaki büyük veriyi temizle? (Bir kez yapılması yeterli)')) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://gang-sheet-backend.onrender.com'}/api/storage/admin/cleanup-designs`, {
        method: 'POST',
        headers: { 'X-Admin-Key': key },
      });
      const data = await res.json();
      alert(`Temizlendi: ${data.cleaned} dosya, atlandı: ${data.skipped} (zaten temiz)`);
    } catch (e) {
      alert('Hata: ' + e);
    }
  };

  // Modal states
  const [viewDesign, setViewDesign] = useState<GangSheetDesign | null>(null);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [editDesign, setEditDesign] = useState<GangSheetDesign | null>(null);

  // Filter designs based on tab and search
  const filteredDesigns = useMemo(() => {
    let result = [...designs];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (design) =>
          design.name.toLowerCase().includes(query) ||
          design.boardSize.label.toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [designs, searchQuery]);

  // Filter orders based on tab and search
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Tab filter
    if (activeTab !== 'All') {
      result = result.filter((order) => order.status === activeTab);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [orders, activeTab, searchQuery]);

  // Pagination
  const totalItems = sidebarView === 'Designs' ? filteredDesigns.length : filteredOrders.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedDesigns = filteredDesigns.slice(startIndex, endIndex);
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (adminMode) {
      const order = adminOrders.find(o => o.id === orderId);
      if (!order?.customerId) return;
      const key = sessionStorage.getItem('gang-sheet-admin-key')!;
      try {
        await updateAdminOrderStatus(order.customerId, orderId, newStatus, key);
        setAdminOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      } catch (e) {
        console.error('Failed to update order status:', e);
      }
    } else {
      updateOrderStatus(orderId, newStatus);
    }
  };

  // Wake backend from Render.com sleep, with progress updates
  const wakeBackend = async (apiBase: string, onStatus: (msg: string) => void): Promise<boolean> => {
    const TIMEOUT = 70000; // Render cold start can take up to 60s
    const INTERVAL = 3000;
    const deadline = Date.now() + TIMEOUT;
    let attempt = 0;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return true;
      } catch { /* sleeping */ }
      attempt++;
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      onStatus(`Sunucu uyandırılıyor... (${attempt * 3}s / maks 70s kaldı: ${remaining}s)`);
      await new Promise(r => setTimeout(r, INTERVAL));
    }
    return false;
  };

  // Download design as PNG or TIFF
  const handleDownloadDesign = async (design: GangSheetDesign, format: 'png' | 'tiff' = 'png') => {
    const adminKey = sessionStorage.getItem('gang-sheet-admin-key');
    if (!design.id || !design.customerId) { alert('No image available for download'); return; }

    const baseName = `${design.name.replace(/\s+/g, '_')}_${design.boardSize.width}x${design.boardSize.height}`;
    const apiBase = import.meta.env.VITE_BACKEND_URL || 'https://gang-sheet-backend.onrender.com';

    if (format === 'tiff') {
      setTiffDownloading(design.id);
      try {
        // Step 1: ensure backend is awake
        const awake = await wakeBackend(apiBase, (msg) => setTiffDownloading(`${design.id}:${msg}`));
        if (!awake) {
          alert('❌ Sunucu 70 saniye içinde yanıt vermedi. Render.com dashboard\'dan servisi kontrol et.');
          return;
        }

        // Step 2: render TIFF
        setTiffDownloading(design.id);
        const renderRes = await fetch(`${apiBase}/api/export/render-tiff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey! },
          body: JSON.stringify({ customerId: design.customerId, designId: design.id }),
        });

        if (renderRes.ok) {
          const dpi = renderRes.headers.get('X-Render-DPI') || '300';
          const blob = await renderRes.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${baseName}_${dpi}dpi.tiff`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return;
        }

        const errBody = await renderRes.json().catch(() => ({ error: `HTTP ${renderRes.status}` }));
        const msg = errBody.error || `HTTP ${renderRes.status}`;
        if (errBody.diagnostics) {
          console.error('[TIFF diagnostics]', JSON.stringify(errBody.diagnostics, null, 2));
        }
        if (renderRes.status === 503 || msg.toLowerCase().includes('memory')) {
          alert(`⚠️ Sunucu bu boyut için yeterli RAM'e sahip değil.\n\nÇözüm: Render.com Starter ($7/ay) planına geç.`);
        } else if (errBody.diagnostics) {
          alert(`❌ ${msg}\n\nTarayıcı Console'unu aç (F12) ve "[TIFF diagnostics]" satırını kopyalayıp paylaş.`);
        } else {
          alert(`❌ TIFF render başarısız: ${msg}`);
        }
      } catch (err) {
        alert(`❌ TIFF indirme hatası: ${err instanceof Error ? err.message : err}`);
      } finally {
        setTiffDownloading(null);
      }
      return;
    }

    // PNG download
    const proxyUrl = `${apiBase}/api/storage/proxy-image?customerId=${encodeURIComponent(design.customerId)}&designId=${encodeURIComponent(design.id)}`;
    const res = await fetch(proxyUrl, { headers: { 'X-Admin-Key': adminKey! } });
    if (!res.ok) { alert(`Görsel bulunamadı (${res.status})`); return; }
    const blobUrl = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${baseName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  // Download order images
  const handleDownloadOrder = (order: Order) => {
    // Download all design full exports in the order
    (order.items ?? []).forEach((item, index) => {
      // Prefer full export URL, fallback to thumbnail
      const downloadUrl = item.design?.fullExportUrl || item.design?.thumbnailUrl;

      if (downloadUrl) {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `${order.orderNumber}_item${index + 1}_${(item.design?.name || 'design').replace(/\s+/g, '_')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 500); // Stagger downloads
      }
    });
  };

  // Edit design - load into editor
  const handleEditDesign = (design: GangSheetDesign) => {
    setCurrentDesign(design);
    const cid = getCustomerId();
    const shopDomain = getShopDomain();
    // Derive the 'shop' slug from shopDomain (e.g. "inkdyno.com" → "inkdyno")
    // Fall back to 'inkdyno' so ShopifyAuthGate doesn't block the editor.
    const shopSlug = shopDomain
      ? shopDomain.replace(/^www\./, '').split('.')[0]
      : 'inkdyno';
    const params = new URLSearchParams({ customerId: cid, shop: shopSlug });
    const name = getCustomerName();
    const email = getCustomerEmail();
    if (name) params.set('customerName', name);
    if (email) params.set('customerEmail', email);
    if (shopDomain) params.set('shopDomain', shopDomain);
    navigate(`/?${params.toString()}`);
  };

  // Handle save design name
  const handleSaveDesignName = (id: string, name: string) => {
    updateDesign(id, { name });
  };

  // Confirm delete
  const handleDeleteDesign = async (design: GangSheetDesign) => {
    if (!confirm(`Are you sure you want to delete "${design.name}"?`)) return;
    if (adminMode && design.customerId) {
      const key = sessionStorage.getItem('gang-sheet-admin-key')!;
      try {
        await deleteAdminDesign(design.customerId, design.id, key);
        setAdminDesigns(prev => prev.filter(d => d.id !== design.id));
      } catch (e) {
        console.error('Failed to delete design:', e);
      }
    } else {
      deleteDesign(design.id);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!confirm(`Are you sure you want to delete order ${order.orderNumber}?`)) return;
    if (adminMode && order.customerId) {
      const key = sessionStorage.getItem('gang-sheet-admin-key')!;
      try {
        await deleteAdminOrder(order.customerId, order.id, key);
        setAdminOrders(prev => prev.filter(o => o.id !== order.id));
      } catch (e) {
        console.error('Failed to delete order:', e);
      }
    } else {
      deleteOrder(order.id);
    }
  };

  // Access gate: müşteri customerId ile geçer, admin key ile admin mode açılır
  if (!isAuthenticated() && !adminMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
          <div className="text-center mb-6">
            <img src="/gangflow-logo.svg" alt="GangFlow" className="w-14 h-14 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-800">GangFlow Panel</h2>
          </div>

          {/* İki seçenek yan yana */}
          <div className="grid grid-cols-2 gap-4">
            {/* Müşteri girişi */}
            <div className="border border-gray-200 rounded-xl p-5">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Müşteri Girişi</h3>
              <p className="text-xs text-gray-500 mb-4">Kendi tasarımlarınızı ve siparişlerinizi görüntüleyin.</p>
              <a
                href={SHOPIFY_STORE_URL}
                className="block w-full text-center py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Shopify'dan Giriş Yap
              </a>
            </div>

            {/* Admin girişi */}
            <div className="border border-purple-200 rounded-xl p-5 bg-purple-50/30">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Admin Girişi</h3>
              <p className="text-xs text-gray-500 mb-3">Tüm müşteri verilerine erişin.</p>
              <input
                type="password"
                value={adminKeyInput}
                onChange={(e) => setAdminKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                placeholder="Admin şifresi..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs
                           focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
              />
              {adminLoginError && (
                <p className={`text-xs mb-2 ${adminLoginError.includes('uyanıyor') ? 'text-amber-600' : 'text-red-600'}`}>
                  {adminLoginError}
                </p>
              )}
              <button
                onClick={handleAdminLogin}
                disabled={adminLoading || !adminKeyInput.trim()}
                className="w-full py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg
                           transition-colors disabled:opacity-50"
              >
                {adminLoading ? 'Giriş...' : 'Giriş Yap'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Modals */}
      <ViewModal design={viewDesign} onClose={() => setViewDesign(null)} />
      <OrderViewModal order={viewOrder} onClose={() => setViewOrder(null)} />
      <EditNameModal
        design={editDesign}
        onClose={() => setEditDesign(null)}
        onSave={handleSaveDesignName}
      />

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Admin Girişi</h3>
            <p className="text-sm text-gray-500 mb-4">Tüm müşterilerin verilerini görmek için admin şifresini girin.</p>
            <input
              type="password"
              value={adminKeyInput}
              onChange={(e) => setAdminKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
              placeholder="Admin şifresi..."
              autoFocus
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
            />
            {adminLoginError && (
              <p className={`text-sm mb-2 ${adminLoginError.includes('uyanıyor') ? 'text-amber-600' : 'text-red-600'}`}>
                {adminLoginError}
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { setShowAdminLogin(false); setAdminKeyInput(''); setAdminLoginError(''); }}
                className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleAdminLogin}
                disabled={adminLoading || !adminKeyInput.trim()}
                className="flex-1 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg
                           transition-colors disabled:opacity-50"
              >
                {adminLoading ? 'Kontrol ediliyor...' : 'Giriş Yap'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <img src="/gangflow-logo.svg" alt="GangFlow" className="w-8 h-8" />
            <span className="font-bold text-gray-800 text-sm">GangFlow</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          <div className="space-y-1">
            {/* Dashboard */}
            <button
              onClick={() => setSidebarView('Welcome')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                sidebarView === 'Welcome'
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </button>

            {/* Orders */}
            <button
              onClick={() => setSidebarView('Orders')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                sidebarView === 'Orders'
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Orders</span>
              {orders.length > 0 && (
                <span className="ml-auto bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {orders.length}
                </span>
              )}
            </button>

            {/* Designs */}
            <button
              onClick={() => setSidebarView('Designs')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                sidebarView === 'Designs'
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Designs</span>
              {designs.length > 0 && (
                <span className="ml-auto bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {designs.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-400 px-3 mb-2">QUICK ACTIONS</div>
            <Link
              to={editorUrl}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-gray-600 hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Design</span>
            </Link>
          </div>

          {/* Settings */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-400 px-3 mb-2">SETTINGS</div>
            <div className="space-y-1">
              <button
                onClick={() => setSidebarView('EditorSettings')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  sidebarView === 'EditorSettings'
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Editor Settings</span>
              </button>
              {adminMode && (
                <button
                  onClick={() => setSidebarView('AdminSettings')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    sidebarView === 'AdminSettings'
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Admin Settings</span>
                </button>
              )}
            </div>
          </div>

          {/* Admin / Customer Mode */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-400 px-3 mb-2">MOD</div>
            {adminMode ? (
              <div className="px-3">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-purple-50 rounded-lg mb-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-purple-700">Admin Modu</span>
                </div>
                <button
                  onClick={handleCleanupDesigns}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs
                             text-orange-600 hover:bg-orange-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  R2 Cleanup (1x)
                </button>
                <button
                  onClick={handleAdminLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs
                             text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Admin'den Çık
                </button>
              </div>
            ) : (
              <div className="px-3">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg mb-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-blue-700">Müşteri Modu</span>
                </div>
                <button
                  onClick={() => setShowAdminLogin(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs
                             text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Admin Girişi
                </button>
              </div>
            )}
          </div>

          {/* Sync Status */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-400 px-3 mb-2">CLOUD SYNC</div>
            <div className="px-3 py-2">
              {isCloudSyncing ? (
                <div className="flex items-center gap-2 text-blue-600 text-sm">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Syncing...</span>
                </div>
              ) : cloudSyncError ? (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Sync Error</span>
                </div>
              ) : lastCloudSync ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Synced</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>Not synced</span>
                </div>
              )}
              <button
                onClick={() => loadAdminData()}
                disabled={isCloudSyncing || adminLoading}
                className="mt-2 w-full text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {adminLoading ? 'Yükleniyor...' : 'Yenile'}
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Show content based on sidebar selection */}
        {sidebarView === 'Welcome' ? (
          <div className="flex-1 overflow-auto bg-gray-50">
            <WelcomeDashboard orders={orders} designs={designs} adminMode={adminMode} />
          </div>
        ) : sidebarView === 'EditorSettings' ? (
          <div className="flex-1 overflow-auto bg-gray-50">
            <EditorSettings />
          </div>
        ) : sidebarView === 'AdminSettings' ? (
          <div className="flex-1 overflow-auto bg-gray-50">
            <AdminSettings />
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-gray-800">
                  {sidebarView === 'Designs'
                    ? (adminMode ? 'All Designs' : 'My Designs')
                    : (adminMode ? 'All Orders' : 'My Orders')}
                </h1>
                {adminMode && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                    Admin
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to={editorUrl}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Design
                </Link>
                <div
                  title={getCustomerEmail()}
                  className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <span className="text-sm font-bold text-white">{getCustomerInitials()}</span>
                </div>
              </div>
            </header>

            {/* Content */}
            <div className="flex-1 p-6 overflow-auto">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {/* Tabs and Search */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {(['All', 'Draft', 'In Cart', 'Ordered', 'Completed'] as TabType[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        activeTab === tab
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm 
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <svg 
                    className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sidebarView === 'Designs' ? (
                    paginatedDesigns.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                          <div className="flex flex-col items-center">
                            <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="font-medium">No designs found</p>
                            <p className="text-sm mt-1">Create your first GangFlow sheet to get started!</p>
                            <Link 
                              to="/"
                              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              Create Design
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedDesigns.map((design) => (
                        <DesignRow
                          key={design.id}
                          design={design}
                          adminMode={adminMode}
                          onView={() => setViewDesign(design)}
                          onEdit={() => setEditDesign(design)}
                          onEditInBuilder={() => handleEditDesign(design)}
                          onDownload={() => handleDownloadDesign(design, 'png')}
                          onDownloadTiff={() => handleDownloadDesign(design, 'tiff')}
                          isTiffDownloading={tiffDownloading !== null && tiffDownloading.startsWith(design.id)}
                          tiffStatus={tiffDownloading?.startsWith(`${design.id}:`) ? tiffDownloading.slice(design.id.length + 1) : undefined}
                          onDelete={() => handleDeleteDesign(design)}
                          formatDate={formatDate}
                        />
                      ))
                    )
                  ) : (
                    paginatedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                          <div className="flex flex-col items-center">
                            <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="font-medium">No orders found</p>
                            <p className="text-sm mt-1">Orders will appear here after checkout</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((order) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          adminMode={adminMode}
                          onStatusChange={handleStatusChange}
                          onView={() => setViewOrder(order)}
                          onDownload={() => handleDownloadOrder(order)}
                          onDelete={() => handleDeleteOrder(order)}
                          formatDate={formatDate}
                        />
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Per Page:</span>
                <select
                  value={perPage}
                  onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="border border-gray-300 rounded px-2 py-1"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="ml-4">
                  {totalItems > 0 ? startIndex + 1 : 0} - {Math.min(endIndex, totalItems)} of {totalItems}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  «
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ›
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

// Design Row Component
const DesignRow: React.FC<{
  design: GangSheetDesign;
  adminMode?: boolean;
  onView: () => void;
  onEdit: () => void;
  onEditInBuilder: () => void;
  onDownload: () => void;
  onDownloadTiff: () => void;
  isTiffDownloading?: boolean;
  tiffStatus?: string;
  onDelete: () => void;
  formatDate: (date: Date | string) => string;
}> = ({ design, adminMode, onView, onEdit, onEditInBuilder, onDownload, onDownloadTiff, isTiffDownloading, tiffStatus, onDelete, formatDate }) => (
  <tr className="hover:bg-gray-50">
    <td className="px-4 py-3 max-w-[260px]">
      <div className="flex items-center gap-2 min-w-0">
        {/* Thumbnail preview */}
        <div className="w-12 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0 border border-gray-200">
          {design.thumbnailUrl ? (
            <img
              src={design.thumbnailUrl}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <span className="font-medium text-gray-800 truncate" title={design.name}>{design.name}</span>
        <button
          onClick={onEdit}
          className="text-gray-400 hover:text-blue-600 transition-colors"
          title="Rename"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>
    </td>
    <td className="px-4 py-3 text-gray-500">-</td>
    <td className="px-4 py-3 text-gray-500">
      {adminMode && design.customerId ? (
        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
          {design.customerId}
        </span>
      ) : '-'}
    </td>
    <td className="px-4 py-3">
      <button onClick={onEditInBuilder} className="text-blue-600 hover:underline">
        Create Your Gang...
      </button>
    </td>
    <td className="px-4 py-3 text-gray-700">{design.boardSize.width}" X {design.boardSize.height}"</td>
    <td className="px-4 py-3">
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        Created
      </span>
    </td>
    <td className="px-4 py-3">
      <span className="text-blue-600">GangFlow</span>
    </td>
    <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(design.createdAt)}</td>
    <td className="px-4 py-3">
      <div className="flex items-center gap-1">
        {adminMode && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={onDownload}
              className="px-1.5 py-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors font-medium"
              title="Download PNG"
            >PNG</button>
            <button
              onClick={onDownloadTiff}
              disabled={isTiffDownloading}
              className="px-1.5 py-1 text-xs text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={tiffStatus || 'Download TIFF (print-ready, server-side 300 DPI)'}
            >{isTiffDownloading ? (tiffStatus ? '⏳…' : '⏳') : 'TIFF'}</button>
          </div>
        )}
        <button
          onClick={onView} 
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" 
          title="View Details"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button 
          onClick={onEditInBuilder} 
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" 
          title="Edit in Builder"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button 
          onClick={onDelete} 
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
          title="Delete"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </td>
  </tr>
);

// Order Row Component
const OrderRow: React.FC<{
  order: Order;
  adminMode?: boolean;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
  formatDate: (date: Date | string) => string;
}> = ({ order, adminMode, onStatusChange, onView, onDownload, onDelete, formatDate }) => (
  <tr className="hover:bg-gray-50">
    <td className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-800">{order.customerName}</span>
      </div>
    </td>
    <td className="px-4 py-3 text-gray-700 font-mono text-sm">{order.orderNumber}</td>
    <td className="px-4 py-3 text-gray-700">{order.customerName}</td>
    <td className="px-4 py-3">
      <button onClick={onView} className="text-blue-600 hover:underline">
        View Order...
      </button>
    </td>
    <td className="px-4 py-3 text-gray-700">
      {order.items?.[0]?.design?.boardSize?.label || '-'}
    </td>
    <td className="px-4 py-3">
      <select
        value={order.status}
        onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)}
        className={`px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[order.status]}`}
      >
        <option value="Draft">Draft</option>
        <option value="Created">Created</option>
        <option value="In Cart">In Cart</option>
        <option value="Ordered">Ordered</option>
        <option value="Processing">Processing</option>
        <option value="Completed">Completed</option>
        <option value="Cancelled">Cancelled</option>
      </select>
    </td>
    <td className="px-4 py-3">
      <span className="text-blue-600">{order.product}</span>
    </td>
    <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(order.createdAt)}</td>
    <td className="px-4 py-3">
      <div className="flex items-center gap-1">
        {adminMode && (
          <button
            onClick={onDownload}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Download All Images"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        )}
        <button
          onClick={onView}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="View Order"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button 
          onClick={onDelete} 
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
          title="Delete Order"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </td>
  </tr>
);

export default AdminPanel;
