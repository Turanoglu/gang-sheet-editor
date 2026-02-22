import { useEffect, useRef, useCallback } from 'react';
import { useOrderStore } from '../store/orderStore';
import { useSettingsStore } from '../store/settingsStore';

export function useCloudSync() {
  const intervalRef = useRef<number | null>(null);
  const { loadFromCloud, isCloudSyncing } = useOrderStore();
  const { admin } = useSettingsStore();
  const { cloudSyncEnabled, syncIntervalMs } = admin;

  // Store refs to avoid stale closures
  const syncingRef = useRef(isCloudSyncing);
  syncingRef.current = isCloudSyncing;

  const startPolling = useCallback(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't start if sync is disabled
    if (!cloudSyncEnabled) {
      return;
    }

    // Start new interval
    intervalRef.current = window.setInterval(() => {
      // Only sync if not already syncing
      if (!syncingRef.current) {
        loadFromCloud();
      }
    }, syncIntervalMs);
  }, [cloudSyncEnabled, syncIntervalMs, loadFromCloud]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Handle sync settings changes
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Handle page visibility (pause when tab is hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Tab became visible - sync immediately and restart polling
        if (cloudSyncEnabled && !syncingRef.current) {
          loadFromCloud();
        }
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startPolling, stopPolling, cloudSyncEnabled, loadFromCloud]);

  // Handle window focus (optional: sync on focus)
  useEffect(() => {
    const handleFocus = () => {
      if (cloudSyncEnabled && !syncingRef.current) {
        loadFromCloud();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [cloudSyncEnabled, loadFromCloud]);

  return {
    startPolling,
    stopPolling,
    isPolling: intervalRef.current !== null,
  };
}

export default useCloudSync;
