import { removeBackground as imglyRemoveBg } from '@imgly/background-removal';

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

// Canvas-based upscale using Lanczos-approximated bicubic (browser best effort)
export async function upscaleImage(dataUrl: string, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const newW = Math.round(img.naturalWidth * scale);
      const newH = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, newW, newH);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: newW, height: newH });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
