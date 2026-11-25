import { afterEach, expect, it, vi } from 'vitest';
import { WARMUP } from '../../src/core/timings';
import { createPreparation } from '../../src/gl/preparation';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('shares a frame budget, waits for the most recent pointer movement and cancels queued work', async () => {
  vi.useFakeTimers();
  let now = 0, intro = true, next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const frame = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const cb of pending) cb(now);
  };
  const window = Object.assign(new EventTarget(), { setTimeout });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { documentElement: { classList: { contains: () => intro } } });
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const life = new AbortController(), prep = createPreparation(life.signal);
  const calls: string[] = [];
  const work = (name: string) => {
    let count = 0;
    return prep.run(() => { calls.push(name); now++; return ++count === 3; });
  };
  const done = Promise.all([work('geometry'), work('texture')]);
  window.dispatchEvent(new Event('pointermove'));
  frame();
  expect(now).toBe(WARMUP.sliceMs);
  expect(calls).toEqual(['geometry', 'texture', 'geometry', 'texture']);
  intro = false;
  window.dispatchEvent(new Event('pointermove'));
  frame();
  now += WARMUP.pointerIdleMs - 1;
  vi.advanceTimersByTime(WARMUP.pointerIdleMs - 1);
  expect(frames.size).toBe(0);
  window.dispatchEvent(new Event('pointermove'));
  now++; vi.advanceTimersByTime(1); frame();
  expect(calls).toHaveLength(4);
  now += WARMUP.pointerIdleMs - 1;
  vi.advanceTimersByTime(WARMUP.pointerIdleMs - 1); frame();
  await done;
  expect(calls).toHaveLength(6);
  const cancel = new AbortController();
  const job = prep.run(() => { throw new Error('Unexpected upload'); }, cancel.signal);
  cancel.abort();
  await expect(job).rejects.toMatchObject({ name: 'AbortError' });
  const pending = prep.run(() => false);
  life.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(frames.size).toBe(0);
});
