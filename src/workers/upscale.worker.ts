// GPU-accelerated upscale via OffscreenCanvas.drawImage (browser handles interpolation natively)

const MAX_SIDE = 4000; // hard cap — prevents OOM on repeated upscales

self.onmessage = async (e: MessageEvent) => {
  const { bitmap, width, height, scale } = e.data as {
    bitmap: ImageBitmap;
    width: number;
    height: number;
    scale: number;
  };

  try {
    let dstW = Math.round(width * scale);
    let dstH = Math.round(height * scale);

    // Clamp to max side — keep aspect ratio
    if (dstW > MAX_SIDE || dstH > MAX_SIDE) {
      const ratio = Math.min(MAX_SIDE / dstW, MAX_SIDE / dstH);
      dstW = Math.round(dstW * ratio);
      dstH = Math.round(dstH * ratio);
    }

    const canvas = new OffscreenCanvas(dstW, dstH);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close(); // free source bitmap memory immediately

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ success: true, blob, outW: dstW, outH: dstH });
  } catch (err) {
    bitmap.close();
    self.postMessage({ success: false, error: (err as Error).message });
  }
};
