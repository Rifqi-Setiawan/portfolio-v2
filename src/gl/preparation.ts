import { WARMUP } from '../core/timings';

type Step = () => boolean;

/** One budget for texture and geometry uploads across all loading scenes. */
export function createPreparation(lifetime: AbortSignal) {
  const queue: { step: Step; resolve: () => void; reject: (reason: unknown) => void; signal: AbortSignal }[] = [];
  let frame = 0, timer = 0, movedAt = -Infinity;
  const pointer = () => { movedAt = performance.now(); };
  window.addEventListener('pointermove', pointer, { passive: true, signal: lifetime });
  function wake() {
    if (!frame && !timer && queue.length) frame = requestAnimationFrame(flush);
  }
  function flush() {
    frame = 0;
    if (!queue.length) return;
    const wait = WARMUP.pointerIdleMs - (performance.now() - movedAt);
    if (wait > 0 && !document.documentElement.classList.contains('is-intro')) {
      timer = window.setTimeout(() => { timer = 0; wake(); }, wait);
      return;
    }
    const deadline = performance.now() + WARMUP.sliceMs;
    do {
      const job = queue.shift()!;
      try {
        job.signal.throwIfAborted();
        if (job.step()) job.resolve();
        else queue.push(job);
      } catch (error) { job.reject(error); }
    } while (queue.length && performance.now() < deadline);
    wake();
  }
  lifetime.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    for (const job of queue.splice(0)) job.reject(lifetime.reason);
  }, { once: true });
  return {
    run(step: Step, signal = lifetime): Promise<void> {
      if (lifetime.aborted || signal.aborted) return Promise.reject(signal.reason ?? lifetime.reason);
      return new Promise((resolve, reject) => {
        const cleanup = () => signal.removeEventListener('abort', cancel);
        const job = {
          signal, step,
          resolve: () => { cleanup(); resolve(); },
          reject: (reason: unknown) => { cleanup(); reject(reason); },
        };
        const cancel = () => {
          const i = queue.indexOf(job);
          if (i >= 0) queue.splice(i, 1);
          job.reject(signal.reason);
        };
        if (signal !== lifetime) signal.addEventListener('abort', cancel, { once: true });
        queue.push(job); wake();
      });
    },
  };
}
