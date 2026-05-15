import { removeBackground as imglyRemoveBg } from '@imgly/background-removal';
import Upscaler from 'upscaler';
import ESRGANSlim from '@upscalerjs/esrgan-slim';

export async function removeBackground(dataUrl: string): Promise<string> {
  const blob = await imglyRemoveBg(dataUrl, {
    output: { format: 'image/png', quality: 1 },
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

let upscalerInstance: InstanceType<typeof Upscaler> | null = null;

function getUpscaler() {
  if (!upscalerInstance) {
    upscalerInstance = new Upscaler({ model: ESRGANSlim });
  }
  return upscalerInstance;
}

export async function upscaleImage(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const upscaler = getUpscaler();

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  const result = await upscaler.upscale(img, { output: 'base64', patchSize: 64, padding: 4 });
  const newDataUrl = result.startsWith('data:') ? result : `data:image/png;base64,${result}`;

  const out = new Image();
  await new Promise<void>((resolve) => { out.onload = () => resolve(); out.src = newDataUrl; });

  return { dataUrl: newDataUrl, width: out.naturalWidth, height: out.naturalHeight };
}
