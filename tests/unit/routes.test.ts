import { describe, it, expect } from 'vitest';
import { stateFromPath, pathFromState, openedAttr, titleFor, sameState, type State } from '../../src/core/routes';
import { content } from '../../src/content';

const slugs = content.projects.map((p) => p.slug);

describe('stateFromPath', () => {
  it('maps known paths', () => {
    expect(stateFromPath('/', slugs)).toEqual({ kind: 'hero' });
    expect(stateFromPath('/portfolio/', slugs)).toEqual({ kind: 'portfolio' });
    expect(stateFromPath('/work/tribunpass', slugs)).toEqual({ kind: 'case', slug: 'tribunpass' });
    expect(stateFromPath('/work/tribunpass/index.html', slugs)).toEqual({ kind: 'case', slug: 'tribunpass' });
  });
  it('falls back to portfolio for unknown slugs', () => {
    expect(stateFromPath('/work/nope', slugs)).toEqual({ kind: 'portfolio' });
    expect(stateFromPath('/work/', slugs)).toEqual({ kind: 'portfolio' });
  });
  it('is case-insensitive and collapses slashes', () => {
    expect(stateFromPath('/About', slugs)).toEqual({ kind: 'about' });
    expect(stateFromPath('//about', slugs)).toEqual({ kind: 'about' });
  });
  it('returns null for 404', () => {
    expect(stateFromPath('/x', slugs)).toBeNull();
  });
});

describe('pathFromState', () => {
  const states: State[] = [
    { kind: 'hero' }, { kind: 'portfolio' }, { kind: 'case', slug: 'tribunpass' },
    { kind: 'about' }, { kind: 'contacts' },
  ];
  it('round-trips every state', () => {
    for (const s of states) expect(stateFromPath(pathFromState(s), slugs)).toEqual(s);
  });
  it('openedAttr/sameState', () => {
    expect(openedAttr({ kind: 'case', slug: 'a' })).toBe('case');
    expect(sameState({ kind: 'case', slug: 'a' }, { kind: 'case', slug: 'a' })).toBe(true);
    expect(sameState({ kind: 'case', slug: 'a' }, { kind: 'case', slug: 'b' })).toBe(false);
    expect(sameState({ kind: 'about' }, { kind: 'hero' })).toBe(false);
  });
});

describe('titleFor', () => {
  it('builds titles', () => {
    expect(titleFor({ kind: 'hero' }, content)).toBe('Muhammad Rifqi Setiawan — Software & AI Engineer');
    expect(titleFor({ kind: 'case', slug: 'tribunpass' }, content)).toBe('TribunPass, Go ticketing platform — Rifqi Setiawan');
    expect(titleFor({ kind: 'case', slug: 'unknown' }, content)).toBe('Portfolio — Rifqi Setiawan');
    expect(titleFor({ kind: 'about' }, content)).toBe('About — Rifqi Setiawan');
    expect(titleFor({ kind: 'portfolio' }, content)).toBe('Portfolio — Rifqi Setiawan');
    expect(titleFor({ kind: 'contacts' }, content)).toBe('Contacts — Rifqi Setiawan');
  });
});
