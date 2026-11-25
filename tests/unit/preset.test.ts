import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePreset } from '../../src/gl/preset';

const hero = JSON.parse(readFileSync('public/scenes/hero/preset.json', 'utf8'));

describe('parsePreset', () => {
  it('round-trips the hero preset and fills missing portrait defaults', () => {
    expect(hero.photo.depthGrow).toBeUndefined();
    const p = parsePreset(hero);
    expect(p).toEqual({
      ...hero,
      photo: { ...hero.photo, depthGrow: 1 },
      eyesCrop: { centerX: 0.496, centerY: 0.365, spanX: 0.43 },
    });
  });

  it("ships Rifqi's own word and font, not the reference owner's", () => {
    expect(hero.morph.word).toBe('Rifqi Setiawan');
    expect(hero.intro.font).toContain('Plus Jakarta Sans');
    expect(JSON.stringify(hero)).not.toMatch(/Piven|TT Norms/);
  });

  it('keeps an explicit depthGrow and fills missing sections from defaults', () => {
    const p = parsePreset({ photo: { depthGrow: 1.6 }, particles: { count: 10 } });
    expect(p.photo.depthGrow).toBe(1.6);
    expect(p.particles.count).toBe(10);
    expect(p.particles.countMobile).toBe(hero.particles.countMobile);
    expect(p.camera.fov).toBe(10);
  });

  it('ignores values of the wrong type and non-object input', () => {
    expect(parsePreset({ depth: { scale: 'big' } }).depth.scale).toBe(hero.depth.scale);
    expect(parsePreset(null).morph.order).toBe('near-first');
  });
});
