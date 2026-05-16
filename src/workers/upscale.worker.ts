// Lanczos interpolation - professional quality, fast, no dependencies

function lanczosKernel(x: number, a: number): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

function lanczosResize(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  a = 3,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dstY = 0; dstY < dstH; dstY++) {
    const srcY = (dstY + 0.5) * scaleY - 0.5;
    const y0 = Math.floor(srcY);

    for (let dstX = 0; dstX < dstW; dstX++) {
      const srcX = (dstX + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(srcX);

      let r = 0, g = 0, b = 0, al = 0, wSum = 0;

      for (let ky = -a + 1; ky <= a; ky++) {
        const py = y0 + ky;
        const wy = lanczosKernel(srcY - py, a);
        if (wy === 0) continue;
        const clampedY = Math.max(0, Math.min(srcH - 1, py));

        for (let kx = -a + 1; kx <= a; kx++) {
          const px = x0 + kx;
          const wx = lanczosKernel(srcX - px, a);
          if (wx === 0) continue;
          const clampedX = Math.max(0, Math.min(srcW - 1, px));

          const w = wy * wx;
          const idx = (clampedY * srcW + clampedX) * 4;
          r  += src[idx + 0] * w;
          g  += src[idx + 1] * w;
          b  += src[idx + 2] * w;
          al += src[idx + 3] * w;
          wSum += w;
        }
      }

      const dstIdx = (dstY * dstW + dstX) * 4;
      dst[dstIdx + 0] = Math.max(0, Math.min(255, Math.round(r / wSum)));
      dst[dstIdx + 1] = Math.max(0, Math.min(255, Math.round(g / wSum)));
      dst[dstIdx + 2] = Math.max(0, Math.min(255, Math.round(b / wSum)));
      dst[dstIdx + 3] = Math.max(0, Math.min(255, Math.round(al / wSum)));
    }
  }

  return dst;
}

self.onmessage = (e: MessageEvent) => {
  const { imageData, width, height, scale } = e.data as {
    imageData: Uint8ClampedArray;
    width: number;
    height: number;
    scale: number;
  };

  try {
    const dstW = Math.round(width * scale);
    const dstH = Math.round(height * scale);
    const result = lanczosResize(imageData, width, height, dstW, dstH);
    self.postMessage({ success: true, rgba: result, outW: dstW, outH: dstH }, { transfer: [result.buffer] });
  } catch (err) {
    self.postMessage({ success: false, error: (err as Error).message });
  }
};
