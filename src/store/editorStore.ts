import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  EditorStore,
  EditorState,
  BoardSize,
  Asset,
  CanvasItem,
  AutoFillSettings,
  SheetData,
} from '../types';
import {
  BOARD_SIZES,
  DEFAULT_DPI,
  inchesToPx,
} from '../types';

// Helper: get axis-aligned bounding box of a (possibly rotated) item
function getAABB(item: CanvasItem) {
  if (item.rotation === 0) {
    return { left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height };
  }
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const hw = (item.width * cos + item.height * sin) / 2;
  const hh = (item.width * sin + item.height * cos) / 2;
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
}

const DEFAULT_AUTO_FILL_SETTINGS: AutoFillSettings = {
  mode: 'repeat-selected',
  spacingPx: inchesToPx(0.1), // 0.1 inch spacing
  marginPx: inchesToPx(0.25), // 0.25 inch margin
  align: 'top-left',
  alternateRowOffset: false,
};

const FIRST_SHEET_ID = uuidv4();

const initialState: EditorState = {
  boardSize: BOARD_SIZES[1], // 22x36 default
  dpi: DEFAULT_DPI,
  assets: {},
  items: [],
  selectedIds: [],
  autoFillSettings: DEFAULT_AUTO_FILL_SETTINGS,
  history: [],
  historyIndex: -1,
  // UI state
  gridVisible: true,
  zoomLevel: 1.0,
  marginInches: 0.125,
  itemQuantities: {},
  hasOverflow: false,
  hasOverlap: false,
  // Multi-sheet
  sheets: [{ id: FIRST_SHEET_ID, label: 'Sheet 1', items: [], assets: {}, boardSize: BOARD_SIZES[1], itemQuantities: {} }],
  activeSheetId: FIRST_SHEET_ID,
};

const MAX_HISTORY_SIZE = 50;

export const useEditorStore = create<EditorStore>()((set, get) => ({
  ...initialState,

  // Board
  setBoardSize: (size: BoardSize) => {
    const { items, dpi } = get();
    const newBoardWidth = inchesToPx(size.width, dpi);
    const newBoardHeight = inchesToPx(size.height, dpi);

    const repositionedItems = items.map((item) => {
      const maxX = Math.max(0, newBoardWidth - item.width);
      const maxY = Math.max(0, newBoardHeight - item.height);
      return {
        ...item,
        x: Math.min(Math.max(0, item.x), maxX),
        y: Math.min(Math.max(0, item.y), maxY),
      };
    });

    set({ boardSize: size, items: repositionedItems });
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
    const { items, getBoardPxWidth, getBoardPxHeight, autoFillSettings } = get();
    const item = items.find((i) => i.id === id);
    if (!item) return;

    get().pushToHistory();

    const spacingPx = autoFillSettings.spacingPx;
    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();

    // Try placing to the right first, then below, then clamp
    let newX = item.x + item.width + spacingPx;
    let newY = item.y;

    if (newX + item.width > boardWidth) {
      // Doesn't fit to the right → place below
      newX = item.x;
      newY = item.y + item.height + spacingPx;
    }

    // Final clamp to board bounds
    newX = Math.max(0, Math.min(newX, boardWidth - item.width));
    newY = Math.max(0, Math.min(newY, boardHeight - item.height));

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
    const { items, selectedIds, getBoardPxWidth, getBoardPxHeight, autoFillSettings } = get();
    if (selectedIds.length === 0) return;

    get().pushToHistory();

    const spacingPx = autoFillSettings.spacingPx;
    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();
    const maxZIndex = Math.max(...items.map((i) => i.zIndex), 0);

    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const newItems: CanvasItem[] = [];
    const newIds: string[] = [];

    selectedItems.forEach((item, index) => {
      // Try placing to the right first, then below, then clamp
      let newX = item.x + item.width + spacingPx;
      let newY = item.y;

      if (newX + item.width > boardWidth) {
        newX = item.x;
        newY = item.y + item.height + spacingPx;
      }

      newX = Math.max(0, Math.min(newX, boardWidth - item.width));
      newY = Math.max(0, Math.min(newY, boardHeight - item.height));

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

    let firstCell = true;
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

        if (firstCell) {
          // Move the template item itself to the first grid cell (keep its id)
          newItems.push({ ...templateItem, x, y });
          firstCell = false;
        } else {
          newItems.push({
            ...templateItem,
            id: uuidv4(),
            x,
            y,
            zIndex: maxZIndex + newItems.length + 1,
          });
        }
      }
    }

    set((state) => ({
      // Remove ALL items of the same asset (not just the template by id),
      // so re-running auto-fill doesn't accumulate duplicate grids.
      items: [...state.items.filter((i) => i.assetId !== templateItem.assetId), ...newItems],
      selectedIds: newItems.map((i) => i.id),
      hasOverlap: false,
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

  // UI State
  toggleGrid: () => {
    set((state) => ({ gridVisible: !state.gridVisible }));
  },

  setZoomLevel: (level: number) => {
    set({ zoomLevel: Math.max(0.05, Math.min(10.0, level)) });
  },

  zoomIn: () => {
    set((state) => ({ zoomLevel: Math.min(10.0, state.zoomLevel + 0.1) }));
  },

  zoomOut: () => {
    set((state) => ({ zoomLevel: Math.max(0.05, state.zoomLevel - 0.1) }));
  },

  setMarginInches: (margin: number) => {
    set({ marginInches: Math.max(0, margin) });
    set((state) => ({
      autoFillSettings: {
        ...state.autoFillSettings,
        spacingPx: inchesToPx(margin),
      },
    }));
  },

  // Quantity
  setItemQuantity: (assetId: string, quantity: number) => {
    set((state) => ({
      itemQuantities: {
        ...state.itemQuantities,
        [assetId]: Math.max(1, quantity),
      },
    }));
  },

  applyQuantities: () => {
    const { items, itemQuantities, getBoardPxWidth, getBoardPxHeight, autoFillSettings } = get();

    get().pushToHistory();

    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();
    const spacingPx = autoFillSettings.spacingPx;
    const marginPx = autoFillSettings.marginPx;
    const maxZIndex = Math.max(...items.map((i) => i.zIndex), 0);
    let zIndexCounter = maxZIndex + 1;

    // Get unique asset items (one per asset)
    const assetItems = new Map<string, CanvasItem>();
    items.forEach((item) => {
      if (!assetItems.has(item.assetId)) {
        assetItems.set(item.assetId, item);
      }
    });

    // Auto-build layout: flow placement left-to-right, top-to-bottom within board bounds
    const finalItems: CanvasItem[] = [];
    let cursorX = marginPx;
    let cursorY = marginPx;
    let rowMaxHeight = 0;

    assetItems.forEach((templateItem, _assetId) => {
      const quantity = itemQuantities[templateItem.assetId] || 1;
      const itemWidth = templateItem.width;
      const itemHeight = templateItem.height;

      for (let i = 0; i < quantity; i++) {
        // Wrap to next row if item doesn't fit horizontally
        if (cursorX + itemWidth > boardWidth - marginPx && cursorX > marginPx) {
          cursorX = marginPx;
          cursorY += rowMaxHeight + spacingPx;
          rowMaxHeight = 0;
        }

        // Stop if item doesn't fit vertically
        if (cursorY + itemHeight > boardHeight - marginPx) {
          break;
        }

        const newItem: CanvasItem = {
          ...templateItem,
          id: i === 0 ? templateItem.id : uuidv4(),
          x: cursorX,
          y: cursorY,
          zIndex: i === 0 ? templateItem.zIndex : zIndexCounter++,
        };
        finalItems.push(newItem);

        cursorX += itemWidth + spacingPx;
        rowMaxHeight = Math.max(rowMaxHeight, itemHeight);
      }

      // After each asset group, move to next row for separation
      if (cursorX > marginPx) {
        cursorX = marginPx;
        cursorY += rowMaxHeight + spacingPx;
        rowMaxHeight = 0;
      }
    });

    set({ items: finalItems });
  },

  // Alignment
  alignItems: (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const { items, selectedIds, getBoardPxWidth, getBoardPxHeight } = get();
    if (selectedIds.length === 0) return;

    get().pushToHistory();

    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();

    // Find bounding box of selection
    const minX = Math.min(...selectedItems.map((i) => i.x));
    const maxX = Math.max(...selectedItems.map((i) => i.x + i.width));
    const minY = Math.min(...selectedItems.map((i) => i.y));
    const maxY = Math.max(...selectedItems.map((i) => i.y + i.height));
    const selectionWidth = maxX - minX;
    const selectionHeight = maxY - minY;

    let offsetX = 0;
    let offsetY = 0;

    switch (direction) {
      case 'left':
        offsetX = -minX;
        break;
      case 'center':
        offsetX = (boardWidth - selectionWidth) / 2 - minX;
        break;
      case 'right':
        offsetX = boardWidth - maxX;
        break;
      case 'top':
        offsetY = -minY;
        break;
      case 'middle':
        offsetY = (boardHeight - selectionHeight) / 2 - minY;
        break;
      case 'bottom':
        offsetY = boardHeight - maxY;
        break;
    }

    set((state) => ({
      items: state.items.map((item) => {
        if (selectedIds.includes(item.id)) {
          return {
            ...item,
            x: item.x + offsetX,
            y: item.y + offsetY,
          };
        }
        return item;
      }),
    }));
  },

  // Overflow check
  checkOverflow: () => {
    const { items, getBoardPxWidth, getBoardPxHeight } = get();
    const boardWidth = getBoardPxWidth();
    const boardHeight = getBoardPxHeight();

    const hasOverflow = items.some((item) => {
      // Account for rotation (simplified - just check basic bounds)
      const rad = (item.rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const rotatedWidth = item.width * cos + item.height * sin;
      const rotatedHeight = item.width * sin + item.height * cos;

      return (
        item.x < 0 ||
        item.y < 0 ||
        item.x + rotatedWidth > boardWidth ||
        item.y + rotatedHeight > boardHeight
      );
    });

    set({ hasOverflow });
    return hasOverflow;
  },

  setHasOverflow: (hasOverflow: boolean) => {
    set({ hasOverflow });
  },

  // Overlap check — AABB pairs
  // 1px tolerance avoids false positives from floating-point rounding in auto-build layout
  checkOverlap: () => {
    const { items } = get();
    const TOLERANCE = 1; // px
    let hasOverlap = false;

    outer: for (let i = 0; i < items.length; i++) {
      const a = getAABB(items[i]);
      for (let j = i + 1; j < items.length; j++) {
        const b = getAABB(items[j]);
        if (
          a.right - b.left > TOLERANCE &&
          b.right - a.left > TOLERANCE &&
          a.bottom - b.top > TOLERANCE &&
          b.bottom - a.top > TOLERANCE
        ) {
          hasOverlap = true;
          break outer;
        }
      }
    }

    set({ hasOverlap });
    return hasOverlap;
  },

  // Multi-sheet
  addSheet: (thumbnailUrl?: string) => {
    const { sheets, activeSheetId, items, assets, boardSize, itemQuantities } = get();

    // Snapshot current active sheet
    const updatedSheets: SheetData[] = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, items, assets, boardSize, itemQuantities, thumbnailUrl: thumbnailUrl ?? s.thumbnailUrl }
        : s
    );

    const newId = uuidv4();
    const newSheet: SheetData = {
      id: newId,
      label: `Sheet ${updatedSheets.length + 1}`,
      items: [],
      assets: {},
      boardSize: BOARD_SIZES[1],
      itemQuantities: {},
    };

    set({
      sheets: [...updatedSheets, newSheet],
      activeSheetId: newId,
      items: [],
      assets: {},
      boardSize: BOARD_SIZES[1],
      itemQuantities: {},
      selectedIds: [],
      history: [],
      historyIndex: -1,
      hasOverflow: false,
      hasOverlap: false,
    });
  },

  switchSheet: (id: string, thumbnailUrl?: string) => {
    const { sheets, activeSheetId, items, assets, boardSize, itemQuantities } = get();
    if (id === activeSheetId) return;

    // Save current state back into active sheet
    const updatedSheets: SheetData[] = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, items, assets, boardSize, itemQuantities, thumbnailUrl: thumbnailUrl ?? s.thumbnailUrl }
        : s
    );

    const target = updatedSheets.find((s) => s.id === id);
    if (!target) return;

    set({
      sheets: updatedSheets,
      activeSheetId: id,
      items: target.items,
      assets: target.assets,
      boardSize: target.boardSize,
      itemQuantities: target.itemQuantities,
      selectedIds: [],
      history: [],
      historyIndex: -1,
      hasOverflow: false,
      hasOverlap: false,
    });
  },

  deleteSheet: (id: string) => {
    const { sheets, activeSheetId } = get();
    if (sheets.length <= 1) return; // always keep at least one sheet

    const remaining = sheets.filter((s) => s.id !== id);

    if (id === activeSheetId) {
      const next = remaining[0];
      set({
        sheets: remaining,
        activeSheetId: next.id,
        items: next.items,
        assets: next.assets,
        boardSize: next.boardSize,
        itemQuantities: next.itemQuantities,
        selectedIds: [],
        history: [],
        historyIndex: -1,
        hasOverflow: false,
        hasOverlap: false,
      });
    } else {
      set({ sheets: remaining });
    }
  },

  updateSheetThumbnail: (id: string, thumbnailUrl: string) => {
    set((state) => ({
      sheets: state.sheets.map((s) => (s.id === id ? { ...s, thumbnailUrl } : s)),
    }));
  },

  loadDesign: async (design) => {
    try {
      const items: import('../types').CanvasItem[] = design.canvasData
        ? JSON.parse(design.canvasData)
        : [];
      const rawAssets: Record<string, import('../types').Asset> = design.assetsData
        ? JSON.parse(design.assetsData)
        : {};

      // imageEl is a DOM object — it cannot be serialized to JSON.
      // Recreate each HTMLImageElement from the stored dataUrl.
      const loadedAssets: Record<string, import('../types').Asset> = {};
      await Promise.all(
        Object.entries(rawAssets).map(
          ([id, raw]) =>
            new Promise<void>((resolve) => {
              const img = new window.Image();
              img.onload = () => { loadedAssets[id] = { ...raw, imageEl: img }; resolve(); };
              img.onerror = () => { loadedAssets[id] = { ...raw, imageEl: img }; resolve(); };
              img.src = raw.dataUrl;
            })
        )
      );

      set({
        items,
        assets: loadedAssets,
        boardSize: design.boardSize,
        selectedIds: [],
        history: [],
        historyIndex: -1,
      });
    } catch (err) {
      console.error('Failed to load design into editor:', err);
    }
  },

  // Position control - Move selected items to top of board
  moveToTop: () => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;

    get().pushToHistory();

    set((state) => ({
      items: state.items.map((item) => {
        if (selectedIds.includes(item.id)) {
          return {
            ...item,
            y: 0, // Move to top edge
          };
        }
        return item;
      }),
    }));
  },

  // Position control - Move selected items to bottom of board
  moveToBottom: () => {
    const { selectedIds, getBoardPxHeight } = get();
    if (selectedIds.length === 0) return;

    get().pushToHistory();
    const boardHeight = getBoardPxHeight();

    set((state) => ({
      items: state.items.map((item) => {
        if (selectedIds.includes(item.id)) {
          // Account for rotation when calculating height
          const rad = (item.rotation * Math.PI) / 180;
          const cos = Math.abs(Math.cos(rad));
          const sin = Math.abs(Math.sin(rad));
          const rotatedHeight = item.width * sin + item.height * cos;
          
          return {
            ...item,
            y: boardHeight - rotatedHeight, // Move to bottom edge
          };
        }
        return item;
      }),
    }));
  },
}));
