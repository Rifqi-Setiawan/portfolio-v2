import gsap from 'gsap';
import { expect, it, vi } from 'vitest';
import { PORTRAIT } from '../../src/core/timings';
import type { PointScene, PointUniforms } from '../../src/gl/pointScene';
import { flyToPortrait } from '../../src/sections/portraitFlight';

function uniforms(): PointUniforms {
  return {
    uIntro: { value: 1 }, uMorph: { value: 1 }, uPhoto: { value: 1 }, uRecede: { value: 1 },
    uFly: { value: 0 }, uSplit: { value: 0 }, uDim: { value: 0 },
  };
}

it('holds the landed camera while focus passes from the hero crop to the About photo', () => {
  const heroWeight = { value: 0 };
  const hero = { u: uniforms() } as PointScene;
  const about = {
    u: uniforms(),
    focusFromHero(source: PointScene) {
      expect(source).toBe(hero);
      return heroWeight;
    },
  } as PointScene;
  const select = vi.fn();
  const timeline = gsap.timeline({ paused: true });
  try {
    const skip = flyToPortrait(timeline, hero, about, select, 'work');
    const landing = PORTRAIT.faceAt - skip;
    expect(timeline.duration()).toBeCloseTo(landing + PORTRAIT.focusDuration);
    timeline.time(landing, false);
    expect(select).toHaveBeenCalledWith('about');
    expect(hero.u.uFly.value).toBe(1);
    expect(heroWeight.value).toBe(1);
    timeline.time(landing + PORTRAIT.focusDuration / 2, false);
    expect(heroWeight.value).toBeCloseTo(.5);
    expect(hero.u.uFly.value).toBe(1);
    timeline.progress(1);
    expect(heroWeight.value).toBe(0);
    expect(hero.u.uFly.value).toBe(1);
    expect(about.u.uSplit.value).toBe(0);
  } finally {
    timeline.kill();
  }
});
