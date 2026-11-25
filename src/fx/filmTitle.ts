import { VERT, DOWN, BLUR, CUT, SHOW } from './filmTitle.glsl';
import { renderPixelRatio, watchPixelRatio } from '../core/motion';

/** Reference `ho` config for big titles. Only the hero carries the glow (it is the only title over the photo). */
export const FILM_TITLE = { color: '#f1da75', liquid: .5, edge: 2, edgeAmount: .5, glow: .35, glowSize: 16, glowColor: '#f1da75' };

export type FilmTitles = {
  prepared: Promise<void>;
  setLiquid(el: Element, v: number): void;
  refresh(): void;
  dispose(): void;
  /** True once the overlay draws `el` (a `[data-goo]` inside / on a `.film-title`); goo routes liquid here then. */
  owns(el: Element): boolean;
  /** Test hook: per title, what the last frame actually drew (draw viewport converted back to CSS px). */
  debugRects?(): DebugTitle[];
};

type Box = { x: number; y: number; width: number; height: number };
/** `x..height`: the element rect the draw viewport corresponds to (viewport − padding − sub-pixel offset, ÷ dpr). */
export type DebugItem = Box & { clip: Box; liquid: number; rasters: number };
export type DebugTitle = { name: string; dpr: number; canvas: { width: number; height: number }; rasters: number; items: (DebugItem | null)[] };

const SELECTOR = '.film-title[data-goo], .film-title [data-goo]';
const exposeDrawState = import.meta.env.VITE_EXPOSE_APP === '1';
/** Field blur sigma at liquid 1, as a fraction of the font size. */
const BLUR_K = .11;
const DS = 2;

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
type Title = { el: HTMLElement; glow: number };
type Item = {
  el: HTMLElement;
  title: Title;
  color: [number, number, number];
  src: WebGLTexture | null;
  w: number; h: number;      // texture size (device px, even)
  rw: number; rh: number;    // element rect size at raster time (CSS px)
  fx: number; fy: number;    // sub-pixel offset baked into the raster
  dpr: number; fs: number; pad: number;
  dirty: boolean;
  font: string;
  computed?: CSSStyleDeclaration;
  clipping: HTMLElement[];
  preparedLiquid?: number;
  rasters?: number;
  drawn?: DebugItem | null;
  f0: Target | null; f1: Target | null; g0: Target | null; g1: Target | null;
};

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

let probe: CanvasRenderingContext2D | null = null;
/** Any CSS colour string → linear 0..1 sRGB triple (via a 1px 2D canvas, so color-mix()/color() work too). */
function cssRgb(c: string): [number, number, number] {
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe) return [1, 1, 1];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#fff';
  probe.fillStyle = c;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

function opacityChain(el: Element): number {
  let o = 1;
  for (let n: HTMLElement | null = el as HTMLElement; n && n !== document.documentElement; n = n.parentElement) {
    // GSAP writes every intermediate opacity inline. checkVisibility below handles
    // the hidden/zero endpoints supplied by the route and intro stylesheets.
    if (n.style.opacity) o *= Number(n.style.opacity);
    if (o <= 0) return 0;
  }
  return o;
}

export function initFilmTitles(): FilmTitles | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!ctx) return null;
  const gl: WebGL2RenderingContext = ctx;

  const shaders: WebGLShader[] = [];
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const compile = (fs: string): WebGLProgram => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      shaders.push(s);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    return p;
  };
  const P = { down: compile(DOWN), blur: compile(BLUR), cut: compile(CUT), show: compile(SHOW) };
  gl.flush();
  const locs = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  const u = (p: WebGLProgram, name: string) => locs.get(p)!.get(name)!;
  const vao = gl.createVertexArray();

  canvas.className = 'film-titles';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;z-index:50;pointer-events:none';
  canvas.hidden = true;
  const overlay = document.querySelector('.overlay');
  if (overlay) overlay.before(canvas);
  else document.body.append(canvas);

  const raster = document.createElement('canvas');
  const rctx = raster.getContext('2d')!;
  const glowRgb = hexRgb(FILM_TITLE.glowColor);
  const liquids = new WeakMap<Element, number>();
  let items: Item[] = [];
  let byEl = new Map<Element, Item>();
  let titles: Title[] = [];
  let ready = false;
  let disposed = false;
  let raf = 0;

  const newTex = (): WebGLTexture => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const target = (old: Target | null, w: number, h: number): Target => {
    if (old && old.w === w && old.h === h) return old;
    freeTarget(old);
    const tex = newTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  };
  function freeTarget(t: Target | null): void {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  }
  const freeItem = (it: Item): void => {
    if (it.src) gl.deleteTexture(it.src);
    [it.f0, it.f1, it.g0, it.g1].forEach(freeTarget);
    it.src = it.f0 = it.f1 = it.g0 = it.g1 = null;
  };

  /** Draws the element's glyphs letter by letter at their DOM positions (white on transparent) and uploads them. */
  function rasterise(it: Item, r: DOMRect, dpr: number): void {
    const fs = it.fs;
    const pad = Math.ceil(fs * .6);
    const ox = (r.left - pad) * dpr;
    const oy = (r.top - pad) * dpr;
    const fx = ox - Math.floor(ox);
    const fy = oy - Math.floor(oy);
    const even = (n: number): number => Math.ceil(n / 2) * 2;
    const w = even((r.width + 2 * pad) * dpr + fx);
    const h = even((r.height + 2 * pad) * dpr + fy);
    raster.width = w;
    raster.height = h;
    rctx.setTransform(dpr, 0, 0, dpr, fx, fy);
    rctx.clearRect(0, 0, w, h);
    rctx.fillStyle = '#fff';
    rctx.font = it.font;
    rctx.textBaseline = 'alphabetic';
    const range = document.createRange();
    const walker = document.createTreeWalker(it.el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? '';
      for (let i = 0; i < text.length; ) {
        const len = (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
        const ch = text.slice(i, i + len);
        if (ch.trim()) {
          range.setStart(node, i);
          range.setEnd(node, i + len);
          const rr = range.getClientRects()[0];
          if (rr) {
            const m = rctx.measureText(ch);
            const asc = m.fontBoundingBoxAscent;
            const y = rr.top + (rr.height - (asc + m.fontBoundingBoxDescent)) / 2 + asc;
            rctx.fillText(ch, rr.left - r.left + pad, y - r.top + pad);
          }
        }
        i += len;
      }
    }
    range.detach();
    it.src ??= newTex();
    gl.bindTexture(gl.TEXTURE_2D, it.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, raster);
    const fw = w / DS;
    const fh = h / DS;
    it.f0 = target(it.f0, fw, fh);
    it.f1 = target(it.f1, fw, fh);
    if (it.title.glow > 0) {
      it.g0 = target(it.g0, fw, fh);
      it.g1 = target(it.g1, fw, fh);
    }
    Object.assign(it, { w, h, rw: r.width, rh: r.height, fx, fy, dpr, fs, pad, dirty: false });
    it.preparedLiquid = undefined;
    if (exposeDrawState) it.rasters = (it.rasters ?? 0) + 1;
  }

  const pass = (prog: WebGLProgram, to: Target | null, tex: WebGLTexture): void => {
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fbo : null);
    if (to) gl.viewport(0, 0, to.w, to.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u(prog, 'uTex'), 0);
  };
  const blur = (a: Target, b: Target, sigma: number): void => {
    pass(P.blur, b, a.tex);
    gl.uniform2f(u(P.blur, 'uDir'), 1 / a.w, 0);
    gl.uniform1f(u(P.blur, 'uSigma'), sigma);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    pass(P.blur, a, b.tex);
    gl.uniform2f(u(P.blur, 'uDir'), 0, 1 / a.h);
    gl.uniform1f(u(P.blur, 'uSigma'), sigma);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const cutUniforms = (prog: WebGLProgram, liquid: number): void => {
    gl.uniform1f(u(prog, 'uLiquid'), liquid);
    gl.uniform1f(u(prog, 'uEdge'), FILM_TITLE.edge);
    gl.uniform1f(u(prog, 'uEdgeAmount'), FILM_TITLE.edgeAmount);
  };

  /** Visible part of `el`: the viewport intersected with the padding box of every clipping ancestor (CSS px). */
  function clipOf(ancestors: HTMLElement[], vw: number, vh: number): Box {
    let l = 0, t = 0, rgt = vw, b = vh;
    for (const n of ancestors) {
      const br = n.getBoundingClientRect();
      const x = br.left + n.clientLeft;
      const y = br.top + n.clientTop;
      l = Math.max(l, x);
      t = Math.max(t, y);
      rgt = Math.min(rgt, x + n.clientWidth);
      b = Math.min(b, y + n.clientHeight);
    }
    return { x: l, y: t, width: Math.max(0, rgt - l), height: Math.max(0, b - t) };
  }

  function drawItem(it: Item, r: DOMRect, opacity: number, bottom: number, clip: Box): void {
    const liquid = liquids.get(it.el) ?? 0;
    const f0 = it.f0!, f1 = it.f1!;
    const glow = it.title.glow > 0 && it.g0 && it.g1;
    if (liquid !== it.preparedLiquid) {
      gl.disable(gl.BLEND);
      pass(P.down, f0, it.src!);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const sigma = liquid * it.fs * BLUR_K * it.dpr / DS;
      if (sigma > .05) blur(f0, f1, sigma);
      if (glow) {
        pass(P.cut, it.g0, f0.tex);
        cutUniforms(P.cut, liquid);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        blur(it.g0!, it.g1!, FILM_TITLE.glowSize / 2 * it.dpr / DS);
      }
      it.preparedLiquid = liquid;
    }
    const ix = Math.round((r.left - it.pad) * it.dpr - it.fx);
    const iy = Math.round((r.top - it.pad) * it.dpr - it.fy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(ix, bottom - iy - it.h, it.w, it.h);
    const d = it.dpr;
    const sx = Math.floor(clip.x * d);
    const sy = Math.floor(clip.y * d);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(sx, bottom - Math.ceil((clip.y + clip.height) * d), Math.ceil((clip.x + clip.width) * d) - sx, Math.ceil((clip.y + clip.height) * d) - sy);
    gl.useProgram(P.show);
    const S = P.show;
    const bind = (unit: number, name: string, tex: WebGLTexture): void => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u(S, name), unit);
    };
    bind(0, 'uSrc', it.src!);
    bind(1, 'uField', f0.tex);
    bind(2, 'uGlow', glow ? it.g0!.tex : f0.tex);
    gl.uniform3fv(u(S, 'uColor'), it.color);
    gl.uniform3fv(u(S, 'uGlowColor'), glowRgb);
    gl.uniform1f(u(S, 'uGlowAlpha'), glow ? it.title.glow : 0);
    gl.uniform1f(u(S, 'uOpacity'), opacity);
    cutUniforms(S, liquid);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    if (exposeDrawState) it.drawn = {
      x: (ix + it.fx) / d + it.pad, y: (iy + it.fy) / d + it.pad, width: it.rw, height: it.rh,
      clip, liquid, rasters: it.rasters ?? 0,
    };
  }

  function render(): void {
    raf = 0;
    if (!ready || disposed || document.documentElement.classList.contains('is-folding-title')) return;
    const dpr = renderPixelRatio();
    const vw = window.innerWidth, vh = window.innerHeight;
    const visibleWords: { it: Item; r: DOMRect; clip: Box; opacity: number }[] = [];
    let firstY = vh, lastY = 0;
    for (const it of items) {
      if (exposeDrawState) it.drawn = null;
      if (!it.el.isConnected) continue;
      const visible = it.el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })
        ?? (it.computed?.visibility === 'visible' && it.computed.opacity !== '0');
      if (!visible) continue;
      const r = it.el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const clip = clipOf(it.clipping, vw, vh);
      // Skip when nothing of the padded quad can land inside the clip.
      const pad = r.height;
      if (clip.width <= 0 || clip.height <= 0 || r.right + pad < clip.x || r.left - pad > clip.x + clip.width
        || r.bottom + pad < clip.y || r.top - pad > clip.y + clip.height) continue;
      const opacity = opacityChain(it.el);
      if (opacity <= .001) continue;
      visibleWords.push({ it, r, clip, opacity });
      firstY = Math.min(firstY, Math.max(clip.y, r.top - pad));
      lastY = Math.max(lastY, Math.min(clip.y + clip.height, r.bottom + pad));
    }
    if (!visibleWords.length) {
      canvas.hidden = true;
      return;
    }
    // The compositor blends only the band containing the title and its glow.
    // Keep viewport and scissor coordinates in physical pixels to retain glyph alignment.
    const top = Math.floor(firstY * dpr), bottom = Math.ceil(lastY * dpr);
    const cw = Math.round(vw * dpr), ch = Math.max(1, bottom - top);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    canvas.style.top = top / dpr + 'px';
    canvas.style.height = ch / dpr + 'px';
    canvas.hidden = false;
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const { it, r, clip, opacity } of visibleWords) {
      const settled = (liquids.get(it.el) ?? 0) < .001;
      const frac = (v: number): number => v - Math.floor(v);
      const moved = settled && (Math.abs(frac((r.left - it.pad) * dpr) - it.fx) > .02 || Math.abs(frac((r.top - it.pad) * dpr) - it.fy) > .02);
      if (it.dirty || !it.src || it.dpr !== dpr || Math.abs(r.width - it.rw) > .5 || Math.abs(r.height - it.rh) > .5 || moved) {
        rasterise(it, r, dpr);
      }
      drawItem(it, r, opacity, bottom, clip);
    }
  }

  const schedule = (): void => {
    if (!raf && ready && !disposed) raf = requestAnimationFrame(render);
  };

  /** Re-collects titles, re-reads their colours (with the DOM colour restored), hides the DOM ink, re-rasterises. */
  function refresh(): void {
    if (!ready || disposed) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    const old = byEl;
    byEl = new Map();
    const titleOf = new Map<Element, Title>();
    items = els.map((el) => {
      const tEl = (el.matches('.film-title') ? el : el.closest('.film-title')) as HTMLElement;
      let title = titleOf.get(tEl);
      if (!title) {
        title = { el: tEl, glow: tEl.matches('.hero__title') ? FILM_TITLE.glow : 0 };
        titleOf.set(tEl, title);
        tEl.style.color = '';
        tEl.style.textShadow = '';
      }
      el.style.color = '';
      const prev = old.get(el);
      const it: Item = prev ?? {
        el, title, color: [1, 1, 1], src: null, w: 0, h: 0, rw: 0, rh: 0, fx: 0, fy: 0, dpr: 0, fs: 16, pad: 0,
        dirty: true, font: '', clipping: [], f0: null, f1: null, g0: null, g1: null,
      };
      it.title = title;
      it.dirty = true;
      byEl.set(el, it);
      return it;
    });
    for (const [el, it] of old) if (!byEl.has(el)) freeItem(it);
    // Read colours only after every inline override is cleared, then hide the DOM ink (still selectable).
    for (const it of items) {
      const style = getComputedStyle(it.el);
      it.computed = style;
      it.color = it.title.glow > 0 ? hexRgb(FILM_TITLE.color) : cssRgb(style.color);
      it.fs = parseFloat(style.fontSize) || 16;
      it.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      it.clipping = [];
      for (let n = it.el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ancestor = getComputedStyle(n);
        if (ancestor.overflowX !== 'visible' || ancestor.overflowY !== 'visible') it.clipping.push(n);
      }
    }
    titles = Array.from(titleOf.values());
    for (const t of titles) {
      t.el.style.color = 'transparent';
      t.el.style.textShadow = 'none';
    }
    for (const it of items) it.el.style.color = 'transparent';
    document.documentElement.classList.add('has-film-titles');
    observe();
    schedule();
  }

  // Batches refreshes to one per frame (resize drags, palette swaps).
  let refreshRaf = 0;
  const queueRefresh = (): void => {
    if (!refreshRaf && !disposed) refreshRaf = requestAnimationFrame(() => { refreshRaf = 0; refresh(); });
  };
  // Route changes and intro completion affect inherited visibility.
  const rootMo = new MutationObserver(schedule);
  rootMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-state', 'class'] });
  const mo = new MutationObserver(schedule);
  function observe(): void {
    mo.disconnect();
    for (const sel of ['.hero', '.preloader']) {
      const n = document.querySelector(sel);
      if (n) mo.observe(n, { subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    }
  }
  const onResize = queueRefresh;
  const unwatchPixelRatio = watchPixelRatio(schedule);
  // No preventDefault: we don't restore; the SVG goo path takes over.
  const onLost = (): void => api.dispose();
  window.addEventListener('resize', onResize);
  canvas.addEventListener('webglcontextlost', onLost);

  async function prepare(): Promise<void> {
    // COMPLETION_STATUS_KHR is non-blocking. Query the link status and uniform
    // locations only once, after linking has finished, before taking over the DOM ink.
    await document.fonts.ready;
    const programs = Object.values(P);
    while (!disposed && parallel && !programs.every(p => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    if (disposed) return;
    if (programs.some(p => !gl.getProgramParameter(p, gl.LINK_STATUS))) {
      api.dispose();
      return;
    }
    const uniforms = [
      [P.down, ['uTex']], [P.blur, ['uTex', 'uDir', 'uSigma']],
      [P.cut, ['uTex', 'uLiquid', 'uEdge', 'uEdgeAmount']],
      [P.show, ['uSrc', 'uField', 'uGlow', 'uColor', 'uGlowColor', 'uGlowAlpha', 'uOpacity', 'uLiquid', 'uEdge', 'uEdgeAmount']],
    ] as const;
    for (const [program, names] of uniforms) {
      locs.set(program, new Map(names.map(name => [name, gl.getUniformLocation(program, name)])));
    }
    ready = true;
    refresh();
  }

  const api: FilmTitles = {
    prepared: prepare(),
    setLiquid(el, v) {
      liquids.set(el, Math.max(0, Math.min(1, v)));
      schedule();
    },
    refresh,
    owns: (el) => ready && !disposed && byEl.has(el),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(refreshRaf);
      mo.disconnect();
      rootMo.disconnect();
      window.removeEventListener('resize', onResize);
      unwatchPixelRatio();
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const t of titles) {
        t.el.style.color = '';
        t.el.style.textShadow = '';
      }
      const live = !gl.isContextLost();
      for (const it of items) {
        it.el.style.color = '';
        if (live) freeItem(it);
      }
      if (live) {
        Object.values(P).forEach((p) => gl.deleteProgram(p));
        shaders.forEach((sh) => gl.deleteShader(sh));
        gl.deleteVertexArray(vao);
      }
      items = [];
      byEl = new Map();
      titles = [];
      document.documentElement.classList.remove('has-film-titles');
      canvas.remove();
    },
  };
  if (exposeDrawState) {
    api.debugRects = () =>
      titles.map((t) => {
        const own = items.filter((i) => i.title === t);
        return {
          name: t.el.classList[0] ?? '',
          dpr: renderPixelRatio(),
          canvas: { width: canvas.width, height: canvas.height },
          rasters: own.reduce((n, i) => n + (i.rasters ?? 0), 0),
          items: own.map((i) => i.drawn ? { ...i.drawn, clip: { ...i.drawn.clip }, liquid: liquids.get(i.el) ?? 0 } : null),
        };
      });
  }

  return api;
}
