import { isReduced } from '../core/motion';
import { LOAD_TIMEOUT } from '../core/timings';
import type { LiquidFrameRequest, LiquidFrameResponse } from './liquidFrames.worker';
import './gooRaster.css';

const frameCount = 15;
const targets = '.contacts__liquid, .case__title';
type Raster = {
  key: string; text: string; width: number; height: number; dpr: number;
  clip: HTMLSpanElement; strip: HTMLCanvasElement; cell: number; frame: number;
};
const ready = new WeakMap<Element, Raster>(), selected = new Map<Element, Raster>();
let resizing: ResizeObserver | undefined;
const ratio = () => Math.min(devicePixelRatio || 1, 1.25);
function ink(s: CSSStyleDeclaration) {
  const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  return { font, key: [font, s.letterSpacing, s.lineHeight, s.color, s.paddingLeft, s.paddingRight].join('|') };
}

/** A sibling measurement rack makes the native baseline available even for hidden case entries. */
function sources() {
  const rack = document.createElement('div');
  rack.inert = true;
  rack.style.cssText = 'position:fixed;inset:0 auto auto 0;visibility:hidden;contain:layout style paint;pointer-events:none';
  const dpr = ratio();
  const runs = Array.from(document.querySelectorAll<HTMLElement>(targets), el => {
    const css = getComputedStyle(el), { font, key } = ink(css);
    const text = el.textContent || '', probe = document.createElement('div'), baseline = document.createElement('i');
    Object.assign(probe.style, { width:'max-content', whiteSpace:'pre', font, lineHeight:css.lineHeight,
      letterSpacing:css.letterSpacing, paddingLeft:css.paddingLeft, paddingRight:css.paddingRight });
    baseline.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    probe.append(text, baseline); rack.append(probe);
    return { el, text, key, font, css, fs:parseFloat(css.fontSize), color:css.color, probe, baseline };
  });
  document.body.append(rack);
  try {
    return runs.flatMap((run, id) => {
      const { el, probe, baseline, text, key, font, css, fs, color } = run;
      const box = probe.getBoundingClientRect();
      const pad = Math.ceil(fs * .12) + 1;
      const w = Math.ceil((box.width + 2 * pad) * dpr), h = Math.ceil((box.height + 2 * pad) * dpr);
      if (!text || !box.width || !box.height || w * h * frameCount > 2_000_000) return [];
      const source = document.createElement('canvas');
      source.width = w; source.height = h;
      const cx = source.getContext('2d', { willReadFrequently:true });
      if (!cx || !('letterSpacing' in cx)) return [];
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.font = font; cx.letterSpacing = css.letterSpacing; cx.fillStyle = color;
      cx.fillText(text, pad + parseFloat(css.paddingLeft), pad + baseline.getBoundingClientRect().top - box.top);
      const request: LiquidFrameRequest = { id, source:cx.getImageData(0, 0, w, h), fontSize:fs * dpr, frames:frameCount };
      return [{ el, text, key, dpr, width:box.width, height:box.height, pad, request }];
    });
  } finally { rack.remove(); }
}

/** A failed, unavailable or interrupted worker leaves all outstanding labels using the native SVG. */
export async function prepareGooRasters(lifetime: AbortSignal): Promise<void> {
  if (isReduced() || typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || !CSS.supports('-webkit-text-fill-color','transparent')) return;
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(LOAD_TIMEOUT * 1000)]);
  await new Promise<void>(resolve => {
    const finish = () => { signal.removeEventListener('abort', finish); resolve(); };
    if (signal.aborted) return finish();
    signal.addEventListener('abort', finish, { once:true });
    void document.fonts.ready.then(finish, finish);
  });
  if (signal.aborted) return;
  const runs = sources();
  if (!runs.length) return;
  const worker = new Worker(new URL('./liquidFrames.worker.ts', import.meta.url), { type:'module' });
  try {
    await new Promise<void>(resolve => {
      let pending = runs.length;
      const finish = () => { signal.removeEventListener('abort', finish); resolve(); };
      signal.addEventListener('abort', finish, { once:true });
      worker.onerror = finish;
      worker.onmessageerror = finish;
      worker.onmessage = ({ data }: MessageEvent<LiquidFrameResponse>) => {
        const run = runs.find(item => item.request.id === data.id);
        if ('atlas' in data) {
          const atlas = data.atlas;
          try {
            if (run && !signal.aborted) {
              const clip = document.createElement('span'), strip = document.createElement('canvas');
              const h = atlas.height / frameCount, cell = h / run.dpr;
              strip.width = atlas.width; strip.height = atlas.height;
              const context = strip.getContext('bitmaprenderer');
              if (context) {
                strip.style.width = `${atlas.width / run.dpr}px`;
                strip.style.height = `${cell * frameCount}px`;
                clip.style.cssText = `left:${-run.pad}px;top:${-run.pad}px;width:${atlas.width / run.dpr}px;height:${cell}px`;
                clip.setAttribute('aria-hidden','true'); clip.className = 'goo-raster'; clip.append(strip);
                context.transferFromImageBitmap(atlas);
                const { text, key, dpr, width, height } = run;
                ready.set(run.el, { text, key, dpr, width, height, cell, strip, clip, frame:-1 });
                run.el.dataset.gooAtlas = '';
              }
            }
          } finally { atlas.close(); }
        }
        if (--pending === 0) finish();
      };
      for (const { request } of runs) worker.postMessage(request, [request.source.data.buffer]);
    });
  } finally { worker.terminate(); }
}

/** Validate once for the tween. Clamped or wrapped headings and changed fonts use their SVG. */
export function selectGooRaster(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  const r = ready.get(el);
  if (!r || ratio() !== r.dpr || r.text !== el.textContent || ink(style).key !== r.key) {
    clearGooRaster(el);
    return false;
  }
  const box = el.getBoundingClientRect();
  if (Math.abs(box.height-r.height) > 1 || Math.abs(box.width-r.width) > 1) {
    clearGooRaster(el);
    return false;
  }
  if (selected.get(el) === r) return true; // Preserve the live mask when a reveal reverses.
  selected.set(el, r);
  resizing ??= new ResizeObserver(changes => {
    for (const { target } of changes) {
      const raster = selected.get(target);
      if (!raster) continue;
      const current = target.getBoundingClientRect();
      if (Math.abs(current.width-raster.width) > 1 || Math.abs(current.height-raster.height) > 1) clearGooRaster(target);
    }
  });
  resizing.observe(el);
  return true;
}

export function clearGooRaster(el: Element) {
  const r = selected.get(el);
  if (!r) return;
  r.clip.remove(); el.removeAttribute('data-raster-goo');
  resizing?.unobserve(el);
  selected.delete(el);
}

/** Only the small compositor sprite advances. Native selectable ink owns the resting frame. */
export function drawGooRaster(el: Element, liquid: number): boolean {
  const r = selected.get(el);
  if (!r) return false;
  if (r.text !== el.textContent || r.dpr !== ratio()) { clearGooRaster(el); return false; }
  if (liquid <= .0001 || el.classList.contains('is-moving')) {
    r.clip.remove(); el.removeAttribute('data-raster-goo'); return true;
  }
  if (!r.clip.parentElement) { el.append(r.clip); el.setAttribute('data-raster-goo',''); }
  const frame = Math.min(frameCount - 1, Math.round(liquid * (frameCount - 1)));
  if (r.frame !== frame) {
    r.frame = frame;
    r.strip.style.transform = `translateY(${-frame * r.cell}px)`;
  }
  return true;
}
