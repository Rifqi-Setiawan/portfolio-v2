import { test, expect } from '@playwright/test';
import { SD } from '../src/core/timings';

test('the intro locks navigation, finishes its authored sequence and reveals the hero', async ({ page }) => {
  let releaseDepth!: () => void;
  const waitingForDepth = new Promise<void>(resolve => { releaseDepth = resolve; });
  await page.route('**/scenes/hero/depth.webp', async route => {
    await waitingForDepth;
    await route.continue();
  });
  try {
    await page.goto('/?speed=30', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => performance.getEntriesByName('intro:title-in').length > 0);
    await expect(page.locator('html')).toHaveClass(/is-intro/);
    await page.locator('.stage canvas').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.stage canvas')!;
      const root = document.documentElement;
      const observer = new MutationObserver(() => {
        if (canvas.style.visibility === 'hidden') canvas.dataset.probeConcealed = 'yes';
        if (!root.classList.contains('has-intro-particles')) return;
        const app = (window as unknown as { __app: { scenes: { hero: { u: { uPhoto: { value: number } } } } } }).__app;
        canvas.dataset.dustReset = String(canvas.style.visibility === '' && app.scenes.hero.u.uPhoto.value === 0);
        observer.disconnect();
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
      observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    });
    await page.mouse.wheel(0, 450);
    await expect(page).toHaveURL(/\/\?speed=30$/);
  } finally {
    releaseDepth();
  }
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await expect(page.locator('.stage canvas')).toHaveAttribute('data-probe-concealed', 'yes');
  await expect(page.locator('.stage canvas')).toHaveAttribute('data-dust-reset', 'true');
  const timeline = await page.evaluate(() => ({
    seconds: performance.getEntriesByName('intro:authored')[0]?.duration / 1000,
    labels: (performance.getEntriesByName('intro:authored')[0] as PerformanceMeasure).detail as Record<string, number>,
    marks: performance.getEntriesByType('mark').map(event => event.name).filter(name => name.startsWith('intro:')),
  }));
  const nameWords = await page.locator('.preloader [data-goo]').count();
  const fullDuration = SD.in + SD.stagger * (nameWords - 1) + timeline.seconds;
  expect(fullDuration).toBeGreaterThanOrEqual(4.5);
  expect(fullDuration).toBeLessThanOrEqual(6.5);
  expect(timeline.labels.dust).toBeGreaterThanOrEqual(1.2);
  expect(timeline.labels.photo - timeline.labels.portrait).toBeGreaterThanOrEqual(.6);
  expect(timeline.labels['name-out']).toBeGreaterThan(timeline.labels.photo + (timeline.labels['photo-in'] - timeline.labels.photo) / 2);
  expect(timeline.labels['hero-words'] - timeline.labels['name-out']).toBeCloseTo(.3, 4);
  expect(timeline.marks).toEqual([
    'intro:title-in', 'intro:morph-start', 'intro:photo-start', 'intro:hero-text', 'intro:header', 'intro:scroll', 'intro:end',
  ]);
  await expect(page.locator('.hero__role')).toHaveClass(/is-in/);
  await expect(page.locator('.preloader [data-goo]').first()).toHaveCSS('opacity', '0');
  await page.mouse.wheel(0, 450);
  await expect(page).toHaveURL(/\/portfolio$/);
});

test('reduced motion shows a still hero and skips the particle morph', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?speed=30');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const stage = page.locator('.stage');
  await expect(stage).toHaveClass(/stage--still/);
  await expect(stage).toHaveCSS('background-image', /\/scenes\/hero\/photo\.webp/);
  await expect(stage.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.hero__role')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => performance.getEntriesByName('intro:morph-start'))).toHaveLength(0);
});
