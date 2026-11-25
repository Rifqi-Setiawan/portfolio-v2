import { motionMode } from '../core/motion';
import type { State } from '../core/routes';
import { LM, PM, PORTRAIT, SD, T1 } from '../core/timings';
import type { Carousel } from '../gl/carousel';
import type { PointScene } from '../gl/pointScene';
import { addPortfolioArrival, portfolioDim, portfolioVeil } from '../transitions';
import { collapseHeroTitle, scrollHints } from './hero';

export type SceneKind = 'hero' | 'about';
export type LoadScene = (kind: SceneKind) => Promise<PointScene | null>;
export type SelectScene = (kind: SceneKind) => void;

export function fullPortraitMotion(): boolean {
  return motionMode() === 'full' && !document.querySelector('.stage--still, .stage--lost');
}

export function portrait(scene: PointScene, split: number): void {
  scene.u.uIntro.value = scene.u.uMorph.value = scene.u.uPhoto.value = 1;
  scene.u.uRecede.value = scene.u.uDim.value = scene.u.uFly.value = 0;
  scene.u.uSplit.value = split;
}

const wide = LM.pullBack / (LM.pullBack + LM.flyThrough);
const waist = wide + (1 - wide) * .65;
const flightLength = PORTRAIT.faceAt - PORTRAIT.flyAt;
// The pause between these two moves holds the same waist-up frame in either direction.
const dolly = [
  { from: wide, to: waist, start: PORTRAIT.flyAt, end: PORTRAIT.mediumAt },
  { from: waist, to: 1, start: PORTRAIT.leaveMediumAt, end: PORTRAIT.faceAt },
];

function moveCamera(tl: gsap.core.Timeline, hero: PointScene, at: number, reverse: boolean, duration = flightLength): void {
  const rate = duration / flightLength;
  for (const move of dolly) {
    const offset = reverse ? PORTRAIT.faceAt - move.end : move.start - PORTRAIT.flyAt;
    tl.fromTo(hero.u.uFly, { value: reverse ? move.to : move.from }, {
      value: reverse ? move.from : move.to, duration: (move.end - move.start) * rate,
      ease: 'sine.inOut', immediateRender: false,
    }, at + offset * rate);
  }
}

export function leaveWork(tl: gsap.core.Timeline, from: State, getCarousel: () => Carousel): void {
  const section = document.querySelector<HTMLElement>(`main > .${from.kind}`)!;
  const roomAt = PORTRAIT.workRoomAt;
  tl.to('.veil', { opacity: 0, duration: roomAt }, 0);
  if (from.kind === 'portfolio') {
    const carousel = getCarousel();
    // Section chrome is DOM; the visible cards fold in the overlay scene.
    tl.to(section, { opacity: 0, duration: SD.out }, 0);
    tl.to(carousel, { departureFold: 1, duration: roomAt, ease: 'power2.in' }, 0);
    tl.call(() => { carousel.setPresence(0); carousel.departureFold = 0; }, [], roomAt);
  } else {
    const entry = section.querySelector<HTMLElement>('.case__entry:not([hidden])')!;
    const panel = entry.querySelector<HTMLElement>('.case__panel')!;
    const text = panel.querySelectorAll('[data-case-fade], .case__title');
    tl.to(text, { opacity: 0, duration: SD.out }, 0);
    tl.to(panel, { xPercent: 100, duration: SD.in, ease: 'power2.in' }, roomAt - SD.in);
    tl.fromTo(entry, { clipPath: 'inset(0% 0% 0% 0%)' }, {
      clipPath: 'inset(0% 0% 100% 0%)', duration: SD.out, ease: 'power2.in', immediateRender: false,
    }, roomAt - SD.out);
    tl.set(section, { visibility: 'hidden' }, roomAt);
    tl.set(text, { clearProps: 'opacity' }, roomAt);
    tl.set(panel, { clearProps: 'transform' }, roomAt);
    tl.set(entry, { clearProps: 'clipPath' }, roomAt);
  }
}

/** The work pages join the same dolly at the wide room shot as their content clears. */
export function flyToPortrait(
  tl: gsap.core.Timeline, hero: PointScene, about: PointScene, select: SelectScene,
  from: 'hero' | 'work' = 'hero',
): number {
  const roomAt = from === 'hero' ? PORTRAIT.flyAt : PORTRAIT.workRoomAt;
  const start = from === 'hero' ? PORTRAIT.pullAt : 0;
  portrait(about, 0);
  if (from === 'hero') {
    tl.add(collapseHeroTitle(false), PORTRAIT.collapseAt);
    tl.to([...scrollHints(), '.hero__arrow'], { opacity: 0, duration: SD.out }, PORTRAIT.collapseAt);
  } else {
    // Clear the defocus and dim behind the folding cards or sliding case panel.
    tl.to([hero.u.uRecede, hero.u.uDim], { value: 0, duration: roomAt, ease: 'sine.out' }, 0);
  }
  tl.to(hero.u.uFly, { value: wide, duration: roomAt - start, ease: 'sine.inOut' }, start);
  const skip = PORTRAIT.flyAt - roomAt;
  moveCamera(tl, hero, roomAt, false);
  const landing = PORTRAIT.faceAt - skip;
  const heroWeight = about.focusFromHero(hero);
  tl.call(() => select('about'), [], landing);
  tl.fromTo(heroWeight, { value: 1 }, {
    value: 0, duration: PORTRAIT.focusDuration, ease: 'sine.inOut', immediateRender: false,
  }, landing);
  return skip;
}

function pullAway(tl: gsap.core.Timeline, hero: PointScene, about: PointScene, select: SelectScene, start: number, duration: number): number {
  portrait(hero, 0);
  hero.u.uFly.value = 1;
  tl.to(about.focusFromHero(hero), { value: 1, duration: PORTRAIT.focusDuration, ease: 'sine.inOut' }, start - PORTRAIT.focusDuration);
  tl.call(() => select('hero'), [], start);
  moveCamera(tl, hero, start, true, duration);
  return start + duration;
}

export function flyToHero(tl: gsap.core.Timeline, hero: PointScene, about: PointScene, select: SelectScene, start: number): void {
  const roomAt = pullAway(tl, hero, about, select, start, LM.flyBack);
  const title = roomAt + SD.out;
  tl.to(hero.u.uFly, { value: 0, duration: SD.in, ease: 'sine.inOut' }, roomAt);
  tl.set('.hero', { visibility: 'visible' }, title);
  tl.add(collapseHeroTitle(true), title);
  tl.fromTo([...scrollHints(), '.hero__arrow'], { opacity: 0 },
    { opacity: 1, duration: SD.out, immediateRender: false }, title + SD.rise);
}

export function flyToPortfolio(tl: gsap.core.Timeline, hero: PointScene, about: PointScene, select: SelectScene, carousel: Carousel, start: number): void {
  const roomAt = pullAway(tl, hero, about, select, start, flightLength);
  carousel.setPresence(0);
  tl.set('.portfolio', { visibility: 'hidden' }, 0);
  tl.set('.portfolio', { visibility: 'visible' }, roomAt + T1.cardStart);
  tl.to(hero.u.uFly, { value: 0, duration: PM.heroPortfolio, ease: 'sine.inOut' }, roomAt);
  tl.to(hero.u.uRecede, { value: 1, duration: PM.heroPortfolio, ease: 'sine.inOut' }, roomAt);
  tl.to(hero.u.uDim, { value: portfolioDim, duration: PM.heroPortfolio }, roomAt);
  tl.to('.veil', { opacity: portfolioVeil, duration: PM.heroPortfolio }, roomAt);
  addPortfolioArrival(tl, carousel, roomAt);
}
