import { removeBackground as imglyRemoveBg } from '@imgly/background-removal';

export async function removeBackground(dataUrl: string): Promise<string> {
  const blob = await imglyRemoveBg(dataUrl, {
    model: 'large',
    output: { format: 'image/png', quality: 1 },
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function upscaleImage(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);

  // Extract ImageData on main thread (needs canvas/DOM)
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/upscale.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e) => {
      worker.terminate();
      if (!e.data.success) {
        reject(new Error(e.data.error));
        return;
      }
      const { rgba, outW, outH } = e.data as { rgba: Uint8ClampedArray; outW: number; outH: number };
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext('2d')!;
      outCtx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer), outW, outH), 0, 0);
      resolve({ dataUrl: outCanvas.toDataURL('image/png'), width: outW, height: outH });
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    // Transfer imageData buffer to worker (zero-copy)
    worker.postMessage(
      { imageData: imageData.data, width: img.naturalWidth, height: img.naturalHeight },
      [imageData.data.buffer],
    );
  });
}
