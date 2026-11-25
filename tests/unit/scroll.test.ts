import { describe, expect, it } from 'vitest';
import { createSmoothScroll } from '../../src/core/scroll';

function surface(dpr = 1) {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  const win = {
    innerHeight: 400,
    devicePixelRatio: dpr,
    performance: { now: () => now },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback: FrameRequestCallback) { frame = callback; return 1; },
    cancelAnimationFrame() { frame = undefined; },
  };
  const el = Object.assign(new EventTarget(), {
    clientHeight: 400, scrollHeight: 1200, scrollTop: 0,
    ownerDocument: Object.assign(new EventTarget(), { defaultView: win }),
  });
  const smooth = createSmoothScroll(el as unknown as HTMLElement);
  const tick = (ms: number) => {
    now += ms;
    const next = frame;
    frame = undefined;
    next?.(now);
  };
  function wheel(deltaY: number, deltaMode = 0) {
    const event = Object.assign(new Event('wheel', { cancelable: true }), {
      deltaX: 0, deltaY, deltaMode, DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2,
    });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }
  function echo(top: number) { el.scrollTop = top; el.dispatchEvent(new Event('scroll')); }
  return { el, smooth, tick, wheel, echo, animating: () => Boolean(frame) };
}

describe('smooth panel scrolling', () => {
  it('uses a critically damped spring at follow 7, independent of frame rate', () => {
    const one = surface(), many = surface();
    for (const s of [one, many]) s.smooth.to(500);
    one.tick(250);
    for (let i = 0; i < 5; i++) many.tick(50);
    const expected = 500 * (1 - (1 + 7 * .25) * Math.exp(-7 * .25));
    for (const s of [one, many]) {
      expect(s.el.scrollTop).toBeCloseTo(expected, 8);
      s.tick(2000);
      expect(s.el.scrollTop).toBe(500);
      expect(s.animating()).toBe(false);
    }
  });

  it.each([1, 1.25, 1.5])('keeps the wheel goal on quantised and delayed echoes at DPR %s', dpr => {
    const s = surface(dpr);
    s.wheel(6, 1); // 100 CSS pixels
    s.tick(100);
    const previous = Math.round(s.el.scrollTop * dpr) / dpr;
    s.wheel(1, 2); // one viewport
    s.tick(100);
    s.echo(s.el.scrollTop + 1 / dpr);
    s.echo(previous);
    s.tick(3000);
    expect(s.el.scrollTop).toBe(500);
    expect(s.animating()).toBe(false);
  });

  it('yields to an external scroll and restarts from its native position', () => {
    const s = surface();
    s.wheel(200);
    s.tick(100);
    s.echo(330);
    expect(s.animating()).toBe(false);
    s.wheel(40);
    s.tick(3000);
    expect(s.el.scrollTop).toBe(370);
  });

  it('consumes outward wheel input until the visible panel reaches its boundary', () => {
    const s = surface();
    expect(s.wheel(900)).toBe(true);
    s.tick(150);
    expect(s.wheel(100)).toBe(true);
    s.tick(2500);
    expect(s.el.scrollTop).toBe(800);
    expect(s.wheel(100)).toBe(false);
    expect(s.wheel(-140)).toBe(true);
    s.tick(2500);
    expect(s.el.scrollTop).toBe(660);
  });
});
