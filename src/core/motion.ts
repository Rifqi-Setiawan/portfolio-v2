export type MotionMode = 'full' | 'reduced' | 'nogl';

/** A single live result per query. Reading it during a draw never asks for style/layout. */
function mediaFlag(query: string): () => boolean {
  let value: boolean | undefined;
  return () => {
    if (value === undefined) {
      const media = window.matchMedia(query);
      value = media.matches;
      media.addEventListener('change', e => { value = e.matches; });
    }
    return value;
  };
}

export const isNarrow = mediaFlag('(orientation: portrait), (width <= 767px)');
export const isReduced = mediaFlag('(prefers-reduced-motion: reduce)');

export function renderPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 1.5);
}

/** Moving between screens can change the backing resolution without resizing the page. */
export function watchPixelRatio(redraw: () => void): () => void {
  const resolution = () => matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  let query = resolution();
  const changed = () => {
    query = resolution();
    query.addEventListener('change', changed, { once: true });
    redraw();
  };
  query.addEventListener('change', changed, { once: true });
  return () => query.removeEventListener('change', changed);
}

let gl2: boolean | undefined;
export function hasWebGL2(): boolean {
  if (gl2 === undefined) {
    try {
      gl2 = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      gl2 = false;
    }
  }
  return gl2;
}

export function motionMode(): MotionMode {
  if (isReduced()) return 'reduced';
  if (!hasWebGL2()) return 'nogl';
  return 'full';
}
