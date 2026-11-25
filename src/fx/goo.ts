import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { SD, GOO_EASE, MOVE_SETTLE } from '../core/timings';
import { isReduced } from '../core/motion';
import { clearGooRaster, drawGooRaster, selectGooRaster } from './gooRaster';
import { gooParams } from './gooMath';
export { gooParams } from './gooMath';

gsap.registerPlugin(CustomEase);
CustomEase.create('gooOut', GOO_EASE);

const NS = 'http://www.w3.org/2000/svg';

type State = {
  id: string;
  filter: SVGFilterElement;
  tweens: gsap.core.Animation[];
  active: boolean;
  fs: number;
  blurEl: SVGFEGaussianBlurElement;
  transfer: SVGFEColorMatrixElement | SVGFEFuncAElement;
  liquid: number;
  blur: string;
  matrix: string;
};

const states = new WeakMap<Element, State>();
const plainFades = new WeakMap<Element, gsap.core.Tween>();
let host: SVGSVGElement | null = null;
let counter = 0;

function hostSvg(): SVGSVGElement {
  if (host && host.isConnected) return host;
  host = document.createElementNS(NS, 'svg');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.prepend(host);
  return host;
}

function stateOf(el: Element): State {
  let s = states.get(el);
  if (s) return s;
  const id = `goo-${++counter}`;
  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const blurEl = document.createElementNS(NS, 'feGaussianBlur');
  blurEl.setAttribute('in', 'SourceGraphic');
  blurEl.setAttribute('stdDeviation', '0');
  filter.append(blurEl);
  let transfer: State['transfer'];
  if (el.matches('.contacts__liquid, .case__title')) {
    // Only alpha changes. A linear transfer keeps the browser's lookup-table
    // pipeline stable when the intercept crosses zero during the link reveal.
    const component = document.createElementNS(NS, 'feComponentTransfer');
    transfer = document.createElementNS(NS, 'feFuncA');
    transfer.setAttribute('type', 'linear');
    component.append(transfer);
    filter.append(component);
  } else {
    transfer = document.createElementNS(NS, 'feColorMatrix');
    transfer.setAttribute('type', 'matrix');
    filter.append(transfer);
  }
  s = { id, filter, tweens: [], active: false, fs: 16, blurEl, transfer, liquid: 0, blur: '', matrix: '' };
  states.set(el, s);
  return s;
}

/** Receives the live liquid value for elements it owns instead of the SVG filter (the WebGL film titles). */
export type LiquidSink = { owns(el: Element): boolean; setLiquid(el: Element, v: number): void };
let sink: LiquidSink | null = null;

/** Routes liquid for owned elements to `s` (null restores the SVG path for everything). */
export function setLiquidSink(s: LiquidSink | null): void {
  sink = s;
}

function apply(el: Element, liquid: number): void {
  const s = stateOf(el);
  if (sink?.owns(el)) {
    s.liquid = liquid <= 0.0001 ? 0 : liquid;
    const style = (el as HTMLElement).style;
    if (style.filter) style.filter = '';
    sink.setLiquid(el, s.liquid);
    return;
  }
  s.liquid = liquid;
  const style = (el as HTMLElement).style;
  if (drawGooRaster(el, liquid)) {
    if (style.filter) style.filter = '';
    return;
  }
  if (liquid <= 0.0001) {
    s.liquid = 0;
    if (style.filter) style.filter = '';
    return;
  }
  const { blur, amp, off } = gooParams(liquid, s.fs);
  if (!s.filter.isConnected) hostSvg().append(s.filter);
  const b = blur.toFixed(3);
  if (b !== s.blur) {
    s.blur = b;
    s.blurEl.setAttribute('stdDeviation', b);
  }
  const slope = amp.toFixed(3), intercept = off.toFixed(3);
  const curve = `${slope} ${intercept}`;
  if (curve !== s.matrix) {
    s.matrix = curve;
    if (s.transfer.localName === 'feFuncA') {
      s.transfer.setAttribute('slope', slope);
      s.transfer.setAttribute('intercept', intercept);
    } else {
      s.transfer.setAttribute('values', `1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${curve}`);
    }
  }
  if (!(el as HTMLElement).classList.contains('is-moving')) {
    const f = `url(#${s.id})`;
    if (style.filter !== f) style.filter = f;
  }
}

const list = (t: Element | Element[]): Element[] => (Array.isArray(t) ? t : [t]);

function begin(el: Element): State {
  plainFades.get(el)?.kill();
  plainFades.delete(el);
  const s = stateOf(el);
  s.tweens.forEach((t) => t.kill());
  s.tweens = [];
  const style = getComputedStyle(el);
  s.fs = parseFloat(style.fontSize) || 16;
  if (!sink?.owns(el)) {
    const target = el as HTMLElement;
    // Three Gaussian sigmas contain the visible edge at maximum liquid. Allocate
    // that padding around the glyph box rather than a percentage of a long headline.
    const pad = Math.ceil(s.fs * .12) + 1;
    const x = 100 * pad / Math.max(target.offsetWidth, 1);
    const y = 100 * pad / Math.max(target.offsetHeight, 1);
    s.filter.setAttribute('x', `-${x}%`);
    s.filter.setAttribute('y', `-${y}%`);
    s.filter.setAttribute('width', `${100 + 2*x}%`);
    s.filter.setAttribute('height', `${100 + 2*y}%`);
    selectGooRaster(target, style);
  }
  return s;
}

/** Keep interrupted opacity reveals continuous without creating SVG or liquid effects. */
function opacityOnly(targets: Element | Element[], visible: boolean, delay: number): gsap.core.Timeline {
  const timeline = gsap.timeline();
  for (const el of list(targets)) {
    const continuing = plainFades.has(el) || states.get(el)?.active;
    releaseGoo(el);
    if (sink?.owns(el)) sink.setLiquid(el, 0);
    gsap.set(el, { clearProps: 'transform,filter' });
    if (visible && !continuing) gsap.set(el, { opacity: 0 });
    el.classList.remove('is-in');
    const tween = gsap.to(el, {
      opacity: visible ? 1 : 0, duration: SD.out,
      onComplete: () => {
        el.classList.toggle('is-in', visible);
        plainFades.delete(el);
      },
    });
    plainFades.set(el, tween);
    timeline.add(tween, delay);
  }
  return timeline;
}

export function gooIn(
  targets: Element | Element[],
  opts: { delay?: number; stagger?: number; duration?: number } = {},
): gsap.core.Timeline {
  const { delay = 0, stagger = SD.stagger, duration = SD.in } = opts;
  if (isReduced()) return opacityOnly(targets, true, delay);
  const tl = gsap.timeline();
  list(targets).forEach((el, i) => {
    const at = delay + i * stagger;
    const s = begin(el);
    // Fresh start: hide immediately (no flash before the stagger slot). Interrupt: continue from live values.
    if (!s.active) {
      gsap.set(el, { opacity: 0, y: `${SD.rise}em` });
      apply(el, 1);
    }
    s.active = true;
    el.classList.remove('is-in');
    const p = { l: s.liquid };
    s.tweens.push(
      tl.to(p, { l: 0, duration, ease: 'gooOut', onUpdate: () => apply(el, p.l) }, at),
      tl.to(el, { opacity: 1, y: '0em', duration, ease: 'gooOut' }, at),
      tl.call(
        () => {
          apply(el, 0);
          clearGooRaster(el);
          gsap.set(el, { clearProps: 'transform' });
          el.classList.add('is-in');
          s.active = false;
        },
        undefined,
        at + duration,
      ),
    );
  });
  return tl;
}

export function gooOut(
  targets: Element | Element[],
  opts: { delay?: number; stagger?: number } = {},
): gsap.core.Timeline {
  const { delay = 0, stagger = 0 } = opts;
  if (isReduced()) return opacityOnly(targets, false, delay);
  const tl = gsap.timeline();
  list(targets).forEach((el, i) => {
    const at = delay + i * stagger;
    const s = begin(el);
    s.active = true;
    el.classList.remove('is-in');
    const p = { l: s.liquid };
    s.tweens.push(
      tl.to(p, { l: 1, duration: SD.out, ease: 'power2.in', onUpdate: () => apply(el, p.l) }, at),
      tl.to(el, { opacity: 0, duration: SD.out, ease: 'power2.in' }, at),
      tl.call(() => { s.active = false; clearGooRaster(el); }, undefined, at + SD.out),
    );
  });
  return tl;
}

/** Kills the element's tweens and removes its filter node and state. */
export function releaseGoo(el: Element): void {
  clearGooRaster(el);
  plainFades.get(el)?.kill();
  plainFades.delete(el);
  const s = states.get(el);
  if (!s) return;
  s.tweens.forEach((t) => t.kill());
  s.filter.remove();
  states.delete(el);
  (el as HTMLElement).style.filter = '';
}

const moving = new WeakMap<Element, { elements: HTMLElement[]; timer: number }>();

/** Removes goo filters from [data-goo] children until 120 ms after the last call. */
export function markMoving(container: Element): void {
  if (isReduced()) return;
  let state = moving.get(container);
  if (!state) {
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-goo]'));
    if (container.matches('[data-goo]')) elements.push(container as HTMLElement);
    state = { elements: elements.filter(el => !sink?.owns(el)), timer: 0 };
    moving.set(container, state);
    for (const el of state.elements) {
      el.classList.add('is-moving');
      el.style.filter = '';
      drawGooRaster(el, 0);
    }
  }
  clearTimeout(state.timer);
  state.timer = window.setTimeout(() => {
    moving.delete(container);
    for (const el of state.elements) {
      el.classList.remove('is-moving');
      const s = states.get(el);
      if (s && s.liquid > 0 && !sink?.owns(el)) apply(el, s.liquid);
    }
  }, MOVE_SETTLE * 1000);
}
