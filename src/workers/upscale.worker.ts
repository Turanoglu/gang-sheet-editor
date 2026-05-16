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
    imageData: Uint8Array;
    width: number;
    height: number;
  };

  try {
    const u = await getUpscaler();

    const tensor = tf.tensor3d(imageData, [height, width, 4]);
    const rgb = tensor.slice([0, 0, 0], [-1, -1, 3]) as tf.Tensor3D;
    tensor.dispose();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultTensor = await u.upscale(rgb as any, {
      output: 'tensor',
      patchSize: 32,
      padding: 2,
    }) as tf.Tensor3D;
    rgb.dispose();

    // Convert tensor [H, W, 3] → Uint8ClampedArray RGBA
    const [outH, outW] = resultTensor.shape;
    const rawData = await resultTensor.data() as Float32Array;
    resultTensor.dispose();

    const rgba = new Uint8ClampedArray(outW * outH * 4);
    for (let i = 0; i < outW * outH; i++) {
      rgba[i * 4 + 0] = Math.round(rawData[i * 3 + 0] * 255);
      rgba[i * 4 + 1] = Math.round(rawData[i * 3 + 1] * 255);
      rgba[i * 4 + 2] = Math.round(rawData[i * 3 + 2] * 255);
      rgba[i * 4 + 3] = 255;
    }

    self.postMessage({ success: true, rgba, outW, outH }, { transfer: [rgba.buffer] });
  } catch (err) {
    self.postMessage({ success: false, error: (err as Error).message });
  }
};
