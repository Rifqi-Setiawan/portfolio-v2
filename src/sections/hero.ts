import gsap from 'gsap';
import type { Director } from '../core/director';
import { SD } from '../core/timings';
import { gooIn, gooOut } from '../fx/goo';
import type { State } from '../core/routes';
import type { PointScene } from '../gl/pointScene';

export const heroWords = () => Array.from(document.querySelectorAll<HTMLElement>('.hero__title [data-goo]'));
export const scrollHints = () => Array.from(document.querySelectorAll<HTMLElement>('.hero__hint'));

/** Use the glyphs in their native layout while the entire line contracts into its glow. */
export function collapseHeroTitle(opening: boolean): gsap.core.Timeline {
  const title = document.querySelector<HTMLElement>('.hero__title')!;
  const hero = title.closest<HTMLElement>('.hero')!;
  const root = document.documentElement;
  const words = heroWords();
  const bounds = title.getBoundingClientRect();
  const boxes = words.map(word => word.getBoundingClientRect());
  const x = (Math.min(...boxes.map(b => b.left)) + Math.max(...boxes.map(b => b.right))) / 2 - bounds.left;
  const y = (Math.min(...boxes.map(b => b.top)) + Math.max(...boxes.map(b => b.bottom))) / 2 - bounds.top;
  const full = { scaleX: 1, scaleY: 1, filter: 'blur(0px)' };
  const blob = { scaleX: .025, scaleY: .16, filter: 'blur(.20em)' };
  const tl = gsap.timeline();
  tl.call(() => root.classList.add('is-folding-title'), [], 0);
  tl.set(hero, { '--blob-x': (bounds.left + x) + 'px', '--blob-y': (bounds.top + y) + 'px', '--blob-opacity': 0 }, 0);
  tl.set(title, { transformOrigin: `${x}px ${y}px`, opacity: opening ? 0 : 1 }, 0);
  tl.fromTo(title, opening ? blob : full, {
    ...(opening ? full : blob), duration: SD.rise, ease: opening ? 'power2.out' : 'power2.inOut', immediateRender: false,
  }, 0);
  tl.to(title, { opacity: opening ? 1 : 0, duration: SD.rise * .2 }, opening ? 0 : SD.rise * .8);
  const glowIn = SD.rise * (opening ? 0 : .60);
  tl.to(hero, { '--blob-opacity': 1, duration: SD.rise * .16 }, glowIn);
  tl.to(hero, { '--blob-opacity': 0, duration: SD.rise * .20 }, glowIn + SD.rise * .20);
  tl.call(() => {
    (opening ? gooIn(words) : gooOut(words)).progress(1).kill();
    gsap.set(title, { clearProps: 'opacity,transform,transformOrigin,filter' });
    gsap.set(hero, { clearProps: '--blob-opacity,--blob-x,--blob-y' });
    root.classList.remove('is-folding-title');
  });
  return tl;
}

export function initHero(
  director: Director,
  navigate: (to: State) => unknown,
  getScene: (kind: 'hero' | 'about') => PointScene | undefined,
): void {
  const onHero = () => director.state.kind === 'hero' && !director.busy
    && !document.documentElement.classList.contains('is-intro');
  const openPortfolio = () => { if (onHero()) navigate({ kind: 'portfolio' }); };

  // Clicks and keyboard activation of the hint and header use their ordinary data-go links.
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && e.deltaY > 0 && e.deltaY > Math.abs(e.deltaX)) openPortfolio();
  }, { passive: true });

  let touch: { id: number; x: number; y: number } | null = null;
  window.addEventListener('touchstart', (e) => {
    const first = e.touches[0];
    touch = e.touches.length === 1 && onHero()
      ? { id: first.identifier, x: first.clientX, y: first.clientY } : null;
  }, { passive: true });
  window.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    const end = Array.from(e.changedTouches).find(t => t.identifier === touch?.id);
    if (touch && end) {
      const dy = touch.y - end.clientY;
      if (dy >= 36 && dy > Math.abs(touch.x - end.clientX)) openPortfolio();
    }
    touch = null;
  }, { passive: true });

  const brushInput = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  const endStroke = (clear: boolean) => {
    getScene('hero')?.endTrail(clear);
    getScene('about')?.endTrail(clear);
  };
  director.addEventListener('transitionstart', () => endStroke(true));
  brushInput.addEventListener('change', () => { if (!brushInput.matches) endStroke(true); });
  window.addEventListener('blur', () => endStroke(false));
  window.addEventListener('pointerout', e => { if (!e.relatedTarget) endStroke(false); });
  window.addEventListener('pointercancel', () => endStroke(false));
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !brushInput.matches || director.busy) return;
    const route = director.state.kind;
    const nx = e.clientX / innerWidth * 2 - 1, ny = 1 - e.clientY / innerHeight * 2;
    if (route === 'hero' || route === 'portfolio') getScene('hero')?.setPointer(nx, ny);
    if (route === 'hero' || route === 'about') getScene(route)?.paintTrail(nx, ny);
  }, { passive: true });
}
