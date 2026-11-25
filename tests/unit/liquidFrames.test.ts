import { expect, it } from 'vitest';
import { gooAlphaTable, gooParams } from '../../src/fx/gooMath';

it('preserves sharp ink, uses the SVG alpha curve at each atlas step and leaves padding clear', () => {
  const identity = gooAlphaTable(0);
  expect(Array.from(identity)).toEqual(Array.from({ length: 256 }, (_, i) => i));
  for (const liquid of [.01, .125, .5, .875, 1]) {
    const ramp = gooAlphaTable(liquid);
    const { amp, off } = gooParams(liquid, 64);
    expect(ramp[0]).toBe(0);
    for (let coverage = 1; coverage < 256; coverage++) {
      const expected = Math.max(0, Math.min(255, amp * coverage + 255 * off));
      expect(Math.abs(ramp[coverage] - expected)).toBeLessThanOrEqual(.5);
    }
  }
});
