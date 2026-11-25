import { describe, it, expect } from 'vitest';
import { gooParams } from '../../src/fx/goo';

describe('gooParams', () => {
  it('liquid 1 at 100px', () => {
    const p = gooParams(1, 100);
    expect(p.blur).toBeCloseTo(4);
    expect(p.amp).toBeCloseTo(8);
    expect(p.off).toBeCloseTo(0.5 - 3.36);
  });
  it('liquid 0 at 100px', () => {
    const p = gooParams(0, 100);
    expect(p.blur).toBe(0);
    expect(p.amp).toBe(1);
    expect(p.off).toBeCloseTo(0.08);
  });
});
