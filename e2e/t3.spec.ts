import { expect, test, type Page } from '@playwright/test';

type Rect = { x: number; y: number; width: number; height: number };
type App = { director: { idle(): Promise<void>; lastDuration: number }; carousel?: { lastHandoffRect?: Rect } };
async function settled(page: Page) {
  return page.evaluate(async () => {
    const app = (window as unknown as { __app: App }).__app;
    await app.director.idle();
    const r = app.carousel?.lastHandoffRect;
    const plane = r && { x:r.x, y:r.y, width:r.width, height:r.height };
    return { duration: app.director.lastDuration, plane };
  });
}
const firstCard = '[data-work="tribunpass"] a';
test('case dimming grades the retained room and settles its final frame', async ({ page }) => {
  await page.goto('/portfolio?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await settled(page);
  const result = await page.evaluate(async () => {
    type Stage = import('../src/gl/stage').Stage;
    type PointScene = import('../src/gl/pointScene').PointScene;
    const { stage, scenes } = (window as unknown as { __app: { stage: Stage; scenes: { hero: PointScene } } }).__app;
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await frame(); await frame();
    const before = stage.scene.onBeforeRender;
    let repaints = 0;
    stage.scene.onBeforeRender = () => { repaints++; };
    try {
      const start = stage.frames;
      scenes.hero.u.uDim.value = 1;
      await frame();
      const terminal = stage.frames;
      await frame(); await frame();
      return { repaints, dim: stage.post.uniforms.uRoomDim.value, changed: terminal > start, idle: stage.frames === terminal };
    } finally { stage.scene.onBeforeRender = before; }
  });
  expect(result).toEqual({ repaints: 0, dim: .3, changed: true, idle: true });
});

test('keyboard opens the centre plane into the lead image and Escape returns to that card', async ({ page }) => {
  await page.goto('/portfolio?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await settled(page);
  const card = page.locator(firstCard);
  for (let i = 0; i < 20 && !await card.evaluate(el => el === document.activeElement); i++) await page.keyboard.press('Tab');
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/work\/tribunpass$/);
  const { duration, plane } = await settled(page);
  expect(duration).toBeCloseTo(.9, 2);
  await expect(page.locator('html')).toHaveAttribute('data-palette','tribunpass');
  const entry = page.locator('[data-case="tribunpass"]');
  await expect(entry.locator('.case__count')).toHaveText('01 / 08');
  expect(await entry.locator('.case__panel').evaluate(el => el.contains(document.activeElement))).toBe(true);
  const box = await entry.locator('.case__media li').first().boundingBox();
  expect(box).toBeTruthy();
  expect(plane).toBeTruthy();
  for (const key of ['x','y','width','height'] as const) expect(Math.abs(plane![key] - box![key])).toBeLessThanOrEqual(2);
  await page.setViewportSize({width:1280,height:720});
  const col = await entry.locator('.case__media').boundingBox();
  const image = await entry.locator('.case__media li').first().boundingBox();
  expect(col!.width / 1280).toBeCloseTo(.671,2);
  expect(Math.abs((col!.width - image!.width)/2 - image!.x)).toBeLessThan(2);
  await entry.locator('.case__media').evaluate(el => { el.scrollTop = el.clientHeight; });
  expect(await entry.locator('.case__media').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/portfolio$/);
  const closed = await settled(page);
  expect(closed.duration).toBeCloseTo(1.3,2);
  expect(Math.abs(closed.plane!.y-image!.y)).toBeLessThanOrEqual(2);
  await expect(card).toBeFocused();
});

test('next project crossfades the panel in place', async ({page}) => {
  await page.goto('/work/tribunpass?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await settled(page);
  const next = page.locator('[data-case="tribunpass"] .case__count [rel=next]');
  const href = await next.getAttribute('href');
  await next.click();
  await expect(page).toHaveURL(new RegExp(href+'$'));
  expect((await settled(page)).duration).toBeCloseTo(.85,2);
  const entry = page.locator('.case__entry:not([hidden])');
  await expect(entry.locator('.case__count')).toHaveText('02 / 08');
  await entry.locator('.case__count [rel=prev]').click();
  await expect(page).toHaveURL(/\/work\/tribunpass$/);
  expect((await settled(page)).duration).toBeCloseTo(.85,2);
});

test('opening a filtered grid card and moving to an excluded case returns to a visible card', async ({page}) => {
  await page.goto('/portfolio?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.locator('button[data-filter=backend]').click();
  await page.locator('button[data-view=grid]').click();
  await page.locator(firstCard).click();
  await expect(page.locator('html')).toHaveAttribute('data-state','case');
  await page.locator('[data-case="tribunpass"] .case__count [rel=next]').click();
  await expect(page.locator('html')).toHaveAttribute('data-palette','techhiring');
  await settled(page);
  await page.locator('[data-case="techhiring"] .case__back').click();
  await expect(page.locator('html')).toHaveAttribute('data-state','portfolio');
  await expect(page.locator('button[data-filter=all]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-work="techhiring"] a')).toBeFocused();
});
