import gsap from 'gsap';
import type { Director } from '../core/director';
import { motionMode } from '../core/motion';
import type { State } from '../core/routes';
import { PM, SD, YD } from '../core/timings';
import { gooIn, gooOut } from '../fx/goo';
import type { Carousel } from '../gl/carousel';
import type { PointScene } from '../gl/pointScene';
import { portfolioDim } from '../transitions';
import { resumeCaseMedia, rewindCaseMedia, showCase } from './case';

const chrome = '.portfolio__bar, .works__caption, .works__label';
const article = (slug: string) => document.querySelector<HTMLElement>(`.case__entry[data-case="${CSS.escape(slug)}"]`)!;
const panelOf = (entry: HTMLElement) => entry.querySelector<HTMLElement>('.case__panel')!;
const fades = (entry: HTMLElement) => Array.from(entry.querySelectorAll<HTMLElement>('[data-case-fade]'));
const titleOf = (entry: HTMLElement) => entry.querySelector<HTMLElement>('.case__title')!;

export function revealCaseText(tl: gsap.core.Timeline, entry: HTMLElement): void {
  // Keep the original stagger slots. Offscreen sections of the inert reader can
  // start in their settled state without promoting its entire scroll height.
  const items = fades(entry).map((item, index) => ({ item, index, rect: item.getBoundingClientRect() }));
  for (const { item, index, rect } of items) {
    if (rect.bottom < 0 || rect.top > innerHeight) continue;
    // The headline starts to read before the paragraph and facts below it.
    const at = SD.out + (index - 1) * SD.stagger + (index > 1 ? 2 * SD.stagger : 0);
    tl.fromTo(item, { opacity: 0, y: `${SD.rise}em` },
      { opacity: 1, y: 0, duration: Math.min(SD.in, YD.open - at), ease: 'sine.out' }, at);
  }
  tl.add(gooIn(titleOf(entry)), YD.open - SD.in);
}

function returnSlot(carousel: Carousel, index: number, card: HTMLElement) {
  if (!carousel.indices.includes(index)) carousel.setFilter('all');
  carousel.offset = carousel.indices.indexOf(index);
  carousel.setPresence(1);
  if (carousel.view !== 'grid') return;
  const viewport = document.querySelector<HTMLElement>('.works__canvas')!;
  if (carousel.hasStage) {
    const tile = carousel.cardRect(index);
    if (tile.top >= 0 && tile.bottom <= innerHeight) return;
    viewport.scrollTop += tile.top - (innerHeight - tile.height) / 2;
    carousel.setGridScroll(viewport.scrollTop);
  } else {
    card.scrollIntoView({ block: 'nearest' });
  }
}

export function registerCaseTransitions(
  director: Director, getHero: () => PointScene | undefined, getCarousel: () => Carousel,
  navigate: (to: State) => void,
  getReadyForReturn?: () => Promise<PointScene | null>,
): void {
  const root = document.documentElement;
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.works__list [data-work]'));
  let active: gsap.core.Timeline | undefined;
  let finish: (() => void) | undefined;

  function move(slug: string, opening: boolean): gsap.core.Timeline {
    const carousel = getCarousel();
    const index = cards.findIndex(card => card.dataset.work === slug);
    const card = cards[index];
    const entry = article(slug);
    const media = entry.querySelector<HTMLElement>('.case__media')!;
    const lead = media.querySelector<HTMLElement>('li')!;
    const panel = panelOf(entry);
    const hero = getHero();
    const full = carousel.hasStage && motionMode() === 'full';
    root.classList.add('is-case-portfolio');
    if (opening) {
      const preview = card.querySelector<HTMLImageElement>('.works__thumbnail')?.dataset.src;
      showCase(slug, { deferMedia: true, preview, projected: full });
    }
    else {
      returnSlot(carousel, index, card);
      if (full) rewindCaseMedia();
    }
    entry.inert = true;
    const tl = gsap.timeline();
    active = tl;
    let stopMeasuring: (() => void) | undefined;
    if (full) {
      const progress = { value: opening ? 0 : 1 };
      let rect = lead.getBoundingClientRect();
      const measure = () => { rect = lead.getBoundingClientRect(); };
      const resize = new ResizeObserver(measure);
      resize.observe(lead);
      entry.addEventListener('scroll', measure, { capture: true });
      stopMeasuring = () => {
        resize.disconnect();
        entry.removeEventListener('scroll', measure, true);
      };
      const project = () => carousel.setCaseProgress(index, progress.value, rect);
      project();
      media.classList.add('is-projected');
      const duration = opening ? YD.open : PM.casePortfolio;
      tl.to(progress, { value: opening ? 1 : 0, duration, ease: YD.glide, onUpdate: project }, 0);
      if (hero) tl.to(hero.u.uDim, { value: opening ? 1 : portfolioDim, duration, ease: YD.glide }, 0);
      tl.fromTo(panel, { xPercent: opening ? 100 : 0 },
        { xPercent: opening ? 0 : 100, duration, ease: opening ? 'power3.out' : 'power3.in' }, 0);
      if (opening) {
        tl.to('.portfolio__bar, .works__label', { opacity: 0, duration: SD.out }, 0);
        tl.to('.works__caption', { opacity: 0, duration: SD.out - YD.captionAt }, YD.captionAt);
        revealCaseText(tl, entry);
      } else {
        tl.add(gooOut(titleOf(entry)), 0);
        tl.to(fades(entry), { opacity: 0, duration: SD.out }, 0);
        tl.fromTo(chrome, { opacity: 0 }, { opacity: 1, duration: SD.in }, duration - SD.in);
      }
    } else {
      const outgoing = opening ? '.portfolio' : entry;
      const arriving = opening ? entry : '.portfolio';
      tl.fromTo(outgoing, { opacity: 1 }, { opacity: 0, duration: SD.out }, 0);
      tl.fromTo(arriving, { opacity: 0 }, { opacity: 1, duration: SD.out }, 0);
    }
    finish = () => {
      stopMeasuring?.();
      if (opening) carousel.setPresence(0);
      carousel.clearCaseProgress();
      root.classList.remove('is-case-portfolio');
      media.classList.remove('is-projected');
      entry.inert = false;
      gsap.set([entry, panel, '.portfolio', ...fades(entry), titleOf(entry)], { clearProps: 'opacity,transform' });
      gsap.set(chrome, { clearProps: 'opacity' });
      if (opening) {
        resumeCaseMedia();
        panel.focus({ preventScroll: true });
      } else {
        // The hidden title can next arrive via a case-to-case opacity fade.
        if (full) gooIn(titleOf(entry)).progress(1).kill();
        card.querySelector('a')?.focus({ preventScroll: true });
      }
    };
    return tl;
  }

  director.register('portfolio', 'case', (_, to) => move((to as Extract<State, { kind: 'case' }>).slug, true));
  director.register('case', 'portfolio', async from => {
    if (from.kind !== 'case') throw new Error('Expected a case route');
    await getReadyForReturn?.();
    await getCarousel().prepareCovers();
    return { timeline: move(from.slug, false) };
  });
  director.register('case', 'case', (from, to) => {
    if (from.kind !== 'case' || to.kind !== 'case') throw new Error('Expected two case routes');
    const old = article(from.slug), next = article(to.slug);
    const oldContent = [titleOf(old), ...fades(old), ...old.querySelectorAll('.case__media li')];
    const newContent = [titleOf(next), ...fades(next), ...next.querySelectorAll('.case__media li')];
    const tl = gsap.timeline();
    active = tl;
    if (motionMode() === 'full' && !document.querySelector('.stage--still')) {
      tl.to(oldContent, { opacity: 0, duration: SD.out }, 0);
      tl.call(() => showCase(to.slug, { deferMedia: true }), [], SD.out);
      tl.fromTo(newContent, { opacity: 0 }, { opacity: 1, duration: SD.in }, SD.out);
    } else {
      showCase(to.slug, { deferMedia: true });
      old.hidden = false;
      old.inert = true;
      tl.fromTo(old, { opacity: 1 }, { opacity: 0, duration: SD.out }, 0);
      tl.fromTo(next, { opacity: 0 }, { opacity: 1, duration: SD.out }, 0);
    }
    finish = () => {
      old.hidden = true;
      old.inert = false;
      gsap.set([old, next, ...oldContent, ...newContent], { clearProps: 'opacity' });
      resumeCaseMedia();
      panelOf(next).focus({ preventScroll: true });
    };
    return tl;
  });
  director.addEventListener('change', () => {
    if (!active) return;
    if (active.progress() < 1) active.progress(1);
    active = undefined;
    finish?.();
    finish = undefined;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || director.busy || director.state.kind !== 'case' || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    navigate({ kind: 'portfolio' });
  });
}
