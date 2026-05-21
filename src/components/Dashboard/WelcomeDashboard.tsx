import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOrderStore } from '../../store/orderStore';
import type { OrderStatus, Order, GangSheetDesign } from '../../types/order';

const STATUS_COLORS: Record<OrderStatus, string> = {
  'Draft': 'bg-gray-100 text-gray-600',
  'Created': 'bg-blue-100 text-blue-700',
  'In Cart': 'bg-yellow-100 text-yellow-700',
  'Ordered': 'bg-purple-100 text-purple-700',
  'Processing': 'bg-orange-100 text-orange-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700',
};

const PIE_COLORS: Record<OrderStatus, string> = {
  'Draft': '#9ca3af',
  'Created': '#3b82f6',
  'In Cart': '#eab308',
  'Ordered': '#a855f7',
  'Processing': '#f97316',
  'Completed': '#22c55e',
  'Cancelled': '#ef4444',
};

// Donut Chart Component
const DonutChart: React.FC<{
  data: Record<OrderStatus, number>;
  total: number;
}> = ({ data, total }) => {
  const segments = useMemo(() => {
    if (total === 0) return [];

    const statuses: OrderStatus[] = ['Draft', 'Created', 'In Cart', 'Ordered', 'Processing', 'Completed', 'Cancelled'];
    let currentAngle = 0;

    return statuses
      .filter(status => (data[status] || 0) > 0)
      .map(status => {
        const value = data[status] || 0;
        const percentage = (value / total) * 100;
        const angle = (value / total) * 360;
        const startAngle = currentAngle;
        currentAngle += angle;

        return {
          status,
          value,
          percentage,
          color: PIE_COLORS[status],
          startAngle,
          endAngle: currentAngle,
        };
      });
  }, [data, total]);

  const getSlicePath = (startAngle: number, endAngle: number, radius: number = 70, innerRadius: number = 45) => {
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;

    const x1 = 90 + radius * Math.cos(startRad);
    const y1 = 90 + radius * Math.sin(startRad);
    const x2 = 90 + radius * Math.cos(endRad);
    const y2 = 90 + radius * Math.sin(endRad);

    const x3 = 90 + innerRadius * Math.cos(endRad);
    const y3 = 90 + innerRadius * Math.sin(endRad);
    const x4 = 90 + innerRadius * Math.cos(startRad);
    const y4 = 90 + innerRadius * Math.sin(startRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-44">
        <div className="text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
          <p className="text-sm">No data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <svg width="180" height="180" viewBox="0 0 180 180" className="flex-shrink-0">
        {/* Background circle */}
        <circle cx="90" cy="90" r="70" fill="#f3f4f6" />

        {/* Pie slices */}
        {segments.map((segment, index) => (
          <path
            key={index}
            d={getSlicePath(segment.startAngle, segment.endAngle)}
            fill={segment.color}
            className="transition-all duration-300 hover:opacity-80"
            style={{ cursor: 'pointer' }}
          >
            <title>{segment.status}: {segment.value} ({segment.percentage.toFixed(1)}%)</title>
          </path>
        ))}

        {/* Center hole */}
        <circle cx="90" cy="90" r="45" fill="white" />

        {/* Center text */}
        <text x="90" y="85" textAnchor="middle" className="fill-gray-800 font-bold" style={{ fontSize: '24px' }}>
          {total}
        </text>
        <text x="90" y="105" textAnchor="middle" className="fill-gray-500" style={{ fontSize: '12px' }}>
          Total
        </text>
      </svg>

      {/* Legend */}
      <div className="flex-1 space-y-2">
        {segments.map((segment) => (
          <div key={segment.status} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-gray-600">{segment.status}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{segment.value}</span>
              <span className="text-gray-400 text-xs">({segment.percentage.toFixed(0)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface WelcomeDashboardProps {
  orders?: Order[];
  designs?: GangSheetDesign[];
  adminMode?: boolean;
}

export const WelcomeDashboard: React.FC<WelcomeDashboardProps> = ({ orders: propOrders, designs: propDesigns, adminMode }) => {
  const { orders: storeOrders, designs: storeDesigns } = useOrderStore();
  const orders = propOrders ?? storeOrders;
  const designs = propDesigns ?? storeDesigns;

  // Calculate statistics
  const stats = useMemo(() => {
    const totalSheets = designs.length;
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    
    // Orders by status
    const ordersByStatus = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<OrderStatus, number>);

    // Recent designs (last 5)
    const recentDesigns = [...designs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    // Recent orders (last 5)
    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      totalSheets,
      totalOrders,
      totalAmount,
      ordersByStatus,
      recentDesigns,
      recentOrders,
    };
  }, [orders, designs]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };


  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-800">
          {adminMode ? 'Shop Dashboard' : 'My Dashboard'}
        </h1>
        {adminMode && (
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">Admin</span>
        )}
      </div>

      {/* Statistics */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">
            {adminMode ? 'Shop Statistics' : 'My Statistics'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Sheets */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sheets</p>
              <p className="text-2xl font-bold text-gray-800">{stats.totalSheets}</p>
            </div>
          </div>

          {/* Total Orders */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Orders</p>
              <p className="text-2xl font-bold text-gray-800">{stats.totalOrders}</p>
            </div>
          </div>

          {/* Total Order Amounts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Order Amounts</p>
              <p className="text-2xl font-bold text-gray-800">${stats.totalAmount.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders by Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Orders Overview</h3>
          <DonutChart data={stats.ordersByStatus} total={stats.totalOrders} />
        </div>

        {/* Status Cards */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Orders by Status</h3>
          {stats.totalOrders === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No orders yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(['Draft', 'Created', 'In Cart', 'Ordered', 'Processing', 'Completed', 'Cancelled'] as OrderStatus[]).map((status) => (
                <div key={status} className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium mb-2 ${STATUS_COLORS[status]}`}>
                    {status}
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{stats.ordersByStatus[status] || 0}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Designs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Recent Designs</h3>
            <Link to="/admin" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              See more
            </Link>
          </div>
          
          {stats.recentDesigns.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No designs yet</p>
              <Link to="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                Create your first design
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentDesigns.map((design) => (
                <div key={design.id} className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{design.name}</p>
                    <p className="text-sm text-gray-500">
                      {design.boardSize.label} • {design.imageCount} images
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Completed
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(design.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Recent Orders</h3>
            <Link to="/admin" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              See more
            </Link>
          </div>
          
          {stats.recentOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No orders yet</p>
              <p className="text-sm mt-1">Orders will appear here after checkout</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 font-mono">{order.orderNumber}</p>
                    <p className="text-sm text-gray-500">{(order.items?.length ?? 0)} item{(order.items?.length ?? 0) !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800">${order.totalAmount.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{formatDate(order.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link 
            to="/"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Design
          </Link>
          <button 
            onClick={() => window.location.href = '/admin'}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            View All Designs
          </button>
          <button 
            onClick={() => window.location.href = '/admin'}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            View All Orders
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeDashboard;


