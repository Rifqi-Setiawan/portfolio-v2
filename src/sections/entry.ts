import '../styles/entry.css';
import gsap from 'gsap';
import { ENTRY, SD } from '../core/timings';
import { isNarrow, isReduced, motionMode } from '../core/motion';
import { gooOut } from '../fx/goo';
import type { Carousel } from '../gl/carousel';
import type { PointScene } from '../gl/pointScene';
import { addPortfolioArrival, portfolioDim, portfolioVeil, settleHeroPortfolio } from '../transitions';
import { resumeCaseMedia, showCase } from './case';
import { revealCaseText } from './caseTransitions';
import { beginLoader } from './intro';

const loader = () => document.querySelector<HTMLElement>('.preloader')!;

/** The short title is shared by all deep links, independently of scene preparation. */
export async function directLoader(prepared: Promise<void>): Promise<void> {
  beginLoader();
  await Promise.all([prepared, gsap.delayedCall(ENTRY.loader - SD.out, () => {})]);
  const title = Array.from(loader().querySelectorAll<HTMLElement>('[data-goo]'));
  if (isReduced()) {
    await gsap.to(title, { opacity: 0, duration: SD.out });
  } else {
    await gooOut(title);
  }
  loader().hidden = true;
}

export function beginDirectArrival(): void {
  loader().dataset.arriving = '';
}

export function enterCase(slug: string, animated: boolean): gsap.core.Timeline {
  showCase(slug, { deferMedia: true });
  const entry = document.querySelector<HTMLElement>(`.case__entry[data-case="${CSS.escape(slug)}"]`)!;
  const panel = entry.querySelector<HTMLElement>('.case__panel')!;
  const tl = gsap.timeline();
  beginDirectArrival();
  tl.to('.stage', { '--entry-poster-alpha': 1, duration: SD.out }, 0);
  if (animated) {
    tl.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: SD.in, ease: 'power3.out' }, 0);
    const copy = gsap.timeline();
    revealCaseText(copy, entry);
    tl.add(copy.duration(SD.in), 0);
  } else {
    tl.fromTo(entry, { opacity: 0 }, { opacity: 1, duration: SD.out }, 0);
  }
  return tl.call(() => {
    gsap.set([entry, panel], { clearProps: 'transform,opacity' });
    resumeCaseMedia();
    panel.focus({ preventScroll: true });
  });
}

export function enterPortfolio(hero: PointScene | null, carousel: Carousel): gsap.core.Timeline {
  const tl = gsap.timeline();
  beginDirectArrival();
  if (!hero || !carousel.hasStage || motionMode() !== 'full' || isNarrow()) {
    // On a direct phone entry the controls, selected card and caption arrive together.
    settleHeroPortfolio('portfolio', hero ?? undefined, carousel);
    return tl.fromTo('.portfolio', { opacity: 0 }, { opacity: 1, duration: SD.out, clearProps: 'opacity' }, 0);
  }

  // Assemble the name directly into the final pulled-back photograph.
  carousel.setPresence(0);
  hero.u.uIntro.value = hero.u.uRecede.value = 1;
  hero.u.uDim.value = portfolioDim;
  tl.fromTo(hero.u.uMorph, { value: 0 }, { value: 1, duration: ENTRY.portfolioMorph, ease: 'none' }, 0);
  tl.fromTo(hero.u.uPhoto, { value: 0 }, { value: 1, duration: ENTRY.portfolioPhoto, ease: 'sine.inOut' },
    ENTRY.portfolioPhotoAt);
  tl.to('.veil', { opacity: portfolioVeil, duration: SD.in }, 0);
  addPortfolioArrival(tl, carousel, tl.duration());
  return tl;
}
