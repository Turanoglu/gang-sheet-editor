import Konva from 'konva';
import type { BoardSize } from '../types';
import { inchesToPx } from '../types';

export interface ExportOptions {
  stage: Konva.Stage;
  boardSize: BoardSize;
  dpi: number;
  displayScale: number; // Current scale of the stage for display
  gridLayerName?: string;
  transformerName?: string;
}

/**
 * Export the stage as PNG with exact board dimensions and white background
 */
export async function exportAsPng(options: ExportOptions): Promise<void> {
  const {
    stage,
    boardSize,
    dpi,
    displayScale,
    gridLayerName = 'gridLayer',
    transformerName = 'transformer',
  } = options;

  // Calculate target pixel dimensions
  const targetWidth = inchesToPx(boardSize.width, dpi);
  const targetHeight = inchesToPx(boardSize.height, dpi);

  // Calculate pixel ratio to get exact dimensions
  const currentBoardDisplayWidth = targetWidth * displayScale;
  const currentBoardDisplayHeight = targetHeight * displayScale;
  const pixelRatio = targetWidth / currentBoardDisplayWidth;

  // Find and hide grid layer
  const gridLayer = stage.findOne(`.${gridLayerName}`);
  const gridWasVisible = gridLayer?.visible();
  if (gridLayer) {
    gridLayer.visible(false);
  }

  // Find and hide transformer
  const transformer = stage.findOne(`.${transformerName}`) as Konva.Transformer | null;
  const transformerWasVisible = transformer?.visible();
  if (transformer) {
    transformer.visible(false);
  }

  // Hide all selection highlights
  const selectionRects = stage.find('.selectionRect');
  const selectionVisibility: boolean[] = [];
  selectionRects.forEach((rect, index) => {
    selectionVisibility[index] = rect.visible();
    rect.visible(false);
  });

  // Force redraw
  stage.batchDraw();

  try {
    // Export with white background
    const dataUrl = stage.toDataURL({
      mimeType: 'image/png',
      pixelRatio: pixelRatio,
      x: 0,
      y: 0,
      width: currentBoardDisplayWidth,
      height: currentBoardDisplayHeight,
    });

    // Create download link
    const link = document.createElement('a');
    link.download = `gang-sheet-${boardSize.width}x${boardSize.height}-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    // Restore visibility
    if (gridLayer && gridWasVisible) {
      gridLayer.visible(true);
    }
    if (transformer && transformerWasVisible) {
      transformer.visible(true);
    }
    selectionRects.forEach((rect, index) => {
      rect.visible(selectionVisibility[index]);
    });

    stage.batchDraw();
  }
}

/**
 * Load an image file and return asset data
 */
export function loadImageFile(file: File): Promise<{
  dataUrl: string;
  imageEl: HTMLImageElement;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();

      img.onload = () => {
        resolve({
          dataUrl,
          imageEl: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = dataUrl;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize rotation to 0-360 range
 */
export function normalizeRotation(deg: number): number {
  let normalized = deg % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}
