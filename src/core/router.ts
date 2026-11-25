import type { SiteContent } from '../content/types';
import type { Director } from './director';
import type { State } from './routes';
import { pathFromState, sameState, stateFromPath } from './routes';
import { pageMetadata } from './metadata';

/** data-go values: hero | portfolio | about | contacts | case:<slug> */
function stateFromGo(v: string): State | null {
  if (v === 'hero' || v === 'portfolio' || v === 'about' || v === 'contacts') return { kind: v };
  if (v.startsWith('case:')) return { kind: 'case', slug: v.slice(5) };
  return null;
}

export function initRouter(d: Director, c: SiteContent): (to: State) => void {
  const slugs = c.projects.map((p) => p.slug);
  const canonical = document.querySelector<HTMLLinkElement>('link[rel=canonical]');
  const origin = new URL(canonical?.href || location.href).origin;
  let pending: string | null = null;

  function updateHead(state: State): void {
    const { title, description, url } = pageMetadata(state, c, origin);
    document.title = title;
    canonical?.setAttribute('href', url);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    for (const tag of document.querySelectorAll('meta[name=description], meta[property="og:description"]')) {
      tag.setAttribute('content', description);
    }
  }
  updateHead(d.state);

  const toState = (path: string): State => stateFromPath(path, slugs) ?? { kind: 'hero' };

  const navigate = (to: State, destination = pathFromState(to)) => {
    if (d.busy || sameState(d.state, to)) return;
    // pushState runs synchronously on acceptance, before the transition and before 'change'
    void d.go(to, () => {
      history.pushState(null, '', destination);
      updateHead(to);
    });
  };

  function replayPending() {
    if (pending !== null) {
      const p = pending;
      pending = null;
      void d.go(toState(p));
    }
  }
  d.addEventListener('ready', replayPending);
  d.addEventListener('change', () => {
    updateHead(d.state);
    replayPending();
  });

  addEventListener('popstate', () => {
    if (d.busy) { pending = location.pathname; return; }
    void d.go(toState(location.pathname));
  });

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = (e.target as Element | null)?.closest?.('[data-go], a[href]');
    if (!el) return;
    const go = el.getAttribute('data-go');
    let to: State | null = null;
    let destination: string | undefined;
    if (el instanceof HTMLAnchorElement) {
      if (el.hasAttribute('download') || (el.target && el.target !== '_self')) return;
      const u = new URL(el.href, location.href);
      if (u.origin !== location.origin || u.hash || u.search) return;
      destination = u.pathname;
    }
    if (go) {
      to = stateFromGo(go);
    } else if (el instanceof HTMLAnchorElement) {
      to = stateFromPath(el.pathname, slugs);
    }
    if (!to) return;
    e.preventDefault();
    navigate(to, destination);
  });
  return navigate;
}
