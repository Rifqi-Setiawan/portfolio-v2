import { describe, it, expect } from 'vitest';
import * as T from '../../src/core/timings';

describe('timings', () => {
  it('match spec', () => {
    expect(T.SD).toEqual({ out: .3, in: .55, stagger: .016, rise: .45, blur: .3 });
    expect(T.INTRO.nameHold).toBeGreaterThanOrEqual(1.2);
    expect(T.PM).toEqual({ heroPortfolio: 1.45, casePortfolio: 1.3, aboutPortfolio: 1.3 });
    expect(T.YD).toEqual({ grow: 26, growNarrow: 17, open: .9, captionAt: .2, glide: 'power3.inOut' });
    expect(T.LM).toEqual({ speed: 1.2, pullBack: .8, overlap: .08, cut: .3, flyThrough: 1.1, flyBack: 1.2, aboutLeave: 1.5 });
    expect(T.XU).toEqual({ split: .78, shift: 165, shiftY: 34, edgeSoft: 800, edgeRough: 300 });
    expect(T.OD).toEqual({ fade: 1.6, stagger: .07, slide: 1.1, block: 3.2 });
    expect(T.DU).toEqual({ follow: 30, glide: 7, fling: .3, give: .35 });
    expect(T.GOO_EASE).toBe('0.25,1,0.5,1');
    expect(T.LOAD_TIMEOUT).toBe(8);
  });
});
