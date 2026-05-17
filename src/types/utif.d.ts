declare module 'utif' {
  export function encodeImage(data: Uint8ClampedArray | Uint8Array, width: number, height: number): ArrayBuffer;
  export function decodeImage(buffer: ArrayBuffer, img: object): void;
  export function decode(buffer: ArrayBuffer): object[];
  export function toRGBA8(img: object): Uint8Array;
}
