import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'briaai/RMBG-1.4';
let _model: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null;
let _processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;

async function loadModels() {
  if (_model) return;
  [_model, _processor] = await Promise.all([
    AutoModel.from_pretrained(MODEL_ID, { config: { model_type: 'custom' } }),
    AutoProcessor.from_pretrained(MODEL_ID),
  ]);
}

export async function removeBackground(dataUrl: string): Promise<string> {
  await loadModels();

  const image = await RawImage.fromURL(dataUrl);
  // @ts-ignore — processor typing is generic
  const { pixel_values } = await _processor!(image);
  // @ts-ignore
  const { output } = await _model!({ input: pixel_values });

  // Resize alpha mask back to original image dimensions
  const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(image.width, image.height);

  // Composite: draw original then apply mask as alpha channel
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;

  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, image.width, image.height);
  const maskBytes = mask.data as Uint8Array;
  for (let i = 0; i < maskBytes.length; i++) {
    imgData.data[4 * i + 3] = maskBytes[i];
  }
  ctx.putImageData(imgData, 0, 0);

  return canvas.toDataURL('image/png');
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
