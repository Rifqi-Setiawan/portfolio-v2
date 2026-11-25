import { STRIDE } from './sampling';

export const HERO_REDUCED_POINTS = 140000;
export const ABOUT_REDUCED_POINTS = 100000;
export const POINT_ROWS = 64;

export const imageRow = (v: number) => Math.min(POINT_ROWS - 1, Math.max(0, Math.floor(v * POINT_ROWS)));

/** Stable counting sort, independently for the reduced cloud and its additional detail.
 * Both point budgets keep the original set of samples, including the morph order attribute. */
export function orderPointRows(points: Float32Array, centerY: number, reducedCount: number) {
  const count = points.length / STRIDE;
  const rows = new Uint8Array(count);
  const offsets = new Uint32Array(2 * POINT_ROWS + 1);
  for (let i = 0; i < count; i++) {
    const bin = imageRow(centerY - points[i * STRIDE + 1]) + (i >= reducedCount ? POINT_ROWS : 0);
    rows[i] = bin;
    offsets[bin + 1]++;
  }
  for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
  const next = offsets.slice();
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[next[rows[i]]++] = i;
  return { order, offsets };
}
