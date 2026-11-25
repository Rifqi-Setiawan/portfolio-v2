import gsap from 'gsap';
import type { State } from './routes';
import { sameState } from './routes';
import { SD } from './timings';

export type PreparedTransition = { timeline: gsap.core.Timeline };
export type Transition = (from: State, to: State) => gsap.core.Timeline | Promise<PreparedTransition>;
type Kind = State['kind'] | '*';

export class Director extends EventTarget {
  private _state: State;
  private _busy = false;
  private _lastDuration = 0;
  private table = new Map<string, Transition>();
  private current: Promise<void> = Promise.resolve();

  constructor(initial: State) {
    super();
    this._state = initial;
    // default .3 s crossfade (no-op-safe: nothing to fade yet)
    this.register('*', '*', () => gsap.timeline().to({}, { duration: SD.out }));
  }

  get state(): State { return this._state; }
  get busy(): boolean { return this._busy; }
  get lastDuration(): number { return this._lastDuration; }

  /** Hold input while the initial route loads and plays its arrival timeline. */
  enter(play: () => Promise<void>): void {
    this._busy = true;
    this.current = play().catch(error => console.error('entry failed', error)).finally(() => {
      this._busy = false;
      this.dispatchEvent(new Event('ready'));
    });
  }

  register(from: Kind, to: Kind, t: Transition): void {
    this.table.set(`${from}>${to}`, t);
  }

  private find(from: State, to: State): Transition {
    return (
      this.table.get(`${from.kind}>${to.kind}`) ??
      this.table.get(`${from.kind}>*`) ??
      this.table.get(`*>${to.kind}`) ??
      this.table.get('*>*')!
    );
  }

  /**
   * Busy flips synchronously when the call is accepted; `onAccept` (if given) runs
   * synchronously at that moment, before the transition is built and before 'change'.
   * Resolves false when rejected (busy / same state), true when the transition finished.
   * Killed or paused transitions release the input lock. A hidden tab, delayed start
   * or slower time scale still follows the animation's own completion.
   */
  go(to: State, onAccept?: () => void): Promise<boolean> {
    if (this._busy || sameState(this._state, to)) return Promise.resolve(false);
    const from = this._state;
    this._busy = true;
    let resolveRun!: () => void;
    this.current = new Promise<void>((r) => (resolveRun = r));
    try { onAccept?.(); } catch (e) { console.error(e); }
    this.dispatchEvent(new Event('transitionstart'));
    return (async () => {
      try {
        await Promise.resolve(); // 'change' is never dispatched synchronously inside go()
        const transition = this.find(from, to)(from, to);
        // A GSAP timeline is itself thenable. Only await the boxed preparation.
        const prepared = transition instanceof Promise ? await transition : { timeline: transition };
        const tl = prepared.timeline;
        const dur = tl.duration();
        this._lastDuration = dur;
        if (dur > 0) {
          await new Promise<void>((resolve) => {
            const done = () => { clearInterval(watchdog); resolve(); };
            const watchdog = setInterval(() => {
              if (typeof document !== 'undefined' && document.hidden) return;
              if (!tl.parent) done();
              else if (tl.paused() || tl.timeScale() === 0) {
                tl.totalProgress(1);
                done();
              }
            }, 1000);
            void tl.then(done);
          });
        }
      } catch (e) {
        console.error('transition failed', e);
      } finally {
        this._state = to;
        this._busy = false;
        try {
          this.dispatchEvent(new CustomEvent('change', { detail: { from, to } }));
        } finally {
          resolveRun();
        }
      }
      return true;
    })();
  }

  /** Resolves once not busy, including any transition started by a 'change' listener. */
  async idle(): Promise<void> {
    while (this._busy) await this.current;
  }
}
