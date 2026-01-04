import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOrderStore } from '../../store/orderStore';
import type { OrderStatus } from '../../types/order';

const STATUS_COLORS: Record<OrderStatus, string> = {
  'Draft': 'bg-gray-100 text-gray-600',
  'Created': 'bg-blue-100 text-blue-700',
  'In Cart': 'bg-yellow-100 text-yellow-700',
  'Ordered': 'bg-purple-100 text-purple-700',
  'Processing': 'bg-orange-100 text-orange-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700',
};

export const WelcomeDashboard: React.FC = () => {
  const { orders, designs } = useOrderStore();

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

    // Design types summary
    const designTypes = {
      'Gang Sheet': designs.length,
      'Sticker': 0,
      'Rolling Gang Sheet': 0,
      'Upload By Size': 0,
      'Image to Sheet': 0,
    };

    return {
      totalSheets,
      totalOrders,
      totalAmount,
      ordersByStatus,
      recentDesigns,
      recentOrders,
      designTypes,
    };
  }, [orders, designs]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Pie chart data
  const pieData = useMemo(() => {
    const total = Object.values(stats.designTypes).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];
    let currentAngle = 0;
    
    return Object.entries(stats.designTypes).map(([name, value], index) => {
      const percentage = (value / total) * 100;
      const angle = (value / total) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      
      return {
        name,
        value,
        percentage,
        color: colors[index % colors.length],
        startAngle,
        endAngle: currentAngle,
      };
    });
  }, [stats.designTypes]);

  // Generate SVG path for pie slice
  const getSlicePath = (startAngle: number, endAngle: number, radius: number = 80) => {
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    
    const x1 = 100 + radius * Math.cos(startRad);
    const y1 = 100 + radius * Math.sin(startRad);
    const x2 = 100 + radius * Math.cos(endRad);
    const y2 = 100 + radius * Math.sin(endRad);
    
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M 100 100 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Welcome to Build a Gang Sheet</h1>
      </div>

      {/* Shop Statistics */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">Shop Statistics</h2>
          <select className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600">
            <option>Last A Month</option>
            <option>Last 3 Months</option>
            <option>Last 6 Months</option>
            <option>All Time</option>
          </select>
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Usage Breakdown (Last a month)</h3>
          
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-gray-600">Gang Sheet</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-gray-600">Sticker</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span className="text-gray-600">Rolling Gang Sheet</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span className="text-gray-600">Upload By Size</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded"></div>
              <span className="text-gray-600">Image to Sheet</span>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="flex justify-center">
            <svg width="200" height="200" viewBox="0 0 200 200">
              {/* Background circle */}
              <circle cx="100" cy="100" r="80" fill="#f3f4f6" />
              
              {/* Pie slices */}
              {pieData.map((slice, index) => (
                slice.value > 0 && (
                  <path
                    key={index}
                    d={getSlicePath(slice.startAngle, slice.endAngle)}
                    fill={slice.color}
                    className="transition-all duration-300 hover:opacity-80"
                  />
                )
              ))}
              
              {/* Center hole for donut effect */}
              <circle cx="100" cy="100" r="50" fill="white" />
              
              {/* Center text */}
              <text x="100" y="95" textAnchor="middle" className="text-2xl font-bold fill-gray-800">
                {stats.totalSheets}
              </text>
              <text x="100" y="115" textAnchor="middle" className="text-xs fill-gray-500">
                Total
              </text>
            </svg>
          </div>
        </div>

        {/* Design Types Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Design Types Summary</h3>
          
          <div className="space-y-3">
            {Object.entries(stats.designTypes).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-gray-600">{type}</span>
                <span className="font-semibold text-gray-800">{count}</span>
              </div>
            ))}
          </div>
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
                    <p className="text-sm text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
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

