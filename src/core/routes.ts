import type { SiteContent } from '../content/types';

export type State =
  | { kind: 'hero' }
  | { kind: 'portfolio' }
  | { kind: 'case'; slug: string }
  | { kind: 'about' }
  | { kind: 'contacts' };
export type Opened = 'hero' | 'portfolio' | 'case' | 'about' | 'contacts';

const SUFFIX = 'Rifqi Setiawan';

/** null = 404 */
export function stateFromPath(path: string, slugs: string[]): State | null {
  const p = path.toLowerCase().replace(/\/+/g, '/').replace(/\/index\.html$/, '').replace(/\/$/, '');
  if (p === '') return { kind: 'hero' };
  if (p === '/portfolio' || p === '/work') return { kind: 'portfolio' };
  if (p === '/about') return { kind: 'about' };
  if (p === '/contacts') return { kind: 'contacts' };
  if (p.startsWith('/work/')) {
    const slug = p.slice(6);
    return slugs.some((s) => s.toLowerCase() === slug)
      ? { kind: 'case', slug: slugs.find((s) => s.toLowerCase() === slug)! }
      : { kind: 'portfolio' };
  }
  return null;
}

export function pathFromState(s: State): string {
  switch (s.kind) {
    case 'hero': return '/';
    case 'portfolio': return '/portfolio';
    case 'case': return `/work/${s.slug}`;
    case 'about': return '/about';
    case 'contacts': return '/contacts';
  }
}

export function openedAttr(s: State): Opened {
  return s.kind;
}

export function titleFor(s: State, c: SiteContent): string {
  switch (s.kind) {
    case 'hero': return 'Muhammad Rifqi Setiawan — Software & AI Engineer';
    case 'case': {
      const p = c.projects.find((x) => x.slug === s.slug);
      return p ? `${p.title}, ${p.subtitle} — ${SUFFIX}` : `Portfolio — ${SUFFIX}`;
    }
    case 'about': return `About — ${SUFFIX}`;
    case 'portfolio': return `Portfolio — ${SUFFIX}`;
    case 'contacts': return `Contacts — ${SUFFIX}`;
  }
}

export function sameState(a: State, b: State): boolean {
  return a.kind === b.kind && (a.kind !== 'case' || a.slug === (b as { slug: string }).slug);
}
