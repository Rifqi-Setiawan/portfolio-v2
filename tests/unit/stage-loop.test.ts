import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLoop } from '../../src/gl/stage';

function fakeEnv() {
  const listeners: Record<string, Array<() => void>> = {};
  const doc = {
    hidden: false,
    addEventListener: (n: string, f: () => void) => (listeners[n] ??= []).push(f),
    removeEventListener: (n: string, f: () => void) => {
      listeners[n] = (listeners[n] ?? []).filter((x) => x !== f);
    },
  };
  vi.stubGlobal('document', doc);
  let queue: Array<(ts: number) => void> = [];
  let now = 0;
  const raf = ((cb: (ts: number) => void) => {
    queue.push(cb);
    return queue.length;
  }) as unknown as typeof requestAnimationFrame;
  const step = () => {
    const q = queue;
    queue = [];
    now += 16;
    q.forEach((cb) => cb(now));
  };
  return { doc, raf, step, pending: () => queue.length, fire: (n: string) => (listeners[n] ?? []).forEach((f) => f()) };
}

describe('createLoop', () => {
  let env: ReturnType<typeof fakeEnv>;
  beforeEach(() => {
    env = fakeEnv();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stops requesting frames when tick returns false, kick restarts', () => {
    let more = true;
    const tick = vi.fn(() => more);
    const loop = createLoop(tick, env.raf);
    loop.kick();
    env.step();
    env.step();
    expect(tick).toHaveBeenCalledTimes(2);
    expect(env.pending()).toBe(1);
    more = false;
    env.step();
    expect(env.pending()).toBe(0);
    env.step();
    expect(tick).toHaveBeenCalledTimes(3);
    loop.kick();
    expect(env.pending()).toBe(1);
    env.step();
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('kick while running does not double-schedule', () => {
    const loop = createLoop(() => true, env.raf);
    loop.kick();
    loop.kick();
    expect(env.pending()).toBe(1);
  });

  it('does not run while hidden and resumes on visibilitychange', () => {
    const tick = vi.fn(() => false);
    const loop = createLoop(tick, env.raf);
    env.doc.hidden = true;
    loop.kick();
    expect(env.pending()).toBe(0);
    env.doc.hidden = false;
    env.fire('visibilitychange');
    expect(env.pending()).toBe(1);
    env.step();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('pauses mid-run when hidden, resumes when visible', () => {
    const tick = vi.fn(() => true);
    const loop = createLoop(tick, env.raf);
    loop.kick();
    env.step();
    env.doc.hidden = true;
    env.step();
    expect(env.pending()).toBe(0);
    env.doc.hidden = false;
    env.fire('visibilitychange');
    expect(env.pending()).toBe(1);
  });

  it('stop halts frames', () => {
    const loop = createLoop(() => true, env.raf);
    loop.kick();
    loop.stop();
    env.step();
    expect(env.pending()).toBe(0);
  });
});
