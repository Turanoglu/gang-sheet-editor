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

// Calculate effective resolution (DPI) based on original pixels and display inches
export function calculateResolution(originalPx: number, displayInches: number): number {
  if (displayInches <= 0) return 0;
  return Math.round(originalPx / displayInches);
}

// Get resolution quality label and color
export function getResolutionQuality(dpi: number): { label: string; color: string; textColor: string } {
  if (dpi >= 300) {
    return { label: 'Excellent', color: 'bg-green-100', textColor: 'text-green-700' };
  } else if (dpi >= 200) {
    return { label: 'Good', color: 'bg-blue-100', textColor: 'text-blue-700' };
  } else if (dpi >= 150) {
    return { label: 'Fair', color: 'bg-yellow-100', textColor: 'text-yellow-700' };
  } else if (dpi >= 100) {
    return { label: 'Low', color: 'bg-orange-100', textColor: 'text-orange-700' };
  } else {
    return { label: 'Poor', color: 'bg-red-100', textColor: 'text-red-700' };
  }
}

// Asset stored in cache
export interface Asset {
  id: string;
  name: string;
  originalWidth: number;
  originalHeight: number;
  imageEl: HTMLImageElement;
  dataUrl: string;
  r2Key?: string; // R2 storage key — preserved when loaded from cloud so re-save skips re-upload
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

// Item quantity for duplicating multiple copies
export interface ItemQuantity {
  assetId: string;
  quantity: number;
}

// Sheet snapshot for multi-board support
export interface SheetData {
  id: string;
  label: string;
  items: CanvasItem[];
  assets: Record<string, Asset>;
  boardSize: BoardSize;
  itemQuantities: Record<string, number>;
  thumbnailUrl?: string;
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

  // History for undo/redo (items + assets so bg-removal and upscale are undoable)
  history: { items: CanvasItem[]; assets: Record<string, Asset> }[];
  historyIndex: number;

  // UI state
  gridVisible: boolean;
  zoomLevel: number; // 0.1 to 2.0 (10% to 200%)
  marginInches: number; // Margin between items in inches

  // Quantity for each asset
  itemQuantities: Record<string, number>;

  // Overflow warning
  hasOverflow: boolean;

  // Overlap warning
  hasOverlap: boolean;

  // Multi-sheet
  sheets: SheetData[];
  activeSheetId: string;
}

// Actions
export interface EditorActions {
  // Board
  setBoardSize: (size: BoardSize) => void;
  setDpi: (dpi: number) => void;

  // Assets
  addAsset: (asset: Asset) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
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

  // Load a saved design into the editor
  loadDesign: (design: import('./order').GangSheetDesign) => Promise<void>;

  // Board dimensions helpers
  getBoardPxWidth: () => number;
  getBoardPxHeight: () => number;

  // UI State
  toggleGrid: () => void;
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setMarginInches: (margin: number) => void;
  
  // Quantity
  setItemQuantity: (assetId: string, quantity: number) => void;
  applyQuantities: () => void;
  autoArrangeSheet: () => void;
  
  // Alignment
  alignItems: (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  
  // Overflow check
  checkOverflow: () => boolean;
  setHasOverflow: (hasOverflow: boolean) => void;

  // Overlap check
  checkOverlap: () => boolean;

  // Position control - move to board edges
  moveToTop: () => void;
  moveToBottom: () => void;

  // Multi-sheet
  addSheet: (thumbnailUrl?: string) => void;
  switchSheet: (id: string, thumbnailUrl?: string) => void;
  deleteSheet: (id: string) => void;
  updateSheetThumbnail: (id: string, thumbnailUrl: string) => void;
}

export type EditorStore = EditorState & EditorActions;
