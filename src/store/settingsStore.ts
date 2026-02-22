import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BOARD_SIZES } from '../types';
import type { BoardSize } from '../types';
import { BOARD_PRICES } from '../types/order';

// Settings State Interface
export interface EditorSettings {
  defaultBoardSize: BoardSize;
  defaultDpi: number;
  showGridByDefault: boolean;
  gridSizeInches: number;
  exportDpi: number;
  exportFormat: 'png' | 'jpeg';
  defaultMarginInches: number;
}

export interface AdminSettings {
  cloudSyncEnabled: boolean;
  syncIntervalMs: number; // 30000, 60000, 300000, 600000
  backendUrl: string;
}

export interface PricingSettings {
  customPrices: Record<string, number>;
}

interface SettingsState {
  editor: EditorSettings;
  admin: AdminSettings;
  pricing: PricingSettings;
}

interface SettingsActions {
  updateEditorSettings: (settings: Partial<EditorSettings>) => void;
  updateAdminSettings: (settings: Partial<AdminSettings>) => void;
  updatePrice: (sizeKey: string, price: number) => void;
  resetEditorDefaults: () => void;
  resetPricingDefaults: () => void;
  getPrice: (width: number, height: number) => number;
}

export type SettingsStore = SettingsState & SettingsActions;

// Default values
const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  defaultBoardSize: BOARD_SIZES[1], // 22" x 36"
  defaultDpi: 300,
  showGridByDefault: true,
  gridSizeInches: 1,
  exportDpi: 150,
  exportFormat: 'png',
  defaultMarginInches: 0.125,
};

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  cloudSyncEnabled: true,
  syncIntervalMs: 300000, // 5 minutes
  backendUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
};

const DEFAULT_PRICING: PricingSettings = {
  customPrices: { ...BOARD_PRICES },
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      editor: DEFAULT_EDITOR_SETTINGS,
      admin: DEFAULT_ADMIN_SETTINGS,
      pricing: DEFAULT_PRICING,

      // Actions
      updateEditorSettings: (settings) => {
        set((state) => ({
          editor: { ...state.editor, ...settings },
        }));
      },

      updateAdminSettings: (settings) => {
        set((state) => ({
          admin: { ...state.admin, ...settings },
        }));
      },

      updatePrice: (sizeKey, price) => {
        set((state) => ({
          pricing: {
            ...state.pricing,
            customPrices: {
              ...state.pricing.customPrices,
              [sizeKey]: price,
            },
          },
        }));
      },

      resetEditorDefaults: () => {
        set({ editor: DEFAULT_EDITOR_SETTINGS });
      },

      resetPricingDefaults: () => {
        set({ pricing: DEFAULT_PRICING });
      },

      getPrice: (width, height) => {
        const key = `${width}x${height}`;
        return get().pricing.customPrices[key] || BOARD_PRICES[key] || 29.99;
      },
    }),
    {
      name: 'gang-sheet-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        editor: state.editor,
        admin: state.admin,
        pricing: state.pricing,
      }),
    }
  )
);

// Sync interval options for UI
export const SYNC_INTERVAL_OPTIONS = [
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '10 minutes', value: 600000 },
];

// DPI options for UI
export const DPI_OPTIONS = [72, 150, 200, 300, 600];

// Export format options
export const EXPORT_FORMAT_OPTIONS = [
  { label: 'PNG (Lossless)', value: 'png' },
  { label: 'JPEG (Compressed)', value: 'jpeg' },
];
