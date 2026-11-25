import gsap from 'gsap';
import type { Director, PreparedTransition } from '../core/director';
import type { State } from '../core/routes';
import { PM, PORTRAIT, SD } from '../core/timings';
import type { Carousel } from '../gl/carousel';
import type { PointScene } from '../gl/pointScene';
import { portfolioDim } from '../transitions';
import { hideAbout, revealAbout } from './about';
import { showCase } from './case';
import { flyToHero, flyToPortfolio, flyToPortrait, fullPortraitMotion, leaveWork, portrait, type SceneKind } from './portraitFlight';

const stageOf = (state: State): SceneKind => state.kind === 'about' ? 'about' : 'hero';
const sectionOf = (state: State) => document.querySelector<HTMLElement>(`main > .${state.kind}`)!;

export function registerAboutTransitions(
  director: Director, loadScene: (kind: SceneKind) => Promise<PointScene | null>,
  selectScene: (kind: SceneKind) => void, getCarousel: () => Carousel,
): void {
  let current: { timeline: gsap.core.Timeline; cleanup: () => void } | undefined;
  function remember(timeline: gsap.core.Timeline, from: State, to: State): PreparedTransition {
    current = {
      timeline,
      cleanup() {
        if (from.kind === 'about') hideAbout();
        gsap.set([sectionOf(from), sectionOf(to)], { clearProps: 'visibility,opacity' });
        gsap.set('.about__scroll', { clearProps: 'opacity' });
        if (to.kind === 'case') sectionOf(to).querySelector<HTMLElement>('.case__entry:not([hidden]) .case__panel')?.focus({ preventScroll: true });
      },
    };
    return { timeline };
  }

  function stageArrival(to: State, scene: PointScene | null): void {
    selectScene(stageOf(to));
    if (to.kind === 'about') {
      document.documentElement.classList.toggle('about-still', !scene);
      if (scene) portrait(scene, 1);
      revealAbout();
    } else {
      document.documentElement.classList.remove('about-still');
      if (scene) {
        portrait(scene, 0);
        scene.u.uRecede.value = to.kind === 'hero' ? 0 : 1;
        scene.u.uDim.value = to.kind === 'case' ? 1 : to.kind === 'portfolio' ? portfolioDim : 0;
      }
      if (to.kind === 'case') showCase(to.slug);
    }
  }

  function still(from: State, to: State, scene: PointScene | null): PreparedTransition {
    const tl = gsap.timeline();
    const outgoing = sectionOf(from), arriving = sectionOf(to);
    gsap.set(arriving, { visibility: 'visible' });
    // Preserve the departing still until its section has finished fading out.
    if (to.kind === 'about') stageArrival(to, scene);
    else {
      if (to.kind === 'case') showCase(to.slug);
      if (to.kind === 'portfolio') getCarousel().setPresence(1);
      tl.call(() => stageArrival(to, scene), [], SD.out);
    }
    tl.fromTo(outgoing, { opacity: 1 }, { opacity: 0, duration: SD.out }, 0);
    tl.fromTo(arriving, { opacity: 0 }, { opacity: 1, duration: SD.out }, 0);
    return remember(tl, from, to);
  }

  async function flight(from: State, to: State): Promise<PreparedTransition> {
    const [hero, about] = await Promise.all([loadScene('hero'), loadScene('about')]);
    const forward = to.kind === 'about';
    if (!hero || !about || !fullPortraitMotion()) return still(from, to, forward ? about : hero);
    const tl = gsap.timeline();
    if (forward) {
      const fromWork = from.kind !== 'hero';
      if (fromWork) leaveWork(tl, from, getCarousel);
      const skip = flyToPortrait(tl, hero, about, selectScene, fromWork ? 'work' : 'hero');
      tl.set(sectionOf(to), { visibility: 'visible' }, PORTRAIT.splitAt - skip);
      tl.to(about.u.uSplit, { value: 1, duration: PORTRAIT.splitDuration, ease: 'power2.inOut' }, PORTRAIT.splitAt - skip);
      tl.call(() => revealAbout(), [], PORTRAIT.aboutTextAt - skip);
      tl.set('.about__scroll', { clearProps: 'opacity' }, PORTRAIT.aboutEnd - skip);
    } else {
      tl.to('.about__scroll', { opacity: 0, duration: SD.out }, 0);
      tl.to(about.u.uSplit, { value: 0, duration: PORTRAIT.splitDuration, ease: 'sine.inOut' }, 0);
      flyToHero(tl, hero, about, selectScene, PORTRAIT.splitDuration + SD.out);
    }
    return remember(tl, from, to);
  }

  async function returnToWork(from: State, to: State): Promise<PreparedTransition> {
    const [next, about] = await Promise.all([loadScene('hero'), loadScene('about')]);
    if (!next || !about || !fullPortraitMotion()) return still(from, to, next);
    const tl = gsap.timeline();
    tl.to('.about__scroll', { opacity: 0, duration: SD.out }, 0);
    if (to.kind === 'portfolio') {
      tl.to(about.u.uSplit, { value: 0, duration: SD.in, ease: 'sine.inOut' }, 0);
      flyToPortfolio(tl, next, about, selectScene, getCarousel(), PORTRAIT.portfolioPullAt);
      return remember(tl, from, to);
    }
    const middle = PM.aboutPortfolio / 2;
    const section = sectionOf(to);
    tl.to(about.u.uSplit, { value: 0, duration: middle, ease: 'sine.inOut' }, 0);
    tl.call(() => stageArrival(to, next), [], middle);
    tl.set(section, { visibility: 'visible' }, middle);
    tl.fromTo(section, { opacity: 0 }, { opacity: 1, duration: middle, immediateRender: false }, middle);
    tl.fromTo(next.u.uDim, { value: 0 }, { value: 1, duration: middle, immediateRender: false }, middle);
    return remember(tl, from, to);
  }

  director.register('hero', 'about', flight);
  director.register('about', 'hero', flight);
  for (const kind of ['portfolio', 'case'] as const) {
    director.register(kind, 'about', flight);
    director.register('about', kind, returnToWork);
  }
  director.addEventListener('change', () => {
    if (!current) return;
    const { timeline, cleanup } = current;
    current = undefined;
    if (timeline.progress() < 1) timeline.progress(1);
    cleanup();
  });
}
