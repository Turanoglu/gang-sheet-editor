// Board size options (inches)
export interface BoardSize {
  width: number;
  height: number;
  label: string;
}

export const BOARD_SIZES: BoardSize[] = [
  { width: 22, height: 24, label: '22" x 24"' },
  { width: 22, height: 36, label: '22" x 36"' },
  { width: 22, height: 48, label: '22" x 48"' },
  { width: 22, height: 60, label: '22" x 60"' },
  { width: 22, height: 84, label: '22" x 84"' },
  { width: 22, height: 108, label: '22" x 108"' },
  { width: 22, height: 120, label: '22" x 120"' },
  { width: 22, height: 180, label: '22" x 180"' },
  { width: 22, height: 240, label: '22" x 240"' },
];

export const DEFAULT_DPI = 300;

// Convert inches to pixels at given DPI
export function inchesToPx(inches: number, dpi: number = DEFAULT_DPI): number {
  return Math.round(inches * dpi);
}

// Convert pixels to inches at given DPI
export function pxToInches(px: number, dpi: number = DEFAULT_DPI): number {
  return px / dpi;
}

// Asset stored in cache
export interface Asset {
  id: string;
  name: string;
  originalWidth: number;
  originalHeight: number;
  imageEl: HTMLImageElement;
  dataUrl: string;
}

// Canvas item representing an image on the board
export interface CanvasItem {
  id: string;
  assetId: string;
  // Position in pixels at 300 DPI (board coordinates)
  x: number;
  y: number;
  // Dimensions in pixels at 300 DPI
  width: number;
  height: number;
  // Rotation in degrees
  rotation: number;
  // Lock aspect ratio
  lockedAspect: boolean;
  // Optional properties
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  // Z-index for layering
  zIndex: number;
}

// Auto fill settings
export interface AutoFillSettings {
  mode: 'repeat-selected' | 'fill-with-selection';
  spacingPx: number; // Spacing in pixels at 300 DPI
  marginPx: number; // Margin in pixels at 300 DPI
  align: 'top-left' | 'center';
  alternateRowOffset: boolean; // Brick pattern
}

// Editor state
export interface EditorState {
  // Board settings
  boardSize: BoardSize;
  dpi: number;

  // Assets cache
  assets: Record<string, Asset>;

  // Canvas items
  items: CanvasItem[];

  // Selection
  selectedIds: string[];

  // Auto fill settings
  autoFillSettings: AutoFillSettings;

  // History for undo/redo
  history: CanvasItem[][];
  historyIndex: number;
}

// Actions
export interface EditorActions {
  // Board
  setBoardSize: (size: BoardSize) => void;
  setDpi: (dpi: number) => void;

  // Assets
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;

  // Items
  addItem: (item: CanvasItem) => void;
  updateItem: (id: string, updates: Partial<CanvasItem>) => void;
  removeItem: (id: string) => void;
  removeSelectedItems: () => void;
  clearAllItems: () => void;

  // Selection
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;

  // Duplicate
  duplicateItem: (id: string) => void;
  duplicateSelectedItems: () => void;

  // Auto Fill
  setAutoFillSettings: (settings: Partial<AutoFillSettings>) => void;
  autoFillSheet: () => void;

  // History
  pushToHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Board dimensions helpers
  getBoardPxWidth: () => number;
  getBoardPxHeight: () => number;
}

export type EditorStore = EditorState & EditorActions;
