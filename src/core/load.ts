export async function loadImageData(url: string, signal: AbortSignal): Promise<ImageData> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`image ${response.status}: ${url}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    signal.throwIfAborted();
    const { width, height } = bitmap;
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

/** Rejects after `seconds` unless `p` settles first. */
export function withTimeout<T>(p: Promise<T>, seconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${seconds}s`)), seconds * 1000);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
