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
  const { naturalWidth: w, naturalHeight: h } = img;

  // Create ImageBitmap — transferable and GPU-friendly
  const bitmap = await createImageBitmap(img);

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/upscale.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = async (e) => {
      worker.terminate();
      if (!e.data.success) {
        reject(new Error(e.data.error));
        return;
      }
      const { blob, outW, outH } = e.data as { blob: Blob; outW: number; outH: number };
      // Convert blob → dataUrl without loading a full pixel array in JS
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      resolve({ dataUrl, width: outW, height: outH });
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    // Transfer the bitmap to worker — zero-copy, original is neutered
    worker.postMessage({ bitmap, width: w, height: h, scale: 2 }, [bitmap]);
  });
}
