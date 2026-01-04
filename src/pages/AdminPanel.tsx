import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { WelcomeDashboard } from '../components/Dashboard';
import type { OrderStatus, Order, GangSheetDesign } from '../types/order';

type TabType = 'All' | 'Draft' | 'In Cart' | 'Ordered' | 'Completed';
type SidebarView = 'Welcome' | 'Designs' | 'Orders';

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
            <h4 className="font-semibold text-gray-800 mb-3">Order Items ({order.items.length})</h4>
            <div className="space-y-3">
              {order.items.map((item) => (
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
                    <h5 className="font-medium text-gray-800">{item.design.name}</h5>
                    <p className="text-sm text-gray-500">
                      {item.design.boardSize.label} • {item.design.imageCount} images
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
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter design name..."
              autoFocus
            />
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
  const { orders, designs, updateOrderStatus, deleteOrder, deleteDesign, updateDesign, setCurrentDesign } = useOrderStore();
  const [activeTab, setActiveTab] = useState<TabType>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [perPage, setPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarView, setSidebarView] = useState<SidebarView>('Welcome');
  
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

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    updateOrderStatus(orderId, newStatus);
  };

  // Download design as PNG (uses full export if available, otherwise thumbnail)
  const handleDownloadDesign = (design: GangSheetDesign) => {
    // Prefer full export URL, fallback to thumbnail
    const downloadUrl = design.fullExportUrl || design.thumbnailUrl;
    
    if (!downloadUrl) {
      alert('No image available for download');
      return;
    }

    // Create a link and download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${design.name.replace(/\s+/g, '_')}_${design.boardSize.width}x${design.boardSize.height}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download order images
  const handleDownloadOrder = (order: Order) => {
    // Download all design full exports in the order
    order.items.forEach((item, index) => {
      // Prefer full export URL, fallback to thumbnail
      const downloadUrl = item.design.fullExportUrl || item.design.thumbnailUrl;
      
      if (downloadUrl) {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `${order.orderNumber}_item${index + 1}_${item.design.name.replace(/\s+/g, '_')}.png`;
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
    navigate('/');
  };

  // Handle save design name
  const handleSaveDesignName = (id: string, name: string) => {
    updateDesign(id, { name });
  };

  // Confirm delete
  const handleDeleteDesign = (design: GangSheetDesign) => {
    if (confirm(`Are you sure you want to delete "${design.name}"?`)) {
      deleteDesign(design.id);
    }
  };

  const handleDeleteOrder = (order: Order) => {
    if (confirm(`Are you sure you want to delete order ${order.orderNumber}?`)) {
      deleteOrder(order.id);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Modals */}
      <ViewModal design={viewDesign} onClose={() => setViewDesign(null)} />
      <OrderViewModal order={viewOrder} onClose={() => setViewOrder(null)} />
      <EditNameModal 
        design={editDesign} 
        onClose={() => setEditDesign(null)} 
        onSave={handleSaveDesignName}
      />

      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">GS</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          <div className="space-y-1">
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
              <span>Welcome</span>
            </button>
            
            <SidebarItem icon="⚙️" label="Set up" />
            <SidebarItem icon="🏷️" label="Products" />
            
            <button
              onClick={() => setSidebarView('Orders')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                sidebarView === 'Orders' 
                  ? 'bg-blue-50 text-blue-600 font-medium' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>📦</span>
              <span>Orders</span>
              {orders.length > 0 && (
                <span className="ml-auto bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {orders.length}
                </span>
              )}
            </button>
            
            <button
              onClick={() => setSidebarView('Designs')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                sidebarView === 'Designs' 
                  ? 'bg-blue-50 text-blue-600 font-medium' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>📁</span>
              <span>Designs</span>
              {designs.length > 0 && (
                <span className="ml-auto bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {designs.length}
                </span>
              )}
            </button>

            <SidebarItem icon="🔧" label="Build & Assign" />
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-400 px-3 mb-2">SETTINGS</div>
            <SidebarItem icon="⚙️" label="General" />
            <SidebarItem icon="📋" label="Gang Sheet" />
            <SidebarItem icon="🎨" label="Builder" />
            <SidebarItem icon="🖼️" label="Image to Sheet" />
            <SidebarItem icon="🎭" label="Appearance" />
            <SidebarItem icon="🖼️" label="Gallery Images" />
            <SidebarItem icon="🖨️" label="Print on Demand" />
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <SidebarItem icon="💳" label="Transactions" />
            <SidebarItem icon="🔤" label="Fonts" />
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <SidebarItem icon="🎫" label="Support Ticket" />
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Show WelcomeDashboard when Welcome is selected */}
        {sidebarView === 'Welcome' ? (
          <div className="flex-1 overflow-auto bg-gray-50">
            <WelcomeDashboard />
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
              <h1 className="text-xl font-semibold text-gray-800">
                {sidebarView === 'Designs' ? 'Designs' : 'Orders'}
              </h1>
              <div className="flex items-center gap-4">
                <Link 
                  to="/"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Design
                </Link>
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
                            <p className="text-sm mt-1">Create your first gang sheet to get started!</p>
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
                          onView={() => setViewDesign(design)}
                          onEdit={() => setEditDesign(design)}
                          onEditInBuilder={() => handleEditDesign(design)}
                          onDownload={() => handleDownloadDesign(design)}
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

// Sidebar Item Component
const SidebarItem: React.FC<{ icon: string; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <button
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
      active ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    <span>{icon}</span>
    <span>{label}</span>
  </button>
);

// Design Row Component
const DesignRow: React.FC<{ 
  design: GangSheetDesign; 
  onView: () => void;
  onEdit: () => void;
  onEditInBuilder: () => void;
  onDownload: () => void;
  onDelete: () => void;
  formatDate: (date: Date | string) => string;
}> = ({ design, onView, onEdit, onEditInBuilder, onDownload, onDelete, formatDate }) => (
  <tr className="hover:bg-gray-50">
    <td className="px-4 py-3">
      <div className="flex items-center gap-2">
        {/* Thumbnail preview */}
        <div className="w-8 h-8 bg-gray-100 rounded overflow-hidden flex-shrink-0">
          {design.thumbnailUrl ? (
            <img src={design.thumbnailUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <span className="font-medium text-gray-800">{design.name}</span>
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
    <td className="px-4 py-3 text-gray-500">-</td>
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
      <span className="text-blue-600">Gang Sheet</span>
    </td>
    <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(design.createdAt)}</td>
    <td className="px-4 py-3">
      <div className="flex items-center gap-1">
        <button 
          onClick={onDownload} 
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" 
          title="Download PNG"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
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
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
  formatDate: (date: Date | string) => string;
}> = ({ order, onStatusChange, onView, onDownload, onDelete, formatDate }) => (
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
      {order.items[0]?.design.boardSize.label || '-'}
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
