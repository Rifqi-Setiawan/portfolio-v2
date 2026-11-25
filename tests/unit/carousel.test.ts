import { describe, expect, it } from 'vitest';
import { cardPose, blurPx, gridPose, filteredIndices } from '../../src/gl/carouselMath';
import { projects } from '../../src/content/projects';

describe('cylindrical carousel', () => {
  const arc = { radius: 5, spacing: 1.25 };
  it('centres a card on the camera axis with symmetric side poses', () => {
    const center = cardPose(0, 0, arc);
    expect(center.x).toBeCloseTo(0); expect(center.z).toBeCloseTo(0);
    expect(center.rotY).toBe(0); expect(center.depth).toBe(1);
    const l = cardPose(-1, 0, arc), r = cardPose(1, 0, arc);
    expect(l.x).toBeCloseTo(-r.x); expect(l.rotY).toBeCloseTo(-r.rotY);
    expect(l.z).toBeCloseTo(r.z); expect(l.z).toBeLessThan(0);
  });
  it('uses the reference defocus threshold', () => {
    expect(blurPx(.04)).toBe(0); expect(blurPx(.29)).toBe(10);
  });
  it('reflows filtered cards across two grid columns', () => {
    expect(filteredIndices(projects, 'backend').map(i => projects[i].slug))
      .toEqual(['tribunpass', 'wellmom', 'tel-u-cup']);
    expect(filteredIndices(projects, 'data').map(i => projects[i].slug)).toEqual(['agentic-ai-kms']);
    expect(gridPose(0,2,200,100,10).y).toBe(gridPose(1,2,200,100,10).y);
    expect(gridPose(2,2,200,100,10).x).toBe(gridPose(0,2,200,100,10).x);
  });
});
