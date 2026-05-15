declare module '@imgly/background-removal' {
  interface Config {
    output?: { format?: string; quality?: number };
    [key: string]: unknown;
  }
  export function removeBackground(
    source: string | ArrayBuffer | Uint8Array | Blob | URL,
    config?: Config,
  ): Promise<Blob>;
}
