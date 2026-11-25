import gsap from 'gsap';
import { isReduced } from '../core/motion';
import { introTiming, NM, SD } from '../core/timings';
import { gooIn, gooOut } from '../fx/goo';
import type { PointScene } from '../gl/pointScene';
import type { Preset } from '../gl/preset';
import { heroWords, scrollHints } from './hero';

const loaderWords = () => Array.from(document.querySelectorAll<HTMLElement>('.preloader [data-goo]'));
const headerWords = () => Array.from(document.querySelectorAll<HTMLElement>('.logo [data-goo], .nav__link'));

function mark(phase: string): void {
  if (import.meta.env.VITE_EXPOSE_APP === '1') performance.mark(`intro:${phase}`);
}

let loaderReveal: gsap.core.Animation | undefined;

/** Called as soon as fonts are ready, while the point cloud may still be sampling. */
export function beginLoader(): gsap.core.Animation {
  if (loaderReveal) return loaderReveal;
  const title = loaderWords();
  document.body.style.visibility = 'visible';
  mark('title-in');
  loaderReveal = isReduced()
    ? gsap.fromTo(title, { opacity: 0 }, { opacity: 1, duration: SD.in })
    : gooIn(title);
  return loaderReveal;
}

export function finishIntro(): void {
  document.body.style.visibility = 'visible';
  document.documentElement.classList.remove('is-intro', 'has-intro-particles');
}

export function playIntro(scene: PointScene | null, preset: Preset): gsap.core.Timeline {
  beginLoader();
  const tl = gsap.timeline();
  const title = loaderWords();
  const words = heroWords();
  const header = headerWords();
  const hints = scrollHints();
  const arrow = document.querySelector<SVGSVGElement>('.hero__arrow');
  const paths = arrow ? Array.from(arrow.querySelectorAll('path')) : [];
  const finish = () => { finishIntro(); mark('end'); };

  if (!scene) {
    // Finish the title reveal if the still was ready before the font animation settled.
    const reveal = loaderReveal!;
    const fadeAt = Math.max(0, reveal.duration() - reveal.time());
    tl.to(title, { opacity: 0, duration: SD.out }, fadeAt);
    tl.to([...words, ...header, ...hints, ...(arrow ? [arrow] : [])], {
      opacity: 1, duration: SD.out,
      onComplete: () => { for (const el of [...words, ...header, ...hints]) el.classList.add('is-in'); },
    }, fadeAt + SD.out);
    return tl.call(finish);
  }

  const { dustStart, morphStart, morphDuration, portraitStart, photoStart, photoDuration, nameOut, textStart, headerStart, scrollStart } = introTiming(preset);

  const endCalibration = scene.calibrateIntro();
  tl.eventCallback('onInterrupt', endCalibration);
  tl.addLabel('dust', dustStart);
  tl.call(() => { endCalibration(); document.documentElement.classList.add('has-intro-particles'); }, [], 'dust');
  tl.to(scene.u.uIntro, { value: 1, duration: morphStart - dustStart, ease: 'none' }, 'dust');
  tl.call(() => mark('morph-start'), [], morphStart);
  // Per-point ordering and the sine ease are applied in the point shader.
  tl.to(scene.u.uMorph, { value: 1, duration: morphDuration, ease: 'none' }, morphStart);
  tl.addLabel('portrait', portraitStart);
  tl.addLabel('photo', photoStart);
  tl.call(() => mark('photo-start'), [], 'photo');
  tl.to(scene.u.uPhoto, { value: 1, duration: photoDuration, ease: 'sine.inOut' }, 'photo');
  tl.addLabel('photo-in', photoStart + photoDuration);

  tl.addLabel('name-out', nameOut);
  tl.add(gooOut(title), 'name-out');
  tl.addLabel('hero-words', textStart);
  tl.call(() => mark('hero-text'), [], 'hero-words');
  tl.add(gooIn(words, { duration: NM.duration, stagger: NM.stagger }), 'hero-words');
  tl.call(() => mark('header'), [], headerStart);
  tl.add(gooIn(header), headerStart);
  tl.call(() => mark('scroll'), [], scrollStart);
  tl.add(gooIn(hints), scrollStart);
  for (const path of paths) {
    const length = path.pathLength.baseVal || path.getTotalLength();
    tl.fromTo(path, { strokeDasharray: length, strokeDashoffset: length },
      { strokeDashoffset: 0, duration: SD.in, ease: 'power2.out' }, scrollStart);
  }
  if (arrow) tl.to(arrow, { opacity: 1, duration: SD.in }, scrollStart);
  // Keep the live film grain moving under the final title. Once the intro
  // completes this callback stops along with the authored motion.
  tl.to({}, { duration: tl.duration() - (photoStart + photoDuration), onUpdate: scene.animateIntroGrain }, 'photo-in');
  return tl.call(finish);
}
