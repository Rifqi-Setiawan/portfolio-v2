import type { SiteContent } from '../content/types';
import type { Director } from './director';
import type { State } from './routes';

/**
 * Static view sync: mirrors the director state into the DOM so CSS can show the right
 * section (`<html data-state>`), reveals the current case entry and exposes its palette.
 * Animated transitions (later tasks) layer on top of this.
 */
export function syncView(state: State, c: SiteContent): void {
  const root = document.documentElement;
  root.dataset.state = state.kind;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.header [data-go]')) {
    const current = link.dataset.go === (state.kind === 'case' ? 'portfolio' : state.kind);
    link.classList.toggle('is-current', current);
    if (current) link.setAttribute('aria-current', state.kind === 'case' ? 'location' : 'page');
    else link.removeAttribute('aria-current');
  }
  // Contacts covers the existing scene, including a case reader's position and palette.
  if (state.kind === 'contacts') return;
  const slug = state.kind === 'case' ? state.slug : null;
  document.querySelectorAll<HTMLElement>('.case__entry').forEach((el) => {
    el.hidden = el.dataset.case !== slug;
  });
  const p = slug ? c.projects.find((x) => x.slug === slug) : undefined;
  // Each case article already owns its palette. Only the external header needs the colours.
  const header = document.querySelector<HTMLElement>('.header');
  for (const [k, v] of [['--panel-bg', p?.palette.bg], ['--panel-fg', p?.palette.fg]] as const) {
    if (v) header?.style.setProperty(k, v);
    else header?.style.removeProperty(k);
  }
}

export function initView(d: Director, c: SiteContent): void {
  syncView(d.state, c);
  d.addEventListener('change', () => syncView(d.state, c));
}
