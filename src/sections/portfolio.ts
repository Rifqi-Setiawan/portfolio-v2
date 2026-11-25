import gsap from 'gsap';
import type { Category } from '../content/types';
import type { Director } from '../core/director';
import type { State } from '../core/routes';
import { CAROUSEL, DU } from '../core/timings';
import { gooIn, gooOut } from '../fx/goo';
import type { Carousel } from '../gl/carousel';
import { prepareCaseCover } from './case';

type View = 'strip' | 'grid';
const viewKey = 'portfolio:view';
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(n, high));

export function initPortfolio(director: Director, navigate: (state: State) => unknown, carousel: Carousel): void {
  const section = document.querySelector<HTMLElement>('section.portfolio')!;
  const viewport = section.querySelector<HTMLElement>('.works__canvas')!;
  const list = section.querySelector<HTMLElement>('.works__list')!;
  const cards = Array.from(list.querySelectorAll<HTMLElement>('[data-work]'));
  const links = cards.map(card => card.querySelector('a')!);
  const filters = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const views = Array.from(section.querySelectorAll<HTMLButtonElement>('button[data-view]'));
  const caption = Array.from(section.querySelectorAll<HTMLElement>('.works__caption [data-goo]'));
  const ready = () => director.state.kind === 'portfolio' && !director.busy;
  const strip = () => ready() && carousel.view === 'strip';
  let displayed = -1;
  let captionMotion: gsap.core.Animation | undefined;
  let focusOnChange = false;
  let preparedIndex = -1;

  function prepareSelected(index: number): void {
    const slug = cards[index]?.dataset.work;
    if (!slug || index === preparedIndex) return;
    preparedIndex = index;
    prepareCaseCover(slug);
  }

  function captionFor(index: number): void {
    if (index === displayed || !cards[index]) return;
    const [title, subtitle] = cards[index].querySelectorAll('.works__title, .works__subtitle');
    const write = () => {
      caption[0].textContent = title.textContent;
      caption[1].textContent = subtitle.textContent;
    };
    captionMotion?.kill();
    if (displayed === -1 || carousel.view === 'grid' || !ready()) {
      write();
      gsap.set(caption, { opacity: 1, clearProps: 'transform,filter' });
    } else {
      captionMotion = gooOut(caption).call(() => {
        write();
        captionMotion = gooIn(caption, { duration: CAROUSEL.captionIn });
      });
    }
    displayed = index;
  }

  function layout(): void {
    if (!carousel.hasStage) return;
    const grid = carousel.view === 'grid';
    const scrollTop = grid ? viewport.scrollTop : 0;
    list.style.height = grid ? `${carousel.gridHeight}px` : '';
    for (const index of carousel.indices) {
      const rect = carousel.cardRect(index);
      const style = cards[index].style;
      cards[index].classList.toggle('is-framed', ready() && !grid && index === carousel.active && carousel.presence === 1
        && Math.abs(carousel.offset - Math.round(carousel.offset)) < .02);
      style.zIndex = String(carousel.cardOrder(index));
      style.visibility = rect.width && rect.height ? '' : 'hidden';
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
      style.transform = `translate3d(${rect.x}px, ${rect.y + scrollTop}px, 0)`;
    }
  }

  function loadThumbnails(): void {
    for (const img of list.querySelectorAll<HTMLImageElement>('.works__thumbnail:not([src])')) img.src = img.dataset.src!;
  }

  function sync(): void {
    if (!carousel.hasStage && !section.hasAttribute('data-still')) {
      section.setAttribute('data-still', '');
      list.style.height = '';
      for (const card of cards) {
        card.removeAttribute('style');
        card.classList.remove('is-framed');
      }
      loadThumbnails();
    }
    section.dataset.view = carousel.view;
    for (const button of [...filters, ...views]) {
      const selected = button.dataset.filter === carousel.filter || button.dataset.view === carousel.view;
      button.classList.toggle('is-current', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    cards.forEach((card, index) => {
      card.hidden = !carousel.indices.includes(index);
      const active = index === carousel.active;
      card.classList.toggle('is-active', active);
      links[index].tabIndex = carousel.view === 'grid' || active ? 0 : -1;
    });
    captionFor(carousel.active);
    layout();
    if (focusOnChange && document.activeElement && list.contains(document.activeElement)) {
      links[carousel.active]?.focus({ preventScroll: true });
    }
  }

  director.addEventListener('change', layout);
  director.addEventListener('ready', layout);
  carousel.addEventListener('change', sync);
  carousel.addEventListener('layout', layout);
  const host = document.querySelector<HTMLElement>('.stage')!;
  host.addEventListener('webglcontextlost', loadThumbnails, true);
  if (host.classList.contains('stage--lost')) loadThumbnails();
  if (carousel.hasStage) {
    try { if (localStorage.getItem(viewKey) === 'grid') carousel.view = 'grid'; } catch { /* Storage can be disabled. */ }
  }
  sync();

  function resetScroll(): void {
    viewport.scrollTop = 0;
    carousel.setGridScroll(0);
  }

  for (const button of filters) button.addEventListener('click', () => {
    if (!ready()) return;
    carousel.setFilter(button.dataset.filter as Category | 'all');
    resetScroll();
    sync();
  });

  for (const button of views) button.addEventListener('click', () => {
    if (!ready() || !carousel.hasStage) return;
    const view = button.dataset.view as View;
    if (carousel.view === view) return;
    carousel.view = view;
    resetScroll();
    try { localStorage.setItem(viewKey, view); } catch { /* Private mode can deny writes. */ }
    sync();
  });
  viewport.addEventListener('scroll', () => {
    if (carousel.view === 'grid' && carousel.hasStage) carousel.setGridScroll(viewport.scrollTop);
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (!strip() || e.altKey || e.metaKey || e.ctrlKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    focusOnChange = list.contains(document.activeElement);
    if (e.key === 'ArrowLeft') carousel.prev();
    else carousel.next();
  });

  let lastWheel = -Infinity;
  window.addEventListener('wheel', (e) => {
    if (!strip() || e.ctrlKey) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    const now = performance.now();
    const quiet = now - lastWheel >= CAROUSEL.wheelQuiet * 1000;
    lastWheel = now;
    if (delta > 0 && carousel.active === carousel.indices.at(-1)) return;
    e.preventDefault();
    if (!quiet) return;
    focusOnChange = false;
    if (delta > 0) carousel.next();
    else if (carousel.active === carousel.indices[0]) navigate({ kind: 'hero' });
    else carousel.prev();
  }, { passive: false });

  // Capture only after a drag is established so taps retain the original anchor target.
  let grab: { id: number; x: number; y: number; offset: number; width: number; last: number; time: number; velocity: number; axis?: 'x' | 'y' } | undefined;
  let dragged = false;
  viewport.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    dragged = false;
    focusOnChange = false;
    if (!strip()) return;
    const offset = carousel.indices.indexOf(carousel.active) + carousel.offset - Math.round(carousel.offset);
    grab = { id: e.pointerId, x: e.clientX, y: e.clientY, offset, last: offset,
      width: Math.max(1, carousel.cardRect(carousel.active).width), time: e.timeStamp, velocity: 0 };
  });
  viewport.addEventListener('dragstart', e => e.preventDefault());
  viewport.addEventListener('pointermove', (e) => {
    if (!strip()) return;
    if (e.pointerType !== 'touch') carousel.setPointer(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2);
    if (!grab || e.pointerId !== grab.id) return;
    const dx = grab.x - e.clientX, dy = grab.y - e.clientY;
    if (!grab.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      grab.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      viewport.setPointerCapture(e.pointerId);
      dragged = true;
    }
    const offset = clamp(grab.offset + (grab.axis === 'x' ? dx : dy) / grab.width, 0, carousel.indices.length - 1);
    const elapsed = Math.max(1, e.timeStamp - grab.time) / 1000;
    grab.velocity = (offset - grab.last) / elapsed;
    grab.last = carousel.offset = offset;
    grab.time = e.timeStamp;
  });
  function release(e: PointerEvent): void {
    if (!grab || e.pointerId !== grab.id) return;
    if (grab.axis && strip()) {
      const elapsed = (e.timeStamp - grab.time) / 1000;
      const velocity = e.type === 'pointercancel' ? 0 : grab.velocity * Math.exp(-DU.glide * elapsed);
      const slot = clamp(Math.round(grab.last + velocity * DU.fling), 0, carousel.indices.length - 1);
      carousel.center(carousel.indices[slot]);
    }
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    grab = undefined;
  }
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('pointerleave', () => {
    if (grab && !grab.axis) grab = undefined;
    if (strip()) carousel.setPointer(0, 0);
  });

  let hovered: number | null = null;
  function prepareOnIntent(index: number): void {
    // Passing carousel cards under a stationary pointer is not opening intent.
    if (ready() && (carousel.view === 'grid' || (index === carousel.active && Number.isInteger(carousel.offset)))) {
      prepareSelected(index);
    }
  }
  function hover(): void {
    const focused = links.indexOf(document.activeElement as HTMLAnchorElement);
    carousel.setHover(ready() ? hovered ?? (focused >= 0 ? focused : null) : null);
  }
  links.forEach((link, index) => {
    link.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'touch') { hovered = index; prepareOnIntent(index); hover(); }
    });
    link.addEventListener('pointerleave', () => { hovered = null; hover(); });
    link.addEventListener('focus', () => { prepareOnIntent(index); hover(); });
    link.addEventListener('blur', () => carousel.setHover(hovered));
  });

  list.addEventListener('click', (e) => {
    const link = (e.target as Element).closest('a');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const index = links.indexOf(link);
    if (index < 0) return;
    e.preventDefault();
    if (!ready() || (dragged && e.detail !== 0)) return;
    if (carousel.view === 'strip' && index !== carousel.active) carousel.center(index);
    else {
      cards[index].classList.remove('is-framed');
      navigate({ kind: 'case', slug: cards[index].dataset.work! });
    }
  });
}
