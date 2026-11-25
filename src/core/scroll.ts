import { SCROLL } from './timings';

/** Smooth wheel travel on the actual scrollTop, keeping native focus, keyboard,
 * touch, scrollbars and scroll observers in sync with the visible surface. */
export function createSmoothScroll(el: HTMLElement, options = SCROLL) {
  const win = el.ownerDocument.defaultView!;
  let position = el.scrollTop;
  let velocity = 0;
  let goal = position;
  const writes = new Set<number>();
  let frame = 0;
  let lastTime = 0;
  const limit = (y: number) => Math.min(Math.max(0, y), Math.max(0, el.scrollHeight - el.clientHeight));
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');

  function stop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = lastTime = 0;
    goal = position = el.scrollTop;
    velocity = 0;
    writes.clear();
  }
  function advance(time: number) {
    const dt = Math.max(0, (time - lastTime) / 1000);
    lastTime = time;
    goal = limit(goal);
    const offset = position - goal;
    const travel = (velocity + options.follow * offset) * dt;
    const decay = Math.exp(-options.follow * dt);
    position = goal + (offset + travel) * decay;
    velocity = (velocity - options.follow * travel) * decay;
    const arrived = Math.abs(position - goal) < .05 && Math.abs(velocity) < 1;
    el.scrollTop = arrived ? goal : limit(position);
    writes.add(Math.round(el.scrollTop * win.devicePixelRatio));
    if (arrived) stop();
    else frame = win.requestAnimationFrame(advance);
  }
  function to(y: number) {
    if (!Number.isFinite(y)) return;
    if (!frame) stop();
    goal = limit(y);
    if (reduced.matches) {
      el.scrollTop = goal;
      stop();
    } else if (!frame && position !== goal) {
      writes.add(Math.round(position * win.devicePixelRatio));
      lastTime = win.performance.now();
      frame = win.requestAnimationFrame(advance);
    }
  }
  function wheel(event: WheelEvent) {
    if (event.ctrlKey || event.defaultPrevented || !event.cancelable || !event.deltaY || reduced.matches) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    let delta = event.deltaY;
    if (event.deltaMode === event.DOM_DELTA_LINE) delta *= 100 / 6;
    else if (event.deltaMode === event.DOM_DELTA_PAGE) delta *= win.innerHeight;
    const from = frame ? goal : el.scrollTop;
    const next = limit(from + delta);
    // An outward wheel while the spring is catching its goal must not start a
    // competing native scroll. Hand off once the visible surface has settled.
    if (!frame && (next === from || (next === el.scrollHeight - el.clientHeight && next - from < 1))) return;
    event.preventDefault();
    to(next);
  }
  function nativeScroll() {
    if (!frame) return;
    const pixel = Math.round(el.scrollTop * win.devicePixelRatio);
    // Scroll notifications can be coalesced or report an older, rounded write.
    if (Math.abs(el.scrollTop - limit(position)) * win.devicePixelRatio > 2 && !writes.has(pixel)) stop();
  }
  function pointerDown(event: PointerEvent) {
    if (!frame) return;
    const left = el.getBoundingClientRect().left + el.clientLeft;
    if (event.pointerType !== 'mouse' || event.clientX < left || event.clientX >= left + el.clientWidth) stop();
  }
  function keyDown(event: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) stop();
  }
  function onVisibility() {
    if (el.ownerDocument.hidden) stop();
  }
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('scroll', nativeScroll, { passive: true });
  el.addEventListener('pointerdown', pointerDown, { passive: true });
  el.addEventListener('keydown', keyDown);
  el.ownerDocument.addEventListener('visibilitychange', onVisibility);
  return {
    to,
    destroy() {
      stop();
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('scroll', nativeScroll);
      el.removeEventListener('pointerdown', pointerDown);
      el.removeEventListener('keydown', keyDown);
      el.ownerDocument.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
