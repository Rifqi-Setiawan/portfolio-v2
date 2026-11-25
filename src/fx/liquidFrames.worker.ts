import { gooAlphaTable, gooParams } from './gooMath';

export type LiquidFrameRequest = { id: number; source: ImageData; fontSize: number; frames: number };
export type LiquidFrameResponse = { id: number; atlas: ImageBitmap } | { id: number; error: string };

function raster(source: ImageData, fontSize: number, frames: number): ImageBitmap {
  if (!(frames >= 2 && Number.isInteger(frames) && fontSize > 0)) throw new Error('Invalid liquid frame dimensions');
  const { width, height } = source;
  const glyph = new OffscreenCanvas(width, height);
  const filtered = new OffscreenCanvas(width, height);
  const atlas = new OffscreenCanvas(width, height * frames);
  const sourceCtx = glyph.getContext('2d', { willReadFrequently: true });
  const blurCtx = filtered.getContext('2d', { willReadFrequently: true });
  const output = atlas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx || !blurCtx || !output || !('filter' in blurCtx)) throw new Error('Worker blur unavailable');
  sourceCtx.putImageData(source, 0, 0);
  output.putImageData(source, 0, 0);

  // A single-colour text run has one ink RGB. At the blur fringe, recovering
  // RGB by unpremultiplying tiny alpha values would introduce colour noise.
  let ink = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    if (source.data[i + 3] > source.data[ink + 3]) ink = i;
    if (source.data[ink + 3] === 255) break;
  }
  const [r, g, b] = source.data.subarray(ink, ink + 3);
  for (let frame = 1; frame < frames; frame++) {
    const liquid = frame / (frames - 1);
    const { blur } = gooParams(liquid, fontSize);
    blurCtx.clearRect(0, 0, width, height);
    blurCtx.filter = `blur(${blur}px)`;
    blurCtx.drawImage(glyph, 0, 0);
    const image = blurCtx.getImageData(0, 0, width, height);
    const alpha = gooAlphaTable(liquid);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = alpha[image.data[i + 3]];
    }
    output.putImageData(image, 0, frame * height);
  }
  return atlas.transferToImageBitmap();
}

self.onmessage = ({ data }: MessageEvent<LiquidFrameRequest>) => {
  try {
    const atlas = raster(data.source, data.fontSize, data.frames);
    const result: LiquidFrameResponse = { id: data.id, atlas };
    (self as unknown as Worker).postMessage(result, [atlas]);
  } catch (error) {
    const result: LiquidFrameResponse = { id: data.id, error: String(error) };
    (self as unknown as Worker).postMessage(result);
  }
};
