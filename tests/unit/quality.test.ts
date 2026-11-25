import { describe, expect, it, vi } from 'vitest';
import { AdaptiveQuality } from '../../src/gl/quality';
import { imageRow, orderPointRows, POINT_ROWS } from '../../src/gl/pointRows';
import { STRIDE } from '../../src/gl/sampling';

describe('adaptive stage detail', () => {
  it('takes one step per slow second and leaves idle gaps and fast frames alone', () => {
    const changed = vi.fn(), report = vi.fn();
    const quality = new AdaptiveQuality(7, changed, report);
    let now = 1;
    quality.frame(now, false);
    for (let i = 0; i < 150; i++) quality.frame(now += 7, true);
    quality.frame(now += 3000, false);
    expect(quality.tier).toBe(0);
    expect(report).toHaveBeenCalledWith(0, 7, 7);
    for (let i = 0; i < 220; i++) quality.frame(now += 16, true);
    expect(changed.mock.calls).toEqual([[1], [2], [3]]);
  });

  it('measures a complete first second, then waits for fresh contiguous frames at each tier', () => {
    const changed = vi.fn();
    const quality = new AdaptiveQuality(7, changed, vi.fn());
    let now = 1;
    const slow = (n: number) => {
      for (let i = 0; i < n; i++) quality.frame(now += 14, true);
    };
    quality.frame(now, false);
    slow(50);
    quality.frame(now += 3000, false);
    slow(71);
    expect(quality.tier).toBe(0);
    slow(1);
    expect(quality.tier).toBe(1);
    slow(29);
    expect(quality.tier).toBe(1);
    slow(1);
    expect(quality.tier).toBe(2);
    slow(30);
    expect(changed.mock.calls).toEqual([[1], [2], [3]]);
  });

  it('preserves every sample in both budgets while compacting the brush rows', () => {
    const y = [.48, -.48, 0, .46, -.47, -.48, .49, 0], split = 5;
    const points = new Float32Array(y.length * STRIDE);
    y.forEach((value, i) => { points[i * STRIDE + 1] = value; });
    const { order, offsets } = orderPointRows(points, .5, split);
    expect(Array.from(order.slice(0, split)).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(Array.from(order.slice(split)).sort()).toEqual([5, 6, 7]);
    for (let bin = 0; bin < 2 * POINT_ROWS; bin++) {
      for (const index of order.slice(offsets[bin], offsets[bin + 1])) {
        expect(imageRow(.5 - y[index]) + (index >= split ? POINT_ROWS : 0)).toBe(bin);
      }
    }
  });
});
