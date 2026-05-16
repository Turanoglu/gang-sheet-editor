import Upscaler from 'upscaler';
import { x2 } from '@upscalerjs/esrgan-slim';
import * as tf from '@tensorflow/tfjs';

let upscaler: InstanceType<typeof Upscaler> | null = null;

async function getUpscaler() {
  if (!upscaler) {
    await tf.setBackend('cpu');
    await tf.ready();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upscaler = new Upscaler({ model: x2 as any });
  }
  return upscaler;
}

self.onmessage = async (e: MessageEvent) => {
  const { imageData, width, height } = e.data as {
    imageData: Uint8ClampedArray;
    width: number;
    height: number;
  };

  try {
    const u = await getUpscaler();
    const tensor = tf.tensor3d(new Uint8Array(imageData.buffer), [height, width, 4]);
    // Drop alpha channel for model input
    const rgb = tensor.slice([0, 0, 0], [-1, -1, 3]);
    tensor.dispose();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await u.upscale(rgb as any, { output: 'base64', patchSize: 32, padding: 2 });
    rgb.dispose();

    const dataUrl = result.startsWith('data:') ? result : `data:image/png;base64,${result}`;
    self.postMessage({ success: true, dataUrl });
  } catch (err) {
    self.postMessage({ success: false, error: (err as Error).message });
  }
};
