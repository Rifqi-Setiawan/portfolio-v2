import {
  PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import { hasWebGL2, renderPixelRatio, watchPixelRatio } from '../core/motion';
import { createPost, type Post } from './post';
import { AdaptiveQuality, displayInterval } from './quality';
import { createPreparation } from './preparation';

export type Layer = {
  update(dt: number, t: number): boolean; // true while it still needs frames
  /** Screen-space geometry drawn on the same canvas after the photographic post pass. */
  renderOverlay?(renderer: WebGLRenderer): void;
};

export type Stage = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  post: Post;
  preparation: ReturnType<typeof createPreparation>;
  readonly signal: AbortSignal;
  readonly contextLost: boolean;
  add(l: Layer): void;
  remove(l: Layer): void;
  requestRender(): void;
  requestOverlay(): void;
  startQualityMeasurement(): void;
  readonly qualityTier: number;
  dispose(): void;
  /** Frames rendered so far (debug / tests: verifies render-on-demand idles). */
  readonly frames: number;
};

/** Render-on-demand rAF loop. Idles when tick returns false; paused while the document is hidden. */
export function createLoop(
  tick: (dt: number, t: number) => boolean,
  raf: typeof requestAnimationFrame = (cb) => requestAnimationFrame(cb),
): { kick(): void; stop(): void } {
  let handle = 0;
  let scheduled = false;
  let wanted = false;
  let last = -1;
  let stopped = false;

  const schedule = () => {
    if (scheduled || stopped || document.hidden) return;
    scheduled = true;
    handle = raf(frame);
  };
  const frame = (ts: number) => {
    scheduled = false;
    if (stopped) return;
    const dt = last < 0 ? 0 : Math.min((ts - last) / 1000, 0.1);
    last = ts;
    try {
      wanted = tick(dt, ts / 1000);
    } catch (e) {
      console.error('[stage] tick failed', e);
      wanted = false;
    }
    if (wanted) schedule();
    else last = -1;
  };
  const onVis = () => {
    if (!document.hidden && wanted) {
      last = -1;
      schedule();
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    kick() {
      wanted = true;
      schedule();
    },
    stop() {
      stopped = true;
      wanted = false;
      if (scheduled && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
      scheduled = false;
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}

export function createStage(host: HTMLElement): Stage | null {
  if (!hasWebGL2()) return null;

  let renderer: WebGLRenderer;
  try {
    // The full-screen photograph has no silhouette. The points and card edges
    // handle their own coverage, so the entire display buffer needn't be multisampled.
    renderer = new WebGLRenderer({ antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x252525, 1);
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  function primeUnpackState() {
    // Three preserves these values around texture copies. Seed its state cache so the
    // first scheduled upload never needs a synchronous query to the GPU process.
    const gl = renderer.getContext() as WebGL2RenderingContext;
    for (const key of [gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES]) {
      renderer.state.pixelStorei(key, 0);
    }
  }
  primeUnpackState();
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(10, 1, 0.1, 1000);
  const post = createPost();
  const layers = new Set<Layer>();
  const lifetime = new AbortController();
  const refresh = displayInterval(lifetime.signal);
  let quality: AdaptiveQuality | undefined;
  let contextLost = false;
  let frames = 0;
  let roomDirty = true;
  let roomMoving = false;
  let width = 0, height = 0, pixelRatio = 0;
  const requestRender = () => { roomDirty = true; loop.kick(); };

  const resize = () => {
    const w = Math.max(1, host.clientWidth || window.innerWidth);
    const h = Math.max(1, host.clientHeight || window.innerHeight);
    const dpr = renderPixelRatio();
    const applied = quality?.tier ? Math.min(1, dpr) : dpr;
    if (w === width && h === height && applied === pixelRatio) return;
    width = w; height = h; pixelRatio = applied;
    renderer.setDrawingBufferSize(w, h, applied);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h, renderer.getPixelRatio());
    requestRender();
  };

  const loop = createLoop((dt, t) => {
    if (!contextLost) quality?.frame(t * 1000, dt > 0);
    let more = false;
    // A layer that just finished moving still needs to paint its final resting pose.
    const updateScene = roomDirty || roomMoving;
    roomMoving = roomDirty = false;
    for (const layer of layers) {
      if (!layer.update(dt, t)) continue;
      more = true;
      if (!layer.renderOverlay) roomMoving = true;
    }
    // Keep carousel hit targets and DOM thumbnails moving while the GPU is unavailable.
    if (contextLost) return more;
    if (post.bypassed()) {
      renderer.render(scene, camera);
      roomDirty = true; // The next post frame needs a fresh texture.
    } else {
      post.render(renderer, scene, camera, t, updateScene || roomMoving || roomDirty);
    }
    for (const layer of layers) layer.renderOverlay?.(renderer);
    if (host.classList.contains('stage--lost')) host.classList.remove('stage--lost');
    frames++;
    return more;
  });

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    host.classList.add('stage--lost');
  }, { signal: lifetime.signal });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    primeUnpackState();
    // Three has rebuilt its GL objects. A settled route otherwise waits for pointer input.
    renderer.setClearColor(0x252525, 1);
    requestRender();
  }, { signal: lifetime.signal });

  const ro = new ResizeObserver(resize);
  const unwatchPixelRatio = watchPixelRatio(resize);
  ro.observe(host);
  resize();

  return {
    renderer,
    scene,
    camera,
    post,
    preparation: createPreparation(lifetime.signal),
    signal: lifetime.signal,
    get contextLost() { return contextLost; },
    add: (l) => {
      layers.add(l);
      requestRender();
    },
    remove: (l) => {
      layers.delete(l);
      requestRender();
    },
    requestRender,
    requestOverlay: () => loop.kick(),
    startQualityMeasurement() {
      void refresh.then(displayMs => {
        if (quality || lifetime.signal.aborted) return;
        quality = new AdaptiveQuality(displayMs, tier => {
          if (tier === 1) resize();
        }, (tier, refreshMs, p90Ms) => {
          const detail = { tier, displayMs: refreshMs, p90Ms, stageDpr: renderer.getPixelRatio() };
          performance.mark('stage:quality', { detail });
          if (import.meta.env.VITE_EXPOSE_APP === '1') console.info('[stage] adaptive quality', detail);
        });
      });
    },
    get qualityTier() { return quality?.tier ?? 0; },
    get frames() {
      return frames;
    },
    dispose() {
      lifetime.abort();
      host.classList.remove('stage--lost');
      loop.stop();
      ro.disconnect();
      unwatchPixelRatio();
      layers.clear();
      post.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
