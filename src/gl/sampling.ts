import type { Preset } from './preset';

/** Structural ImageData (RGBA, 4 bytes per pixel) so this runs in node tests and workers. */
export type Img = { data: Uint8ClampedArray; width: number; height: number };

/** Floats per sampled point: x, y, z, r, g, b, orderKey, seed. */
export const STRIDE = 8;

export function depthToZ(d: number, scale: number, curve: number): number {
  return scale * d ** curve;
}

/** True when the depth jump to any 4-neighbour (red channel, RGBA data) exceeds `cutoff` (0..1). */
export function isEdge(depth: Uint8ClampedArray, w: number, h: number, x: number, y: number, cutoff: number): boolean {
  const c = depth[(y * w + x) * 4];
  let m = 0;
  if (x > 0) m = Math.max(m, Math.abs(c - depth[(y * w + x - 1) * 4]));
  if (x < w - 1) m = Math.max(m, Math.abs(c - depth[(y * w + x + 1) * 4]));
  if (y > 0) m = Math.max(m, Math.abs(c - depth[((y - 1) * w + x) * 4]));
  if (y < h - 1) m = Math.max(m, Math.abs(c - depth[((y + 1) * w + x) * 4]));
  return m / 255 > cutoff;
}

/**
 * Samples `count` points weighted by luma^density · depth^depthDensity, skipping depth edges.
 * Coordinates are in image-height units: y ∈ [-.5, .5] (up), x ∈ ±aspect/2, both shifted so that
 * (camera.centerX, camera.centerY) is the origin; the camera cover-fits this rect to the viewport.
 * z = depthToZ(depth). orderKey ∈ 0..1: near-first uses depth, left-right uses x,
 * subject-first uses relief above the room at the same image height. seed ∈ 0..1.
 * Colours are sRGB 0..1.
 */
export function samplePoints(color: Img, depth: Img, p: Preset, count: number, rng: () => number): Float32Array {
  const W = color.width, H = color.height;
  const dw = depth.width, dh = depth.height;
  const cd = color.data, dd = depth.data;
  const { density, depthDensity } = p.particles;
  const { scale, curve, edgeCutoff } = p.depth;
  const aspect = W / H;
  const cx = p.camera.centerX, cy = p.camera.centerY;
  const subjectFirst = p.morph.order === 'subject-first';
  const roomDepth = new Uint8Array(H);

  // Cache only functions of the actual 8-bit depth sample. Luminance still uses
  // all three color channels at full precision.
  const depthWeight = Float64Array.from({ length: 256 }, (_, d) => (d / 255) ** depthDensity);
  const zAtDepth = Float64Array.from({ length: 256 }, (_, d) => depthToZ(d / 255, scale, curve));
  const depthX = Int32Array.from({ length: W }, (_, x) => Math.min(dw - 1, Math.floor((x + .5) * dw / W)));
  const depthByte = new Uint8Array(W * H);
  const cdf = new Float64Array(W * H);
  let total = 0;
  let eligible = 0;
  for (let y = 0; y < H; y++) {
    const dy = Math.min(dh - 1, Math.floor((y + .5) * dh / H));
    // The floor gets nearer toward the bottom. Compare against the room on
    // either side of the seated person at this height to isolate the figure.
    if (subjectFirst) roomDepth[y] = Math.min(
      dd[(dy * dw + Math.floor(dw * .25)) * 4], dd[(dy * dw + Math.floor(dw * .75)) * 4],
    );
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = depthX[x];
      if (isEdge(dd, dw, dh, dx, dy, edgeCutoff)) {
        cdf[i] = -1;
        continue;
      }
      eligible++;
      const d = depthByte[i] = dd[(dy * dw + dx) * 4];
      const o = i * 4;
      const luma = (0.2126 * cd[o] + 0.7152 * cd[o + 1] + 0.0722 * cd[o + 2]) / 255;
      const brightness = density === 1.5 ? luma * Math.sqrt(luma) : luma ** density;
      let weight = brightness * depthWeight[d];
      if (subjectFirst) {
        const relief = Math.min(1, Math.max(0, (d - roomDepth[y]) / 96));
        weight = .4 * weight + relief * (.055 + .55 * luma);
      }
      total += cdf[i] = weight;
    }
  }
  if (!eligible) throw new Error('samplePoints: no samplable pixel (every pixel is an edge)');
  const uniform = total === 0;
  total = 0;
  for (let i = 0; i < cdf.length; i++) {
    if (cdf[i] >= 0) total += uniform ? 1 : cdf[i];
    cdf[i] = total;
  }

  // A bucket narrows each exact inverse-CDF search to a short interval. This
  // needs one random draw per pixel, including on very dark or sparse images.
  const buckets = Math.max(1, Math.ceil(cdf.length / 16));
  const first = new Uint32Array(buckets + 1);
  let pixel = 0;
  for (let bucket = 0; bucket < buckets; bucket++) {
    const lower = bucket / buckets * total;
    while (pixel < cdf.length - 1 && cdf[pixel] <= lower) pixel++;
    first[bucket] = pixel;
  }
  first[buckets] = cdf.length - 1;

  const out = new Float32Array(count * STRIDE);
  for (let k = 0; k < count; k++) {
    const random = rng();
    const target = random * total;
    const bucket = Math.min(buckets - 1, Math.floor(random * buckets));
    let lo = first[bucket], hi = first[bucket + 1];
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] > target) hi = mid;
      else lo = mid + 1;
    }
    const i = lo;
    const px = i % W, py = (i / W) | 0;
    const u = (px + 0.05 + 0.9 * rng()) / W;
    const v = (py + 0.05 + 0.9 * rng()) / H;
    const o = i * 4;
    const z = zAtDepth[depthByte[i]];
    const b = k * STRIDE;
    out[b] = (u - cx) * aspect;
    out[b + 1] = cy - v;
    out[b + 2] = z;
    out[b + 3] = cd[o] / 255;
    out[b + 4] = cd[o + 1] / 255;
    out[b + 5] = cd[o + 2] / 255;
    let key = 1 - (scale > 0 ? z / scale : 0);
    if (subjectFirst) {
      const relief = Math.min(1, Math.max(0, (depthByte[i] - roomDepth[py]) / 96));
      key = .75 * (1 - relief) + .25 * Math.min(1, Math.abs(u - cx) * 2);
    } else if (p.morph.order === 'left-right') key = u;
    out[b + 6] = key;
    out[b + 7] = rng();
  }
  return out;
}

/** mulberry32: small seeded PRNG so a given seed always gives the same cloud. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
