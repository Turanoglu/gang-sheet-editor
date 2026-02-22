import React, { useState } from 'react';
import { useSettingsStore, SYNC_INTERVAL_OPTIONS } from '../../store/settingsStore';
import { useOrderStore } from '../../store/orderStore';
import { BOARD_SIZES } from '../../types';

export const AdminSettings: React.FC = () => {
  const { admin, pricing, updateAdminSettings, updatePrice, resetPricingDefaults } = useSettingsStore();
  const { loadFromCloud, isCloudSyncing, lastCloudSync, cloudSyncError } = useOrderStore();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const response = await fetch(`${admin.backendUrl}/health`);
      if (response.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);

    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Admin Settings</h1>
        <p className="text-gray-500 mt-1">Configure cloud sync, pricing, and API settings</p>
      </div>

      <div className="space-y-6">
        {/* Cloud Sync */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Cloud Sync</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-600">Auto Sync</label>
                <p className="text-xs text-gray-400">Automatically sync data with cloud</p>
              </div>
              <button
                onClick={() => updateAdminSettings({ cloudSyncEnabled: !admin.cloudSyncEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  admin.cloudSyncEnabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    admin.cloudSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Sync Interval
              </label>
              <select
                value={admin.syncIntervalMs}
                onChange={(e) => updateAdminSettings({ syncIntervalMs: Number(e.target.value) })}
                disabled={!admin.cloudSyncEnabled}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
              >
                {SYNC_INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  {isCloudSyncing ? (
                    <>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-sm text-blue-600">Syncing...</span>
                    </>
                  ) : cloudSyncError ? (
                    <>
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      <span className="text-sm text-red-600">Sync Error</span>
                    </>
                  ) : lastCloudSync ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-sm text-green-600">Synced</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-gray-400 rounded-full" />
                      <span className="text-sm text-gray-600">Not synced</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Last sync: {formatLastSync(lastCloudSync)}
                </p>
              </div>
              <button
                onClick={() => loadFromCloud()}
                disabled={isCloudSyncing}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Pricing</h3>
            <button
              onClick={resetPricingDefaults}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Reset to Defaults
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {BOARD_SIZES.map((size) => {
              const key = `${size.width}x${size.height}`;
              return (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 w-24">{size.label}</label>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={pricing.customPrices[key] || 0}
                      onChange={(e) => updatePrice(key, Number(e.target.value))}
                      min="0"
                      step="0.01"
                      className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* API Configuration */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">API Configuration</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Backend URL
              </label>
              <input
                type="text"
                value={admin.backendUrl}
                onChange={(e) => updateAdminSettings({ backendUrl: e.target.value })}
                placeholder="http://localhost:3000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </button>

              {connectionStatus === 'success' && (
                <div className="flex items-center gap-2 text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm">Connected</span>
                </div>
              )}

              {connectionStatus === 'error' && (
                <div className="flex items-center gap-2 text-red-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-sm">Connection Failed</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
