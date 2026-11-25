import '../styles/case-dialog.css';
import { createSmoothScroll } from '../core/scroll';
import { markMoving } from '../fx/goo';
import { odometer } from '../fx/odometer';

type OpenCase = { entry: HTMLElement; resume: () => void; rewind: () => void; dispose: () => void };
let active: OpenCase | undefined;
const colors = ['--panel-bg', '--panel-fg'];

function loadAsset(el: HTMLImageElement): void {
  if (el.hasAttribute('src') || !el.dataset.src) return;
  el.src = el.dataset.src;
}

/** Decode the lead the visitor may open while the selected carousel card is settled. */
export function prepareCaseCover(slug: string): void {
  const cover = document.querySelector<HTMLImageElement>(`.case__entry[data-case="${CSS.escape(slug)}"] .case__media li:first-child > img`);
  if (!cover || cover.hasAttribute('src')) return;
  loadAsset(cover);
  void cover.decode().catch(() => {
    if (cover.closest<HTMLElement>('.case__entry')?.hidden && !cover.naturalWidth) cover.removeAttribute('src');
  });
}

function bindDiagram(entry: HTMLElement, signal: AbortSignal): void {
  const opener = entry.querySelector<HTMLButtonElement>('[data-zoom]');
  const dialog = entry.querySelector<HTMLDialogElement>('.case__dialog');
  if (!opener || !dialog) return;
  opener.addEventListener('click', () => {
    loadAsset(dialog.querySelector('img')!);
    if (!dialog.open) dialog.showModal();
  }, { signal });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') e.stopPropagation();
  }, { signal });
  dialog.addEventListener('wheel', e => e.stopPropagation(), { passive: true, signal });
  dialog.addEventListener('close', () => {
    if (entry.isConnected && !entry.hidden) opener.focus({ preventScroll: true });
  }, { signal });
  signal.addEventListener('abort', () => { if (dialog.open) dialog.close(); }, { once: true });
}

export function showCase(slug: string, options: { deferMedia?: boolean; preview?: string; projected?: boolean } = {}): void {
  if (active?.entry.dataset.case === slug) {
    if (!options.deferMedia) active.resume();
    return;
  }
  const articles = Array.from(document.querySelectorAll<HTMLElement>('.case__entry'));
  const target = articles.find(item => item.dataset.case === slug);
  if (!target) return;
  const entry = target;
  hideCase();
  for (const article of articles) article.hidden = article !== entry;
  const root = document.documentElement;
  root.dataset.palette = slug;
  const header = document.querySelector<HTMLElement>('.header');
  for (const key of colors) header?.style.setProperty(key, entry.style.getPropertyValue(key));

  const controller = new AbortController();
  const { signal } = controller;
  const panel = entry.querySelector<HTMLElement>('.case__panel')!;
  const media = entry.querySelector<HTMLElement>('.case__media')!;
  const assets = Array.from(media.querySelectorAll<HTMLImageElement>('li > img'));
  const narrow = matchMedia('(orientation: portrait), (width <= 767px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clip = () => narrow.matches ? entry : media;
  let scrolls: ReturnType<typeof createSmoothScroll>[] = [];
  let resumed = false;
  let lazy: IntersectionObserver | undefined;
  const counters = new Set<ReturnType<typeof odometer>>();

  entry.scrollTop = media.scrollTop = panel.scrollTop = 0;
  if (assets[0]) loadAsset(assets[0]);
  // Keep the texture the visitor just saw under the full-size cover until it can paint.
  const cover = assets[0];
  let showPendingCover: (() => void) | undefined;
  if (cover && options.preview) {
    const frame = cover.parentElement!;
    const preview = options.preview;
    showPendingCover = () => {
      frame.style.setProperty('--case-preview', `url(${JSON.stringify(preview)})`);
      frame.classList.add('is-decoding');
    };
    if (!options.projected) showPendingCover();
    const clearPreview = () => {
      frame.classList.remove('is-decoding');
      frame.style.removeProperty('--case-preview');
    };
    signal.addEventListener('abort', clearPreview, { once: true });
    void cover.decode().then(async () => {
      showPendingCover = undefined;
      if (signal.aborted) return;
      clearPreview();
      if (!options.projected || resumed || typeof createImageBitmap !== 'function') return;
      // Hand the compositor the full decoded photo while the selected mesh still
      // covers its flight. The original image remains the accessible/context-menu target.
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('bitmaprenderer');
      if (!context) return;
      const bitmap = await createImageBitmap(cover);
      try {
        if (signal.aborted || resumed) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.className = 'case__lead-bitmap';
        canvas.setAttribute('aria-hidden', 'true');
        context.transferFromImageBitmap(bitmap);
        frame.append(canvas);
        frame.classList.add('has-lead-bitmap');
        const restoreImage = () => {
          frame.classList.remove('has-lead-bitmap');
          canvas.remove();
          canvas.width = canvas.height = 0;
        };
        canvas.addEventListener('contextlost', restoreImage, { once:true, signal });
        signal.addEventListener('abort', restoreImage, { once:true });
      } finally { bitmap.close(); }
    }, () => {
      // If the large file failed, keep showing the cached preview for this visit.
    }).catch(() => { /* The native image already owns the landing. */ });
  }
  bindDiagram(entry, signal);

  function watchImages(projected = false): void {
    lazy?.disconnect();
    lazy = new IntersectionObserver(changes => {
      for (const change of changes) if (!signal.aborted && change.isIntersecting) {
        const img = change.target as HTMLImageElement;
        loadAsset(img);
        if (projected) void img.decode().catch(() => {});
        lazy!.unobserve(change.target);
      }
    }, { root: clip(), rootMargin: projected ? '0px' : '25% 0px' });
    for (const asset of assets.slice(1)) if (!asset.hasAttribute('src')) lazy.observe(asset);
  }
  function sizeScrolls(): void {
    scrolls.forEach(scroll => scroll.destroy());
    scrolls = (narrow.matches ? [entry] : [media, panel]).map(el => createSmoothScroll(el));
    if (resumed) watchImages();
  }

  const metrics = new IntersectionObserver(changes => {
    for (const change of changes) {
      if (signal.aborted || !change.isIntersecting || change.intersectionRatio < .25) continue;
      const el = change.target as HTMLElement;
      metrics.unobserve(el);
      if (!reduced.matches && el.dataset.odometer) counters.add(odometer(el, el.dataset.odometer));
    }
  }, { threshold: .25 });

  function resume(): void {
    if (resumed) return;
    resumed = true;
    showPendingCover?.();
    watchImages();
    panel.querySelectorAll('[data-odometer]').forEach(el => metrics.observe(el));
  }

  narrow.addEventListener('change', sizeScrolls, { signal });
  entry.addEventListener('scroll', () => {
    if (narrow.matches) markMoving(panel);
  }, { passive: true, signal });
  panel.addEventListener('scroll', () => markMoving(panel), { passive: true, signal });
  sizeScrolls();
  if (options.projected) watchImages(true);
  active = {
    entry, resume,
    rewind() {
      // A wheel spring must stop before we measure the lead frame for the return flight.
      scrolls.forEach(scroll => scroll.destroy());
      scrolls = [];
      media.scrollTop = entry.scrollTop = 0;
    },
    dispose() {
      controller.abort();
      lazy?.disconnect();
      metrics.disconnect();
      for (const counter of counters) counter.kill();
      scrolls.forEach(scroll => scroll.destroy());
    },
  };
  if (!options.deferMedia) resume();
}

/** Start observing below-the-fold media when the opening plane has handed off. */
export function resumeCaseMedia(): void { active?.resume(); }

export function rewindCaseMedia(): void { active?.rewind(); }

export function hideCase(): void {
  if (!active) return;
  const { entry, dispose } = active;
  active = undefined;
  dispose();
  entry.hidden = true;
  const root = document.documentElement;
  if (root.dataset.palette === entry.dataset.case) {
    delete root.dataset.palette;
    const header = document.querySelector<HTMLElement>('.header');
    for (const key of colors) header?.style.removeProperty(key);
  }
}
