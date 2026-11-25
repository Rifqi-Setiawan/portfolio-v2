import { test, expect } from '@playwright/test';

type App = {
  director: { idle(): Promise<void>; busy: boolean; state: { kind: string } };
  stage: { frames: number; requestRender(): void } | null;
  scenes: Record<string, { count: number; u: Record<string, { value: number }> } | undefined>;
};

test('failed scene loading disposes the canvas and leaves the still hero usable', async ({ page }) => {
  await page.route('**/scenes/hero/depth.webp', route => route.fulfill({ status: 404 }));
  await page.goto('/?speed=30');
  await expect(page.locator('.stage')).toHaveClass(/stage--still/);
  await expect(page.locator('.stage canvas')).toHaveCount(0);
  await expect(page.locator('.hero__role')).toHaveCSS('opacity', '1');
  await page.locator('header [data-go=about]').click();
  await expect(page.locator('html')).toHaveAttribute('data-state', 'about');
});

for (const [kind, path] of [['hero', '/'], ['about', '/about']] as const) {
  test(`the ${kind} scene uses its preset, idles at rest and renders on demand`, async ({ page, request }) => {
    const preset = await (await request.get(`/scenes/${kind}/preset.json`)).json();
    await page.goto(`${path}?speed=30`);
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    await expect(page.locator('.stage canvas')).toBeVisible();
    const scene = await page.evaluate(kind => {
      const scene = (window as unknown as { __app: App }).__app.scenes[kind]!;
      return { count: scene.count, photo: scene.u.uPhoto.value, split: scene.u.uSplit.value };
    }, kind);
    expect(scene).toEqual({ count: preset.particles.count, photo: 1, split: kind === 'about' ? 1 : 0 });
    // Allow asynchronous texture uploads to finish. No layer should request another frame at rest.
    await expect.poll(() => page.evaluate(async () => {
      const stage = (window as unknown as { __app: App }).__app.stage!;
      const frames = stage.frames;
      for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
      return stage.frames - frames;
    })).toBe(0);
    const renders = await page.evaluate(async () => {
      const stage = (window as unknown as { __app: App }).__app.stage!;
      const before = stage.frames;
      stage.requestRender();
      await new Promise(requestAnimationFrame);
      return stage.frames - before;
    });
    expect(renders).toBe(1);
  });
}
