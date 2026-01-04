import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  EditorStore,
  EditorState,
  BoardSize,
  Asset,
  CanvasItem,
  AutoFillSettings,
} from '../types';
import {
  BOARD_SIZES,
  DEFAULT_DPI,
  inchesToPx,
} from '../types';

const DEFAULT_AUTO_FILL_SETTINGS: AutoFillSettings = {
  mode: 'repeat-selected',
  spacingPx: inchesToPx(0.1), // 0.1 inch spacing
  marginPx: inchesToPx(0.25), // 0.25 inch margin
  align: 'top-left',
  alternateRowOffset: false,
};

const initialState: EditorState = {
  boardSize: BOARD_SIZES[1], // 22x36 default
  dpi: DEFAULT_DPI,
  assets: {},
  items: [],
  selectedIds: [],
  autoFillSettings: DEFAULT_AUTO_FILL_SETTINGS,
  history: [],
  historyIndex: -1,
};

const MAX_HISTORY_SIZE = 50;

export const useEditorStore = create<EditorStore>()((set, get) => ({
  ...initialState,

  // Board
  setBoardSize: (size: BoardSize) => {
    set({ boardSize: size });
  },

  setDpi: (dpi: number) => {
    set({ dpi: Math.max(72, Math.min(600, dpi)) });
  },

  // Assets
  addAsset: (asset: Asset) => {
    set((state) => ({
      assets: { ...state.assets, [asset.id]: asset },
    }));
  },

  removeAsset: (id: string) => {
    set((state) => {
      const newAssets = { ...state.assets };
      delete newAssets[id];
      const newItems = state.items.filter((item) => item.assetId !== id);
      const newSelectedIds = state.selectedIds.filter((selectedId) =>
        newItems.some((item) => item.id === selectedId)
      );
      return {
        assets: newAssets,
        items: newItems,
        selectedIds: newSelectedIds,
      };
    });
  },

  // Items
  addItem: (item: CanvasItem) => {
    get().pushToHistory();
    set((state) => ({
      items: [...state.items, item],
    }));
  },

  updateItem: (id: string, updates: Partial<CanvasItem>) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  },

  removeItem: (id: string) => {
    get().pushToHistory();
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
    }));
  },

  removeSelectedItems: () => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;

    get().pushToHistory();
    set((state) => ({
      items: state.items.filter((item) => !state.selectedIds.includes(item.id)),
      selectedIds: [],
    }));
  },

  clearAllItems: () => {
    get().pushToHistory();
    set({
      items: [],
      selectedIds: [],
      assets: {},
    });
  },

  // Selection
  setSelectedIds: (ids: string[]) => {
    set({ selectedIds: ids });
  },

  clearSelection: () => {
    set({ selectedIds: [] });
  },

  // Duplicate
  duplicateItem: (id: string) => {
    const { items, getBoardPxWidth, getBoardPxHeight } = get();
    const item = items.find((i) => i.id === id);
    if (!item) return;

    get().pushToHistory();

    const offset = inchesToPx(0.25); // 0.25 inch offset
    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();

    // Calculate new position, clamping to board bounds
    let newX = item.x + offset;
    let newY = item.y + offset;

    // Clamp to board bounds
    if (newX + item.width > boardWidth) {
      newX = Math.max(0, boardWidth - item.width);
    }
    if (newY + item.height > boardHeight) {
      newY = Math.max(0, boardHeight - item.height);
    }

    const newItem: CanvasItem = {
      ...item,
      id: uuidv4(),
      x: newX,
      y: newY,
      zIndex: Math.max(...items.map((i) => i.zIndex), 0) + 1,
    };

    set((state) => ({
      items: [...state.items, newItem],
      selectedIds: [newItem.id],
    }));
  },

  duplicateSelectedItems: () => {
    const { items, selectedIds, getBoardPxWidth, getBoardPxHeight } = get();
    if (selectedIds.length === 0) return;

    get().pushToHistory();

    const offset = inchesToPx(0.25);
    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();
    const maxZIndex = Math.max(...items.map((i) => i.zIndex), 0);

    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const newItems: CanvasItem[] = [];
    const newIds: string[] = [];

    selectedItems.forEach((item, index) => {
      let newX = item.x + offset;
      let newY = item.y + offset;

      if (newX + item.width > boardWidth) {
        newX = Math.max(0, boardWidth - item.width);
      }
      if (newY + item.height > boardHeight) {
        newY = Math.max(0, boardHeight - item.height);
      }

      const newItem: CanvasItem = {
        ...item,
        id: uuidv4(),
        x: newX,
        y: newY,
        zIndex: maxZIndex + index + 1,
      };
      newItems.push(newItem);
      newIds.push(newItem.id);
    });

    set((state) => ({
      items: [...state.items, ...newItems],
      selectedIds: newIds,
    }));
  },

  // Auto Fill
  setAutoFillSettings: (settings: Partial<AutoFillSettings>) => {
    set((state) => ({
      autoFillSettings: { ...state.autoFillSettings, ...settings },
    }));
  },

  autoFillSheet: () => {
    const { items, selectedIds, autoFillSettings, getBoardPxWidth, getBoardPxHeight } = get();

    if (selectedIds.length === 0) return;

    // Get selected items
    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    if (selectedItems.length === 0) return;

    // Use first selected item for repeat mode
    const templateItem = selectedItems[0];

    const { spacingPx, marginPx, align, alternateRowOffset } = autoFillSettings;
    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();

    // Calculate usable area
    const usableWidth = boardWidth - 2 * marginPx;
    const usableHeight = boardHeight - 2 * marginPx;

    // Get item dimensions (for now, ignore rotation for simplicity)
    const itemWidth = templateItem.width;
    const itemHeight = templateItem.height;

    if (itemWidth <= 0 || itemHeight <= 0) return;

    // Calculate grid
    const cols = Math.floor((usableWidth + spacingPx) / (itemWidth + spacingPx));
    const rows = Math.floor((usableHeight + spacingPx) / (itemHeight + spacingPx));

    if (cols <= 0 || rows <= 0) return;

    const totalItems = cols * rows;

    // Warn if too many items
    if (totalItems > 500) {
      const confirmed = window.confirm(
        `This will create ${totalItems} items. This may affect performance. Continue?`
      );
      if (!confirmed) return;
    }

    get().pushToHistory();

    const maxZIndex = Math.max(...items.map((i) => i.zIndex), 0);
    const newItems: CanvasItem[] = [];

    // Calculate starting position based on alignment
    let startX = marginPx;
    let startY = marginPx;

    if (align === 'center') {
      const totalGridWidth = cols * itemWidth + (cols - 1) * spacingPx;
      const totalGridHeight = rows * itemHeight + (rows - 1) * spacingPx;
      startX = (boardWidth - totalGridWidth) / 2;
      startY = (boardHeight - totalGridHeight) / 2;
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let x = startX + col * (itemWidth + spacingPx);
        const y = startY + row * (itemHeight + spacingPx);

        // Apply brick pattern offset
        if (alternateRowOffset && row % 2 === 1) {
          x += (itemWidth + spacingPx) / 2;
          // Skip if it would go out of bounds
          if (x + itemWidth > boardWidth - marginPx) continue;
        }

        // Skip the original item position (approximately)
        const isOriginalPosition =
          Math.abs(x - templateItem.x) < 10 &&
          Math.abs(y - templateItem.y) < 10;

        if (isOriginalPosition) continue;

        const newItem: CanvasItem = {
          ...templateItem,
          id: uuidv4(),
          x,
          y,
          zIndex: maxZIndex + newItems.length + 1,
        };
        newItems.push(newItem);
      }
    }

    set((state) => ({
      items: [...state.items, ...newItems],
      // Keep original item selected, add new items to selection
      selectedIds: [templateItem.id, ...newItems.map((i) => i.id)],
    }));
  },

  // History
  pushToHistory: () => {
    set((state) => {
      // Remove any future history if we're not at the end
      let newHistory = state.history;
      let newHistoryIndex = state.historyIndex;

      if (state.historyIndex < state.history.length - 1) {
        newHistory = state.history.slice(0, state.historyIndex + 1);
      }

      // Deep clone current items
      const snapshot = JSON.parse(JSON.stringify(state.items));
      newHistory = [...newHistory, snapshot];

      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory = newHistory.slice(1);
      } else {
        newHistoryIndex++;
      }

      return {
        history: newHistory,
        historyIndex: newHistoryIndex,
      };
    });
  },

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex < 0) return;

    set((state) => {
      let newHistory = state.history;

      if (state.historyIndex === state.history.length - 1) {
        // Save current state before undoing
        const snapshot = JSON.parse(JSON.stringify(state.items));
        newHistory = [...state.history, snapshot];
      }

      return {
        history: newHistory,
        items: JSON.parse(JSON.stringify(history[historyIndex])),
        historyIndex: state.historyIndex - 1,
        selectedIds: [],
      };
    });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 2) return;

    set((state) => ({
      historyIndex: state.historyIndex + 1,
      items: JSON.parse(JSON.stringify(history[state.historyIndex + 2])),
      selectedIds: [],
    }));
  },

  // Board dimensions helpers
  getBoardPxWidth: () => {
    const { boardSize, dpi } = get();
    return inchesToPx(boardSize.width, dpi);
  },

  getBoardPxHeight: () => {
    const { boardSize, dpi } = get();
    return inchesToPx(boardSize.height, dpi);
  },
}));
