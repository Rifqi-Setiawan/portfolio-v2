import { EYES_WINDOW_ASPECT, type Preset } from './preset';
import { samplePoints, seededRng, STRIDE } from './sampling';
import { HERO_REDUCED_POINTS, orderPointRows } from './pointRows';

export type SampleRequest = {
  color: Blob; depth: Blob; photo?: Blob; preset: Preset; count: number; seed: number; printWidth?: number;
  trailRows?: boolean; printCssWidth?: number;
};
export type SampleResult = {
  attributes: Float32Array<ArrayBuffer>[]; count: number; ms: number; aspect: number;
  depth: ImageData; photo: ImageData; highResolution: boolean; print?: ImageData; halftone?: ImageData;
  rowOffsets?: Uint32Array<ArrayBuffer>;
};
export type SampleResponse = SampleResult | { error: string };

async function decode(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally { bitmap.close(); }
}

function eyes(source: ImageData, crop: Preset['eyesCrop'], aspect: number, width: number, cssWidth: number, seed: number) {
  const height = Math.round(width / EYES_WINDOW_ASPECT);
  const image = new ImageData(width, height);
  const halftone = new ImageData(width, height);
  const span = crop.spanX * aspect * height / width;
  const left = crop.centerX - crop.spanX / 2, top = crop.centerY - span / 2;
  const random = seededRng(seed);
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const pitch = 3;
  // Bake the CSS two-pixel screen at the same crop as the irregular print.
  // The baseline photo has grey contrast .82, multiplied onto the cream paper.
  const cssScale = cssWidth / width;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.max(0, Math.floor((top + span * (y + .5) / height) * source.height)));
    const dy = ((y + .5) * cssScale) % 2 - 1;
    for (let x = 0; x < width; x++) {
      const u = (x + .5) / width;
      const sx = Math.min(source.width - 1, Math.max(0, Math.floor((left + crop.spanX * u) * source.width)));
      const i = 4 * (sy * source.width + sx);
      const grey = (.2126 * source.data[i] + .7152 * source.data[i + 1] + .0722 * source.data[i + 2]) / 255;
      const dot = clamp((1.1 - Math.hypot(((x + .5) * cssScale) % 2 - 1, dy)) / .45);
      const edge = clamp((Math.min(u, 1 - u) - .07) / .17);
      halftone.data[4 * (y * width + x) + 3] = 255 * .72 * (1 - (.09 + .82 * grey)) * dot * edge;
    }
  }
  for (let row = 0; row < height; row += pitch) {
    for (let col = 0; col < width; col += pitch) {
      const x = col + .6 + 1.8 * random(), y = row + .6 + 1.8 * random(), u = x / width;
      const edge = clamp((Math.min(u, 1 - u) - .07) / .17);
      const feather = edge * edge * (3 - 2 * edge);
      const sx = Math.min(source.width - 1, Math.max(0, Math.floor((left + crop.spanX * u) * source.width)));
      const sy = Math.min(source.height - 1, Math.max(0, Math.floor((top + span * y / height) * source.height)));
      const i = (sy * source.width + sx) * 4;
      const tone = (.2126 * source.data[i] + .7152 * source.data[i + 1] + .0722 * source.data[i + 2]) / 255;
      const shadow = clamp((.74 - tone) / .64), radius = .60 + 1.3 * shadow;
      for (let py = row; py < Math.min(row + pitch, height); py++) for (let px = col; px < Math.min(col + pitch, width); px++) {
        const coverage = clamp(radius + .4 - Math.hypot(px + .5 - x, py + .5 - y));
        const offset = (py * width + px) * 4;
        image.data[offset] = 91;
        image.data[offset + 1] = 87;
        image.data[offset + 2] = 82;
        image.data[offset + 3] = Math.round(255 * coverage * (.45 + .45 * shadow) * feather);
      }
    }
  }
  return { print: image, halftone };
}

self.onmessage = async ({ data: request }: MessageEvent<SampleRequest>) => {
  try {
    const [color, depth, highRes] = await Promise.all([
      decode(request.color), decode(request.depth), request.photo ? decode(request.photo).catch(() => null) : null,
    ]);
    const started = performance.now();
    const points = samplePoints(color, depth, request.preset, request.count, seededRng(request.seed));
    const ms = performance.now() - started, count = points.length / STRIDE;
    const rows = request.trailRows ? orderPointRows(points, request.preset.camera.centerY, HERO_REDUCED_POINTS) : undefined;
    // Independent streams allow each VBO to be uploaded in small slices and retained for context restoration.
    const sizes = [3, 3, 1, 1];
    const attributes = sizes.map(size => new Float32Array(count * size));
    for (let i = 0; i < count; i++) {
      let source = (rows ? rows.order[i] : i) * STRIDE;
      for (let a = 0; a < sizes.length; a++) {
        for (let c = 0; c < sizes[a]; c++) attributes[a][i * sizes[a] + c] = points[source++];
      }
    }
    const photo = highRes ?? color, aspect = color.width / color.height;
    const prints = request.printWidth ? eyes(photo, request.preset.eyesCrop, aspect, request.printWidth, request.printCssWidth || request.printWidth, request.seed) : undefined;
    const result: SampleResult = { attributes, ms, count, aspect, photo, depth, highResolution: !!highRes, ...prints, rowOffsets: rows?.offsets };
    const transfer: Transferable[] = attributes.map(a => a.buffer);
    transfer.push(photo.data.buffer, depth.data.buffer);
    if (rows) transfer.push(rows.offsets.buffer);
    if (prints) transfer.push(prints.print.data.buffer, prints.halftone.data.buffer);
    (self as unknown as Worker).postMessage(result, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: String(err) } satisfies SampleResponse);
  }
};
