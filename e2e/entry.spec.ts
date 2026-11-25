import { test, expect } from '@playwright/test';

type App = {
  director: { idle(): Promise<void>; lastDuration: number };
  carousel?: { presence: number };
  scenes: { about?: { u: { uSplit: { value: number } } } };
};

const onStaging = () => test.info().project.name === 'staging';
const entryUrl = (path: string) => onStaging() ? path : path + '?speed=30';

test.afterEach(async ({ page }) => {
  if (onStaging()) expect(await page.evaluate(() => '__app' in window)).toBe(false);
});

test('a shared case is readable before the point cloud arrives', async ({ page }) => {
  let releaseDepth!: () => void;
  const waitingForDepth = new Promise<void>(resolve => { releaseDepth = resolve; });
  const requestedDepth = page.waitForRequest('**/scenes/hero/depth.webp');
  let wasReadableAtRequest = false;
  await page.route('**/scenes/hero/depth.webp', async route => {
    wasReadableAtRequest = await page.locator('[data-case=tribunpass] .case__panel').evaluate(el =>
      !document.documentElement.classList.contains('is-intro')
      && getComputedStyle(el).visibility === 'visible'
      && el.getBoundingClientRect().left < innerWidth,
    );
    await waitingForDepth;
    await route.continue();
  });
  try {
    await page.goto(entryUrl('/work/tribunpass'));
    const entry = page.locator('[data-case=tribunpass]');
    await expect(entry.locator('.case__title')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    await requestedDepth;
    await expect.poll(() => wasReadableAtRequest).toBe(true);
    await entry.locator('.case__back').click();
    await expect(page).toHaveURL(/\/portfolio$/);
  } finally {
    releaseDepth();
  }
  await expect(page.locator('html')).toHaveAttribute('data-state', 'portfolio');
  await expect(page.locator('.works__caption .works__title')).toHaveText('TribunPass');
  if (!onStaging()) {
    expect(await page.evaluate(() => (window as unknown as { __app: App }).__app.director.lastDuration)).toBeCloseTo(1.3, 2);
  }
});

test('direct About reveals its split', async ({ page }) => {
  await page.goto(entryUrl('/about'));
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await expect(page.locator('.stage canvas')).toBeVisible();
  if (!onStaging()) {
    expect(await page.evaluate(() => (window as unknown as { __app: App }).__app.scenes.about?.u.uSplit.value)).toBe(1);
  }
  const heading = page.getByRole('heading', { name: 'Building software that works.', exact: true });
  await expect(heading).toBeVisible();
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const lines = heading.locator('.about__line');
    await expect(lines).toHaveText(['Building software', 'that works.']);
    for (const line of await lines.all()) await expect(line).toBeInViewport({ ratio: 1 });
  }
});

test('direct portfolio enters the carousel without revealing hero type', async ({ page }) => {
  await page.addInitScript(() => new MutationObserver(records => {
    if (records.some(r => r.target instanceof Element && r.target.closest('.hero__title') && r.target.classList.contains('is-in'))) {
      performance.mark('hero-word-revealed');
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] }));
  await page.goto(entryUrl('/portfolio'));
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await expect(page.locator('.works__caption')).toBeVisible();
  await expect(page.locator('[data-work="tribunpass"].is-active a')).toBeInViewport();
  if (!onStaging()) {
    expect(await page.evaluate(() => (window as unknown as { __app: App }).__app.carousel?.presence)).toBe(1);
  }
  expect(await page.evaluate(() => performance.getEntriesByName('hero-word-revealed'))).toHaveLength(0);
});
