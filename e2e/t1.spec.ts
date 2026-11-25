import { test, expect, type Page } from '@playwright/test';

type App = { director: { idle(): Promise<void>; lastDuration: number }; carousel?: { presence: number }; scenes: { hero?: { u: { uRecede: { value: number } } } } };
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const app = (window as unknown as { __app: App }).__app;
    await app.director.idle();
    return { duration: app.director.lastDuration, recede: app.scenes.hero?.u.uRecede.value, presence: app.carousel?.presence };
  });
}

test('wheel opens the strip in 1.45s and reverses from the first project', async ({ page }) => {
  await page.goto('/?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.mouse.wheel(0, 450);
  await expect(page).toHaveURL(/\/portfolio$/);
  const opened = await snapshot(page);
  expect(opened.duration).toBeCloseTo(1.45, 2);
  expect(opened.recede).toBe(1);
  expect(opened.presence).toBe(1);
  await expect(page.locator('.hero__title .is-in')).toHaveCount(0);
  await page.mouse.wheel(0, -450);
  await expect(page).toHaveURL(/\/$/);
  const closed = await snapshot(page);
  expect(closed.duration).toBeCloseTo(1.45, 2);
  expect(closed.recede).toBe(0);
  expect(closed.presence).toBe(0);
  await expect(page.locator('.hero__role')).toHaveClass(/is-in/);
});

test('navigation through another page restores the full hero', async ({ page }) => {
  await page.goto('/?speed=100');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  for (const kind of ['portfolio', 'about', 'hero']) {
    await page.locator(`header [data-go="${kind}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-state', kind);
  }
  expect((await snapshot(page)).recede).toBe(0);
  await expect(page.locator('.hero__role')).toHaveCSS('opacity', '1');
});
