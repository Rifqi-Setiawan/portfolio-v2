import { QUALITY } from '../core/timings';

/** A full first second, then contiguous samples of actual stage animation. */
export class AdaptiveQuality {
  tier = 0;
  private last = 0;
  private elapsed = 0;
  private intervals: number[] = [];
  private reported = false;

  constructor(private readonly displayMs: number, private readonly changed: (tier: number) => void,
    private readonly report: (tier: number, displayMs: number, p90Ms: number) => void) {}

  frame(now: number, continuous: boolean): void {
    if (this.tier === 3) return;
    const elapsed = now - this.last;
    const first = this.last === 0;
    this.last = now;
    // A one-off wake-up (e.g. resize or navigation after reading a page)
    // must not lower the tier. Sustained animation includes every long frame.
    if (first || elapsed <= 0) return;
    if (!continuous && elapsed > this.displayMs * 3) {
      this.elapsed = 0;
      this.intervals.length = 0;
      return;
    }
    this.elapsed += elapsed;
    this.intervals.push(elapsed);
    if (this.reported ? this.intervals.length < QUALITY.responseFrames : this.elapsed < QUALITY.firstWindowMs) return;
    const p90Ms = quantile(this.intervals, .9);
    this.elapsed = 0;
    this.intervals.length = 0;
    const slow = p90Ms > 1.5 * this.displayMs;
    if (slow) this.changed(++this.tier);
    if (slow || !this.reported) this.report(this.tier, this.displayMs, p90Ms);
    this.reported = true;
  }
}

function quantile(samples: number[], fraction: number): number {
  return samples.sort((a, b) => a - b)[Math.ceil(samples.length * fraction) - 1];
}

/** Measure this browser's refresh cadence under the loader, without drawing test frames. */
export function displayInterval(signal: AbortSignal): Promise<number> {
  return new Promise(resolve => {
    const intervals: number[] = [];
    let previous = 0;
    let handle = requestAnimationFrame(sample);
    function stop() {
      cancelAnimationFrame(handle);
      signal.removeEventListener('abort', stop);
      resolve(intervals.length ? quantile(intervals, .1) : 1000 / 60);
    }
    function sample(now: number) {
      if (!document.hidden && previous && now > previous) intervals.push(now - previous);
      previous = document.hidden ? 0 : now;
      if (intervals.length >= 24) stop();
      else handle = requestAnimationFrame(sample);
    }
    signal.addEventListener('abort', stop, { once: true });
  });
}
