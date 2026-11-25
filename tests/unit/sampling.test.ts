import { describe, it, expect } from 'vitest';
import { depthToZ, isEdge, samplePoints, type Img } from '../../src/gl/sampling';
import { parsePreset } from '../../src/gl/preset';

function img(w: number, h: number, f: (x: number, y: number) => number): Img {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y), i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('depthToZ', () => {
  it('is scale * d ** curve', () => {
    expect(depthToZ(1, 0.16, 1.01)).toBe(0.16);
    expect(depthToZ(0.5, 0.16, 1)).toBe(0.08);
  });
});

describe('isEdge', () => {
  const step = img(10, 6, (x) => (x < 5 ? 0 : 255));
  it('is true at the step', () => {
    expect(isEdge(step.data, 10, 6, 4, 3, 0.29)).toBe(true);
    expect(isEdge(step.data, 10, 6, 5, 3, 0.29)).toBe(true);
  });
  it('is false on flat areas and borders', () => {
    expect(isEdge(step.data, 10, 6, 1, 3, 0.29)).toBe(false);
    expect(isEdge(step.data, 10, 6, 8, 2, 0.29)).toBe(false);
    expect(isEdge(step.data, 10, 6, 0, 0, 0.29)).toBe(false);
    expect(isEdge(step.data, 10, 6, 9, 5, 0.29)).toBe(false);
  });
});

describe('samplePoints', () => {
  const p = parsePreset({});
  const W = 64, H = 32;
  // left half black, right half white luma; depth flat except a hard step at x = 40
  const color = img(W, H, (x) => (x < W / 2 ? 0 : 255));
  const depth = img(W, H, (x) => (x < 40 ? 200 : 20));

  it('returns count × 8 floats, deterministically for a seeded rng', () => {
    const a = samplePoints(color, depth, p, 500, mulberry(7));
    const b = samplePoints(color, depth, p, 500, mulberry(7));
    expect(a).toBeInstanceOf(Float32Array);
    expect(a.length).toBe(500 * 8);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('never lands on an edge pixel', () => {
    const out = samplePoints(color, depth, p, 2000, mulberry(3));
    const aspect = W / H;
    for (let i = 0; i < 2000; i++) {
      const x = out[i * 8], y = out[i * 8 + 1];
      const px = Math.min(W - 1, Math.floor((x / aspect + p.camera.centerX) * W));
      const py = Math.min(H - 1, Math.floor((p.camera.centerY - y) * H));
      expect(isEdge(depth.data, W, H, px, py, p.depth.edgeCutoff)).toBe(false);
    }
  });

  it('weights by luma ** density (density 1.5): >85% of samples in the white half', () => {
    const grey = img(W, H, (x) => (x < W / 2 ? 40 : 255));
    const flat = img(W, H, () => 180);
    const out = samplePoints(grey, flat, p, 4000, mulberry(11));
    let white = 0;
    for (let i = 0; i < 4000; i++) if (out[i * 8] > 0) white++;
    expect(white / 4000).toBeGreaterThan(0.85);
  });
});

describe('samplePoints robustness and order keys', () => {
  const W = 32, H = 16;
  const white = img(W, H, () => 255);

  it('throws promptly when no pixel can be sampled (every pixel is an edge)', () => {
    // smooth gradient + edgeCutoff 0 → every neighbour differs → every pixel is an edge
    const grad = img(W, H, (x, y) => (x * 7 + y * 3) % 256);
    const p = parsePreset({ depth: { edgeCutoff: 0 } });
    const t0 = Date.now();
    expect(() => samplePoints(white, grad, p, 1000, mulberry(1))).toThrow(/no samplable pixel/);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('still returns exactly count points, promptly, for very sparse weights', () => {
    // one bright pixel in a black image: acceptance ≈ 1/n, so the CDF path must finish the job
    const color = img(W, H, (x, y) => (x === 3 && y === 4 ? 255 : 0));
    const p = parsePreset({});
    const t0 = Date.now();
    const out = samplePoints(color, white, p, 3000, mulberry(2));
    expect(out.length).toBe(3000 * 8);
    expect(Date.now() - t0).toBeLessThan(1000);
    for (let i = 0; i < 3000; i++) expect(Math.floor((out[i * 8] / (W / H) + 0.5) * W)).toBe(3);
  });

  it('near-first: orderKey = 1 − z/scale in 0..1, nearer points first', () => {
    const depth = img(W, H, (x) => (x < W / 2 ? 50 : 250)); // right half nearer; step = edge column skipped
    const p = parsePreset({ morph: { order: 'near-first' } });
    const out = samplePoints(white, depth, p, 2000, mulberry(5));
    let nearMax = 0, farMin = 1;
    for (let i = 0; i < 2000; i++) {
      const z = out[i * 8 + 2], key = out[i * 8 + 6];
      expect(key).toBeGreaterThanOrEqual(0);
      expect(key).toBeLessThanOrEqual(1);
      expect(key).toBeCloseTo(1 - z / p.depth.scale, 5);
      if (out[i * 8] > 0) nearMax = Math.max(nearMax, key);
      else farMin = Math.min(farMin, key);
    }
    expect(nearMax).toBeLessThan(farMin);
  });

  it('left-right: orderKey = u in 0..1, increasing with x', () => {
    const p = parsePreset({ morph: { order: 'left-right' } });
    const out = samplePoints(white, white, p, 2000, mulberry(6));
    for (let i = 0; i < 2000; i++) {
      const x = out[i * 8], key = out[i * 8 + 6];
      expect(key).toBeGreaterThanOrEqual(0);
      expect(key).toBeLessThanOrEqual(1);
      expect(key).toBeCloseTo(x / (W / H) + p.camera.centerX, 5);
    }
  });

  it('subject-first lands the seated figure before the nearer foreground floor', () => {
    const depth = img(W, H, (x, y) => y >= 13 ? 230 : x >= 12 && x < 20 ? 120 : 25);
    const p = parsePreset({ morph: { order: 'subject-first' } });
    const out = samplePoints(white, depth, p, 2000, mulberry(5));
    const subject: number[] = [], floor: number[] = [];
    for (let i = 0; i < out.length; i += 8) {
      const y = p.camera.centerY - out[i + 1];
      if (Math.abs(out[i]) < .16 && y > .35 && y < .65) subject.push(out[i + 6]);
      if (y > .85) floor.push(out[i + 6]);
    }
    expect(subject.length).toBeGreaterThan(0);
    expect(floor.length).toBeGreaterThan(0);
    expect(Math.max(...subject)).toBeLessThan(Math.min(...floor));
  });
});
