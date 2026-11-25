import gsap from 'gsap';
import type { Director } from './core/director';
import { motionMode } from './core/motion';
import type { State } from './core/routes';
import { PM, SD, T1 } from './core/timings';
import { gooIn, gooOut } from './fx/goo';
import type { Carousel } from './gl/carousel';
import type { PointScene } from './gl/pointScene';
import { heroWords, scrollHints } from './sections/hero';
import { resumeCaseMedia, showCase } from './sections/case';

export const portfolioDim = .26;
export const portfolioVeil = .45;
const heroCopy = () => [...heroWords(), ...scrollHints()];
const portfolioChrome = () => Array.from(document.querySelectorAll<HTMLElement>('.portfolio__bar [data-goo], .works__caption [data-goo]'));

/** The travelling hero and a direct portfolio entry share the same card and caption arrival. */
export function addPortfolioArrival(tl: gsap.core.Timeline, carousel: Carousel, start = 0): void {
  const presence = { value: carousel.presence };
  tl.to(presence, {
    value: 1, duration: PM.heroPortfolio - T1.cardStart, ease: 'power3.out',
    onUpdate: () => carousel.setPresence(presence.value),
  }, start + T1.cardStart);
  tl.add(gooIn(portfolioChrome()).duration(PM.heroPortfolio - T1.controlsAt), start + T1.controlsAt);
}

/** Set the same endpoint for a direct entry or an arrival from another section. */
export function settleHeroPortfolio(state: 'hero' | 'portfolio', hero: PointScene | undefined, carousel?: Carousel): void {
  const work = state === 'portfolio';
  if (hero) {
    hero.u.uRecede.value = work ? 1 : 0;
    hero.u.uDim.value = work ? portfolioDim : 0;
  }
  carousel?.setPresence(work ? 1 : 0);
  gsap.set('.veil', { opacity: work ? portfolioVeil : 0 });
  const copy = work ? portfolioChrome() : heroCopy();
  // A completed work arrival already settled these labels. Recreating seven
  // filters and reading layout at the handoff stalls the first settled frame.
  if (work && copy.every(el => el.classList.contains('is-in'))) return;
  if (hero) {
    gooIn(copy).progress(1).kill();
  } else {
    gsap.set(copy, { opacity: 1, clearProps: 'filter,transform' });
    copy.forEach(el => el.classList.add('is-in'));
  }
  if (!work) gsap.set('.hero__arrow', { opacity: 1 });
}

function stillTransition(open: boolean, carousel: Carousel): gsap.core.Timeline {
  const [outgoing, arriving] = open ? ['.hero', '.portfolio'] : ['.portfolio', '.hero'];
  const tl = gsap.timeline();
  carousel.setPresence(open ? 1 : 0);
  const departingCopy = open ? heroCopy() : portfolioChrome();
  const arrivingCopy = open ? portfolioChrome() : heroCopy();
  gsap.set(arrivingCopy, { opacity: 1, clearProps: 'filter,transform' });
  if (!open) gsap.set('.hero__arrow', { opacity: 1 });
  departingCopy.forEach(el => el.classList.remove('is-in'));
  return tl.fromTo(outgoing, { opacity: 1 }, { opacity: 0, duration: SD.out }, 0)
    .fromTo(arriving, { opacity: 0 }, { opacity: 1, duration: SD.out }, 0)
    .to('.veil', { opacity: open ? portfolioVeil : 0, duration: SD.out }, 0)
    .call(() => { arrivingCopy.forEach(el => el.classList.add('is-in')); });
}

function travel(hero: PointScene, carousel: Carousel, open: boolean): gsap.core.Timeline {
  const end = PM.heroPortfolio;
  const tl = gsap.timeline();
  tl.to(hero.u.uRecede, { value: open ? 1 : 0, duration: end, ease: 'power2.inOut' }, 0);
  tl.to(hero.u.uDim, { value: open ? portfolioDim : 0, duration: end, ease: 'power2.inOut' }, 0);
  tl.to('.veil', { opacity: open ? portfolioVeil : 0, duration: end, ease: 'power2.inOut' }, 0);
  const words = heroCopy();
  if (open) {
    tl.add(gooOut(words), 0);
    tl.to('.hero__arrow', { opacity: 0, duration: SD.out }, 0);
    addPortfolioArrival(tl, carousel);
  } else {
    const presence = { value: carousel.presence };
    tl.to(presence, {
      value: 0, duration: end - T1.cardStart, ease: 'power3.in',
      onUpdate: () => carousel.setPresence(presence.value),
    }, 0);
    tl.add(gooOut(portfolioChrome()).duration(end - T1.controlsAt), 0);
    tl.add(gooIn(words).duration(SD.out), end - SD.out);
    tl.fromTo('.hero__arrow', { opacity: 0 }, { opacity: 1, duration: SD.out }, end - SD.out);
  }
  return tl;
}

export function heroToPortfolio(hero: PointScene | undefined, carousel: Carousel): gsap.core.Timeline {
  return hero && carousel.hasStage && motionMode() === 'full' ? travel(hero, carousel, true) : stillTransition(true, carousel);
}

export function portfolioToHero(hero: PointScene | undefined, carousel: Carousel): gsap.core.Timeline {
  return hero && carousel.hasStage && motionMode() === 'full' ? travel(hero, carousel, false) : stillTransition(false, carousel);
}

export function registerTransitions(
  director: Director, getHero: () => PointScene | undefined, getCarousel: () => Carousel,
  getReadyForReturn?: () => Promise<PointScene | null>,
): void {
  const root = document.documentElement;
  let active: gsap.core.Timeline | undefined;
  const begin = (open: boolean) => {
    root.classList.add('is-hero-portfolio');
    active = (open ? heroToPortfolio : portfolioToHero)(getHero(), getCarousel());
    return active;
  };
  director.register('hero', 'portfolio', () => begin(true));
  director.register('portfolio', 'hero', () => begin(false));
  // History and the global logo can go directly between a work and the landing page.
  async function crossCase(from: State, to: State) {
    const departing = document.querySelector<HTMLElement>(`main > .${from.kind}`)!;
    const arriving = document.querySelector<HTMLElement>(`main > .${to.kind}`)!;
    if (to.kind === 'case') showCase(to.slug, { deferMedia: true });
    else {
      await getReadyForReturn?.();
      settleHeroPortfolio('hero', getHero());
    }
    gsap.set(arriving, { visibility: 'visible' });
    active = gsap.timeline()
      .fromTo(departing, { opacity: 1 }, { opacity: 0, duration: SD.out }, 0)
      .fromTo(arriving, { opacity: 0 }, { opacity: 1, duration: SD.out }, 0);
    const hero = getHero();
    if (hero && to.kind === 'case') {
      active.to([hero.u.uDim, hero.u.uRecede], { value: 1, duration: SD.out }, 0);
    }
    return { timeline: active };
  }
  director.register('hero', 'case', crossCase);
  director.register('case', 'hero', crossCase);
  director.addEventListener('change', () => {
    if (!active) return;
    // The director can also settle a timeline after a suspended tab or interruption.
    if (active.progress() < 1) active.progress(1);
    active = undefined;
    root.classList.remove('is-hero-portfolio');
    gsap.set(['.hero', '.portfolio', 'section.case'], { clearProps: 'opacity,visibility' });
    if (director.state.kind === 'case') {
      resumeCaseMedia();
      document.querySelector<HTMLElement>('.case__entry:not([hidden]) .case__panel')?.focus({ preventScroll: true });
    }
  });
}
