import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test('carousel-only frames reuse the room until a photographic layer moves or settles', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => '__app' in window);
  const counts = await page.evaluate(async () => {
    type Stage = import('../src/gl/stage').Stage;
    const app = (window as unknown as { __app: { createStage(host: HTMLElement): Stage | null } }).__app;
    const host = document.body.appendChild(document.createElement('div'));
    host.style.cssText = 'position:fixed;width:96px;height:64px';
    const stage = app.createStage(host);
    if (!stage) throw new Error('Missing WebGL2 stage');
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    stage.post.uniforms.uGrain.value = .01;
    let paints = 0, moving = false;
    stage.scene.onBeforeRender = () => { paints++; };
    stage.add({ update: () => moving });
    try {
      await frame(); await frame();
      const initial = paints;
      stage.requestOverlay(); await frame();
      const overlay = paints;
      moving = true; stage.requestRender(); await frame();
      const started = paints;
      moving = false; await frame();
      const stopped = paints;
      stage.requestOverlay(); await frame();
      const reused = paints;
      host.style.width = '128px'; await frame(); await frame(); await frame();
      const resized = paints;
      const rendered = stage.frames; await frame(); await frame();
      return { initial, overlay, started, stopped, reused, resized, idle: stage.frames - rendered };
    } finally { stage.dispose(); host.remove(); }
  });
  expect(counts.initial).toBeGreaterThan(0);
  expect(counts.overlay).toBe(counts.initial);
  expect(counts.started).toBe(counts.overlay + 1);
  expect(counts.stopped).toBe(counts.started + 1);
  expect(counts.reused).toBe(counts.stopped);
  expect(counts.resized).toBeGreaterThan(counts.reused);
  expect(counts.idle).toBe(0);
});

test('post path and bypass path give the same background colour (#252525)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => '__app' in window);
  const r = await page.evaluate(() => {
    type S = {
      renderer: import('three').WebGLRenderer;
      scene: import('three').Scene;
      camera: import('three').PerspectiveCamera;
      post: { uniforms: { uGrain: { value: number } }; render(...a: unknown[]): void };
      dispose(): void;
    };
    const app = (window as unknown as { __app: { createStage(h: HTMLElement): S | null } }).__app;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0';
    document.body.appendChild(host);
    const st = app.createStage(host);
    if (!st) return null;
    const gl = st.renderer.getContext();
    const px = (): number[] => {
      const out = new Uint8Array(4);
      gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return [...out].slice(0, 3);
    };
    st.renderer.render(st.scene, st.camera);
    const bypass = px();
    st.post.uniforms.uGrain.value = 0.0001;
    st.post.render(st.renderer, st.scene, st.camera, 1);
    const post = px();
    st.dispose();
    host.remove();
    return { bypass, post };
  });
  expect(r).not.toBeNull();
  for (const c of [r!.bypass, r!.post]) for (const v of c) expect(Math.abs(v - 0x25)).toBeLessThanOrEqual(2);
});
