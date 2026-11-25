import { describe, it, expect } from 'vitest';
import { content } from '../../src/content';

const slugs = ['tribunpass', 'techhiring', 'national-food-lakehouse', 'wellmom', 'smokeguard', 'tel-u-cup', 'agentic-ai-kms', 'partpilot'];
const bySlug = (s: string) => content.projects.find((p) => p.slug === s)!;

describe('content', () => {
  it('has eight projects in spec order', () => {
    expect(content.projects.map((p) => p.slug)).toEqual(slugs);
  });

  it('every project is complete', () => {
    for (const p of content.projects) {
      expect(p.headline.dim.length, p.slug).toBeGreaterThan(0);
      expect(p.headline.strong.length, p.slug).toBeGreaterThan(0);
      expect(p.about.trim().split(/\s+/).length, p.slug).toBeLessThanOrEqual(30);
      for (const v of Object.values(p.palette)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.categories.length, p.slug).toBeGreaterThanOrEqual(1);
      expect(p.cover.length, p.slug).toBeGreaterThan(0);
      expect(p.media.length, p.slug).toBeGreaterThanOrEqual(1);
      expect(p.how.length, p.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('categories match spec', () => {
    const expected: Record<string, string[]> = {
      tribunpass: ['backend'], techhiring: ['data'], 'national-food-lakehouse': ['data'],
      wellmom: ['backend', 'ai'], smokeguard: ['ai'], 'tel-u-cup': ['backend', 'ai'],
      'agentic-ai-kms': ['ai', 'data'], partpilot: ['backend', 'ai'],
    };
    for (const [s, c] of Object.entries(expected)) expect(bySlug(s).categories).toEqual(c);
  });

  it('palettes match asset table', () => {
    const expected: Record<string, [string, string, string]> = {
      tribunpass: ['#d8dccb', '#16201a', '#2f6b3a'],
      techhiring: ['#d9d4c7', '#1b1a17', '#2d4fa3'],
      'national-food-lakehouse': ['#e0d2bb', '#1e1712', '#b23a1d'],
      wellmom: ['#e6d6cf', '#22191a', '#b24a6b'],
      smokeguard: ['#ddd0c8', '#1d1716', '#c0351f'],
      'tel-u-cup': ['#d6d9cf', '#171a16', '#c1561b'],
      'agentic-ai-kms': ['#dcd8c4', '#1a1b14', '#5d7a1f'],
      partpilot: ['#d3d3cd', '#18191a', '#d06a12'],
    };
    for (const [s, [bg, fg, accent]] of Object.entries(expected)) expect(bySlug(s).palette).toEqual({ bg, fg, accent });
  });

  it('slugs are url-safe and unique', () => {
    const all = content.projects.map((p) => p.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const s of all) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('includes architecture on the diagram projects and omits Snowflake identifiers', () => {
    const withArch = content.projects.filter((p) => p.architecture).map((p) => p.slug);
    expect(withArch).toEqual(['techhiring', 'national-food-lakehouse', 'wellmom', 'smokeguard', 'tel-u-cup', 'partpilot']);
    const s = JSON.stringify(content);
    expect(s).not.toMatch(/snowflakecomputing|\.snowflake\.com/i);
    expect(s).not.toMatch(/snowflake\W{0,3}(account|identifier|locator)/i);
    expect(s).not.toMatch(/\b[a-z0-9]{5,}-[a-z0-9]{3,}\.snowflake/i);
  });
});
