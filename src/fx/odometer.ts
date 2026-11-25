import gsap from 'gsap';
import { OD } from '../core/timings';

const running = new WeakMap<HTMLElement, gsap.core.Timeline>();

/** Roll digits independently. Separators, units, comparisons and signs stay
 * fixed, and assistive technology receives the complete value throughout. */
export function odometer(el: HTMLElement, target: string, duration: number = OD.slide): gsap.core.Timeline {
  running.get(el)?.kill();
  const timeline = gsap.timeline();
  const doc = el.ownerDocument;
  const digits = Array.from(target).filter(char => /[0-9]/.test(char)).length;
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!digits || duration <= 0 || reduced) {
    el.textContent = target;
    return timeline;
  }

  const spoken = doc.createElement('span');
  spoken.textContent = target;
  spoken.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
  const visible = doc.createElement('span');
  visible.setAttribute('aria-hidden', 'true');
  visible.style.cssText = 'display:inline;font:inherit;letter-spacing:inherit;color:inherit;margin:0;white-space:pre';
  el.replaceChildren(spoken, visible);
  const stagger = Math.min(OD.stagger, duration / (2 * digits));
  const rollTime = duration - stagger * (digits - 1);
  let column = 0;
  for (const char of target) {
    if (!/[0-9]/.test(char)) {
      visible.append(doc.createTextNode(char));
      continue;
    }
    // The invisible final glyph reserves its own proportional width. The
    // vertically stacked digits therefore cannot move neighbouring characters.
    const clip = doc.createElement('span');
    clip.style.cssText = 'display:inline-block;position:relative;overflow:hidden;font:inherit;line-height:1;height:1em;vertical-align:-.1em;color:inherit;margin:0';
    const measure = doc.createElement('span');
    measure.style.cssText = 'display:inline;font:inherit;margin:0;visibility:hidden';
    measure.textContent = char;
    const reel = doc.createElement('span');
    reel.style.cssText = 'position:absolute;display:block;inset:0 0 auto;font:inherit;letter-spacing:inherit;color:inherit;margin:0;line-height:1em;text-align:center;white-space:pre';
    const steps = 10 + Number(char);
    reel.textContent = Array.from({ length: steps + 1 }, (_, i) => String(i % 10)).join('\n');
    clip.append(measure, reel);
    visible.append(clip);
    const row = { value: 0 };
    timeline.to(row, { value: steps, duration: rollTime, ease: 'power3.out',
      onUpdate: () => { reel.style.transform = `translateY(-${row.value}em)`; },
    }, column * stagger);
    column++;
  }

  running.set(el, timeline);
  function finish() {
    if (running.get(el) !== timeline) return;
    el.textContent = target;
    running.delete(el);
  }
  timeline.eventCallback('onComplete', finish);
  timeline.eventCallback('onInterrupt', finish);
  return timeline;
}
