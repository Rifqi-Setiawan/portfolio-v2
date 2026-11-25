import gsap from 'gsap';
import { motionMode } from '../core/motion';
import { createSmoothScroll } from '../core/scroll';
import { OD, SD, YD } from '../core/timings';
import { gooIn, markMoving, releaseGoo } from '../fx/goo';
import { odometer } from '../fx/odometer';

let cleanup: (() => void) | undefined;

/** Start the words once the portrait split is open. The copy follows the title. */
export function revealAbout(readingPosition = 0): void {
  if (cleanup) return;
  const scroller = document.querySelector<HTMLElement>('.about__scroll')!;
  const content = scroller.querySelector<HTMLElement>('.about__content')!;
  const words = Array.from(content.querySelectorAll<HTMLElement>('.about__title [data-goo]'));
  const blocks = Array.from(content.querySelectorAll<HTMLElement>('[data-about-fade]'));
  const full = motionMode() === 'full' && !document.documentElement.classList.contains('about-still');
  const smooth = createSmoothScroll(scroller);
  const travel = gsap.timeline();
  const rolls: gsap.core.Timeline[] = [];
  let observer: IntersectionObserver | undefined;

  scroller.scrollTop = readingPosition;
  if (full) {
    travel.add(gooIn(words, { duration: SD.rise, stagger: OD.stagger }), 0);
    travel.fromTo(blocks, { opacity: 0, y: `${SD.rise}em` },
      { opacity: 1, y: 0, duration: SD.out, stagger: OD.stagger, ease: 'power2.out' }, YD.captionAt);
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < .25) continue;
        const el = entry.target as HTMLElement;
        observer?.unobserve(el);
        if (el.dataset.odometer) rolls.push(odometer(el, el.dataset.odometer));
      }
    }, { root: scroller, threshold: .25 });
    content.querySelectorAll('[data-odometer]').forEach(el => observer!.observe(el));
  } else {
    travel.fromTo([...words, ...blocks], { opacity: 0 }, { opacity: 1, duration: SD.out });
  }
  const onScroll = () => markMoving(content);
  scroller.addEventListener('scroll', onScroll, { passive: true });
  content.classList.add('is-revealed');

  cleanup = () => {
    content.classList.remove('is-revealed');
    scroller.removeEventListener('scroll', onScroll);
    smooth.destroy();
    observer?.disconnect();
    travel.kill();
    for (const roll of rolls) roll.kill();
    for (const word of words) {
      releaseGoo(word);
      word.classList.remove('is-in');
    }
    gsap.set([...blocks, ...words], { clearProps: 'opacity,transform' });
    scroller.scrollTop = 0;
  };
}

export function hideAbout(): void {
  cleanup?.();
  cleanup = undefined;
}
