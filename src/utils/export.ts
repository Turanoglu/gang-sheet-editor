import Konva from 'konva';
import type { BoardSize } from '../types';
import { inchesToPx } from '../types';

/**
 * Minimal uncompressed TIFF encoder with proper DPI metadata.
 * Produces a valid RGBA TIFF (little-endian) readable by all RIP software.
 */
function writeTiff(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, dpi = 300): ArrayBuffer {
  const dataLen = w * h * 4;

  // IFD layout (14 entries, sorted by tag number):
  //   256 ImageWidth, 257 ImageLength, 258 BitsPerSample (offset),
  //   259 Compression, 262 PhotometricInterpretation, 273 StripOffsets,
  //   277 SamplesPerPixel, 278 RowsPerStrip, 279 StripByteCounts,
  //   282 XResolution (offset), 283 YResolution (offset),
  //   284 PlanarConfiguration, 296 ResolutionUnit, 338 ExtraSamples
  const NUM_TAGS  = 14;
  const IFD_OFF   = 8;                              // right after header
  const IFD_LEN   = 2 + NUM_TAGS * 12 + 4;
  // Values requiring file offsets (> 4 bytes):
  //   BitsPerSample: 4 × SHORT = 8 bytes
  //   XResolution:   1 RATIONAL = 8 bytes
  //   YResolution:   1 RATIONAL = 8 bytes
  const VALS_OFF  = IFD_OFF + IFD_LEN;
  const BITS_OFF  = VALS_OFF;
  const XRES_OFF  = VALS_OFF + 8;
  const YRES_OFF  = VALS_OFF + 16;
  const DATA_OFF  = VALS_OFF + 24;

  const buf = new ArrayBuffer(DATA_OFF + dataLen);
  const v   = new DataView(buf);
  const LE  = true;

  // --- TIFF header ---
  v.setUint16(0, 0x4949, LE);  // 'II' = little-endian
  v.setUint16(2, 42,     LE);  // magic
  v.setUint32(4, IFD_OFF, LE); // offset to first IFD

  // --- IFD ---
  let p = IFD_OFF;
  v.setUint16(p, NUM_TAGS, LE); p += 2;

  const e = (tag: number, type: number, count: number, val: number) => {
    v.setUint16(p,     tag,   LE);
    v.setUint16(p + 2, type,  LE);
    v.setUint32(p + 4, count, LE);
    v.setUint32(p + 8, val,   LE); // inline value OR file offset
    p += 12;
  };

  // type: 3=SHORT, 4=LONG, 5=RATIONAL
  e(256, 4, 1, w);           // ImageWidth
  e(257, 4, 1, h);           // ImageLength
  e(258, 3, 4, BITS_OFF);    // BitsPerSample → 4 shorts at BITS_OFF
  e(259, 3, 1, 1);           // Compression = none
  e(262, 3, 1, 2);           // PhotometricInterpretation = RGB
  e(273, 4, 1, DATA_OFF);    // StripOffsets
  e(277, 3, 1, 4);           // SamplesPerPixel = 4 (RGBA)
  e(278, 4, 1, h);           // RowsPerStrip = full image
  e(279, 4, 1, dataLen);     // StripByteCounts
  e(282, 5, 1, XRES_OFF);    // XResolution → rational at XRES_OFF
  e(283, 5, 1, YRES_OFF);    // YResolution → rational at YRES_OFF
  e(284, 3, 1, 1);           // PlanarConfiguration = chunky
  e(296, 3, 1, 2);           // ResolutionUnit = inch
  e(338, 3, 1, 2);           // ExtraSamples = unassociated alpha
  v.setUint32(p, 0, LE);     // next IFD = 0 (last)

  // --- BitsPerSample: 8, 8, 8, 8 ---
  for (let i = 0; i < 4; i++) v.setUint16(BITS_OFF + i * 2, 8, LE);

  // --- XResolution & YResolution rationals: dpi / 1 ---
  v.setUint32(XRES_OFF,     dpi, LE); v.setUint32(XRES_OFF + 4, 1, LE);
  v.setUint32(YRES_OFF,     dpi, LE); v.setUint32(YRES_OFF + 4, 1, LE);

  // --- Pixel data ---
  const src = rgba instanceof Uint8ClampedArray
    ? new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)
    : rgba;
  new Uint8Array(buf, DATA_OFF).set(src);

  return buf;
}

export interface ExportOptions {
  stage: Konva.Stage;
  boardSize: BoardSize;
  dpi: number;
  displayScale: number; // Current scale of the stage for display
  gridLayerName?: string;
  transformerName?: string;
  quality?: 'thumbnail' | 'full' | 'tiny' | 'print';
}

/**
 * Generate a clean export/thumbnail as data URL (without grid, selections, etc.)
 */
export function generateCleanExport(options: ExportOptions): string {
  const {
    stage,
    boardSize,
    dpi,
    displayScale,
    gridLayerName = 'gridLayer',
    transformerName = 'transformer',
    quality = 'thumbnail',
  } = options;

  // Calculate target pixel dimensions based on quality
  let pixelRatio = 1;
  const targetWidth = inchesToPx(boardSize.width, dpi);
  const targetHeight = inchesToPx(boardSize.height, dpi);
  const currentBoardDisplayWidth = targetWidth * displayScale;
  const currentBoardDisplayHeight = targetHeight * displayScale;

  if (quality === 'full') {
    // Full resolution (original DPI)
    pixelRatio = targetWidth / currentBoardDisplayWidth;
  } else if (quality === 'print') {
    // Print-ready resolution (150 DPI - good for DTF printing)
    const printDpi = 150;
    const printWidth = boardSize.width * printDpi;
    pixelRatio = printWidth / currentBoardDisplayWidth;
  } else if (quality === 'thumbnail') {
    // Medium resolution for previews (max 800px width)
    const maxWidth = 800;
    pixelRatio = Math.min(maxWidth / currentBoardDisplayWidth, targetWidth / currentBoardDisplayWidth);
  } else if (quality === 'tiny') {
    // Tiny resolution for storage (max 200px width)
    const maxWidth = 200;
    pixelRatio = Math.min(maxWidth / currentBoardDisplayWidth, targetWidth / currentBoardDisplayWidth);
  }

  // Find and hide background layer for transparent export
  const backgroundLayer = stage.findOne('.backgroundLayer');
  const backgroundWasVisible = backgroundLayer?.visible();
  if (backgroundLayer) {
    backgroundLayer.visible(false);
  }

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
    // Export as data URL
    const dataUrl = stage.toDataURL({
      mimeType: 'image/png',
      pixelRatio: pixelRatio,
      x: 0,
      y: 0,
      width: currentBoardDisplayWidth,
      height: currentBoardDisplayHeight,
    });

    return dataUrl;
  } finally {
    // Restore visibility
    if (backgroundLayer && backgroundWasVisible) {
      backgroundLayer.visible(true);
    }
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
 * Export the stage as PNG with exact board dimensions and transparent background
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

  // Find and hide background layer for transparent export
  const backgroundLayer = stage.findOne('.backgroundLayer');
  const backgroundWasVisible = backgroundLayer?.visible();
  if (backgroundLayer) {
    backgroundLayer.visible(false);
  }

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
    // Export with transparent background
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
    if (backgroundLayer && backgroundWasVisible) {
      backgroundLayer.visible(true);
    }
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
 * Export the stage as TIFF (print-ready, full DPI)
 */
export async function exportAsTiff(options: ExportOptions): Promise<void> {
  const { stage, boardSize, dpi, displayScale } = options;

  const targetWidth = inchesToPx(boardSize.width, dpi);
  const targetHeight = inchesToPx(boardSize.height, dpi);
  const currentBoardDisplayWidth = targetWidth * displayScale;
  const currentBoardDisplayHeight = targetHeight * displayScale;
  const pixelRatio = targetWidth / currentBoardDisplayWidth;

  const backgroundLayer = stage.findOne('.backgroundLayer');
  const bgWas = backgroundLayer?.visible();
  if (backgroundLayer) backgroundLayer.visible(false);
  const gridLayer = stage.findOne('.gridLayer');
  const gridWas = gridLayer?.visible();
  if (gridLayer) gridLayer.visible(false);
  const transformer = stage.findOne('.transformer') as Konva.Transformer | null;
  const trWas = transformer?.visible();
  if (transformer) transformer.visible(false);
  stage.batchDraw();

  try {
    const dataUrl = stage.toDataURL({
      mimeType: 'image/png',
      pixelRatio,
      x: 0,
      y: 0,
      width: currentBoardDisplayWidth,
      height: currentBoardDisplayHeight,
    });

    // Convert dataUrl → RGBA pixel data — transparency preserved (no white fill)
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

    const tiffBuffer = writeTiff(imageData.data, targetWidth, targetHeight, dpi);

    // Download
    const blob = new Blob([tiffBuffer], { type: 'image/tiff' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `gang-sheet-${boardSize.width}x${boardSize.height}-${dpi}dpi-${Date.now()}.tiff`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } finally {
    if (backgroundLayer && bgWas) backgroundLayer.visible(true);
    if (gridLayer && gridWas) gridLayer.visible(true);
    if (transformer && trWas) transformer.visible(true);
    stage.batchDraw();
  }
}

/**
 * Convert a PNG dataUrl to TIFF and download
 */
export async function downloadAsTiff(dataUrl: string, filename: string): Promise<void> {
  // Fetch as blob first to avoid tainted canvas CORS issues with presigned R2 URLs
  const fetchedBlob = await fetch(dataUrl).then(r => r.blob());
  const blobUrl = URL.createObjectURL(fetchedBlob);
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = blobUrl; });
  URL.revokeObjectURL(blobUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);

  // 300 DPI is the DTF production standard — matches the design intent
  const tiffBuffer = writeTiff(imageData.data, w, h, 300);
  const blob = new Blob([tiffBuffer], { type: 'image/tiff' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
