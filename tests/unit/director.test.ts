import { describe, it, expect, vi } from 'vitest';
import gsap from 'gsap';
import { Director } from '../../src/core/director';

const tl = (d = 0.02) => gsap.timeline().to({}, { duration: d });

describe('Director', () => {
  it('runs registered timeline and updates state', async () => {
    const d = new Director({ kind: 'hero' });
    let ran = false;
    let changed: unknown;
    d.register('hero', 'about', () => { ran = true; return tl(); });
    d.addEventListener('change', (e) => (changed = (e as CustomEvent).detail));
    const p = d.go({ kind: 'about' });
    expect(d.busy).toBe(true);
    expect(await p).toBe(true);
    expect(ran).toBe(true);
    expect(d.state).toEqual({ kind: 'about' });
    expect(d.busy).toBe(false);
    expect(changed).toEqual({ from: { kind: 'hero' }, to: { kind: 'about' } });
  });

  it('ignores go while busy', async () => {
    const d = new Director({ kind: 'hero' });
    d.register('*', '*', () => tl(0.05));
    const a = d.go({ kind: 'about' });
    const b = d.go({ kind: 'contacts' });
    expect(await b).toBe(false);
    expect(await a).toBe(true);
    expect(d.state).toEqual({ kind: 'about' });
  });

  it('picks most specific registration', async () => {
    const d = new Director({ kind: 'hero' });
    const hits: string[] = [];
    d.register('*', '*', () => { hits.push('**'); return tl(); });
    d.register('*', 'about', () => { hits.push('*,about'); return tl(); });
    d.register('hero', '*', () => { hits.push('hero,*'); return tl(); });
    d.register('hero', 'about', () => { hits.push('hero,about'); return tl(); });
    await d.go({ kind: 'about' });      // exact
    await d.go({ kind: 'contacts' });   // about -> contacts: default
    await d.go({ kind: 'hero' });       // contacts -> hero: default
    await d.go({ kind: 'about' });      // exact again
    expect(hits).toEqual(['hero,about', '**', '**', 'hero,about']);
    await d.go({ kind: 'portfolio' });  // about -> portfolio: default
    await d.go({ kind: 'about' });      // portfolio -> about: *,about
    await d.go({ kind: 'hero' });       // about -> hero: default
    await d.go({ kind: 'contacts' });   // hero -> contacts: hero,*
    expect(hits.slice(4)).toEqual(['**', '*,about', '**', 'hero,*']);
  });

  it('same state go returns false', async () => {
    const d = new Director({ kind: 'case', slug: 'x' });
    expect(await d.go({ kind: 'case', slug: 'x' })).toBe(false);
    expect(d.busy).toBe(false);
  });

  it('idle also waits for a route started by the change listener', async () => {
    const d = new Director({ kind: 'hero' });
    d.register('*', '*', () => gsap.timeline());
    d.addEventListener('change', () => { void d.go({ kind: 'case', slug: 'tribunpass' }); }, { once: true });
    void d.go({ kind: 'portfolio' });
    await d.idle();
    expect(d.state).toEqual({ kind: 'case', slug: 'tribunpass' });
    expect(d.busy).toBe(false);
  });

  it('default crossfade completes', async () => {
    const d = new Director({ kind: 'hero' });
    expect(await d.go({ kind: 'portfolio' })).toBe(true);
    expect(d.state.kind).toBe('portfolio');
  });

  it('onAccept runs synchronously before change, even for zero-duration transitions', async () => {
    const d = new Director({ kind: 'hero' });
    d.register('*', '*', () => gsap.timeline());
    const order: string[] = [];
    d.addEventListener('change', () => order.push('change'));
    const p = d.go({ kind: 'about' }, () => order.push('accept'));
    expect(order).toEqual(['accept']);
    expect(await p).toBe(true);
    expect(order).toEqual(['accept', 'change']);
  });

  it('throwing transition does not wedge the director', async () => {
    const d = new Director({ kind: 'hero' });
    d.register('hero', 'about', () => { throw new Error('boom'); });
    expect(await d.go({ kind: 'about' })).toBe(true);
    expect(d.busy).toBe(false);
    expect(d.state.kind).toBe('about');
    expect(await d.go({ kind: 'hero' })).toBe(true);
  });

  it('does not clobber a transition onComplete', async () => {
    const d = new Director({ kind: 'hero' });
    let own = false;
    d.register('*', '*', () => gsap.timeline({ onComplete: () => (own = true) }).to({}, { duration: 0.02 }));
    await d.go({ kind: 'about' });
    expect(own).toBe(true);
  });

  it('killed timeline releases busy', async () => {
    const d = new Director({ kind: 'hero' });
    let t!: gsap.core.Timeline;
    d.register('*', '*', () => (t = tl(0.5)));
    const p = d.go({ kind: 'about' });
    await Promise.resolve();
    t.kill();
    expect(await p).toBe(true);
    expect(d.busy).toBe(false);
    expect(d.state.kind).toBe('about');
  }, 10000);

  it('the watchdog lets a delayed timeline resume after a background pause', async () => {
    const d = new Director({ kind: 'hero' });
    const timeline = gsap.timeline({ delay: 10 }).to({}, { duration: 1 }).timeScale(.25);
    d.register('*', '*', () => timeline);
    const intervals = vi.spyOn(globalThis, 'setInterval');
    try {
      const finished = d.go({ kind: 'portfolio' });
      await Promise.resolve();
      const tick = intervals.mock.calls.at(-1)![0] as () => void;
      tick();
      vi.stubGlobal('document', { hidden: true });
      timeline.pause();
      tick();
      await Promise.resolve();
      expect(d.busy).toBe(true);
      expect(timeline.progress()).toBe(0);
      timeline.resume().totalProgress(1);
      await finished;
      expect(d.state.kind).toBe('portfolio');
    } finally {
      timeline.kill();
      vi.unstubAllGlobals();
      intervals.mockRestore();
    }
  });
});
