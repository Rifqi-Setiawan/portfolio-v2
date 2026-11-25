import { test, expect, type Locator } from '@playwright/test';

test('gallery diagram opens by keyboard before the thumbnail loads and Escape restores focus', async ({ page }) => {
  const gallery = page.locator('.case__entry:not([hidden]) .case__media');
  const opener = gallery.locator('[data-zoom]');
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/media/techhiring/architecture.png', async route => {
    await waiting;
    await route.continue();
  });
  try {
    await page.goto('/work/techhiring?speed=100', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    await opener.focus();
    await expect(opener).toBeInViewport();
    expect(await opener.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(0);
    await page.keyboard.press('Enter');
  } finally {
    release();
  }
  await expect(page.locator('dialog[open] img')).toHaveAttribute('src', '/media/techhiring/architecture.png');
  const scrollBefore = await gallery.evaluate(el => el.scrollTop);
  await page.locator('dialog[open]').evaluate(async dialog => {
    dialog.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 400 }));
    // The spring writes its first scroll position on the next animation frames.
    for (let frame = 0; frame < 3; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  });
  expect(await gallery.evaluate(el => el.scrollTop)).toBe(scrollBefore);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(/\/work\/techhiring\b/);
});

// Compare the painted image (or its handoff bitmap) with its unprojected layout box.
async function expectFlatGallery(gallery: Locator) {
  await expect.poll(() => gallery.locator('li > img, li > canvas').evaluateAll(assets =>
    assets.length > 0 && assets.every(asset => {
      const frame = asset.parentElement!.getBoundingClientRect();
      const image = asset.getBoundingClientRect();
      const edges = ['left', 'right', 'top', 'bottom'] as const;
      return frame.width > 0 && edges.every(edge => Math.abs(frame[edge] - image[edge]) < 1);
    }),
  )).toBe(true);
}

test('WellMom opens flat from the carousel and reopens at the start after scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 674 });
  await page.goto('/portfolio?speed=30');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const caption = page.locator('.works__caption');
  for (const name of ['TechHiring.id', 'National Food Lakehouse', 'WellMom']) {
    await page.keyboard.press('ArrowRight');
    await expect(caption).toContainText(name);
  }
  const card = page.locator('[data-work="wellmom"] a');
  const entry = page.locator('.case__entry[data-case="wellmom"]');
  const panel = entry.locator('.case__panel');
  const gallery = entry.locator('.case__media');
  for (let visit = 0; visit < 2; visit++) {
    await card.click();
    await expect(panel).toBeFocused();
    await expect(page).toHaveURL(/\/work\/wellmom$/);
    await expect(entry).toHaveCSS('background-color', /^rgb\(/);
    const lead = gallery.locator('li').first();
    await expect(lead).toBeInViewport({ ratio: 1 });
    const leadImage = lead.locator('img');
    const sourceAspect = await leadImage.evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      return img.naturalWidth / img.naturalHeight;
    });
    const box = (await lead.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(sourceAspect, 2);
    expect(await gallery.evaluate(el => el.scrollTop)).toBe(0);
    expect(await panel.evaluate(el => el.scrollTop)).toBe(0);
    await expectFlatGallery(gallery);
    if (visit === 0) {
      await page.mouse.move(400, 450);
      await page.mouse.wheel(0, 550);
      await expect.poll(() => gallery.evaluate(el => el.scrollTop)).toBeGreaterThan(300);
      await expectFlatGallery(gallery);
      await page.mouse.move(1250, 450);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(50);
      await page.keyboard.press('Escape');
      await expect(card).toBeFocused();
      await page.setViewportSize({ width: 1920, height: 674 });
    }
  }
});

test.describe('mobile project gallery', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the diagram is in the scrolling gallery and can be enlarged and dismissed by touch', async ({ page }) => {
    await page.goto('/work/wellmom?speed=30');
    const entry = page.locator('.case__entry[data-case="wellmom"]');
    await expect(entry.locator('.case__panel')).toBeFocused();
    const figure = entry.locator('.case__media .case__arch');
    const opener = figure.locator('[data-zoom]');
    await opener.scrollIntoViewIfNeeded();
    expect(await entry.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(figure.locator('figcaption')).toBeInViewport();
    await opener.tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('img')).toHaveAttribute('src', '/media/wellmom/architecture.png');
    await dialog.getByRole('button').tap();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test('desktop media and case text scroll independently', async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 745 });
  await page.goto('/work/tribunpass?speed=100');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const entry = page.locator('.case__entry:not([hidden])');
  const media = entry.locator('.case__media');
  const panel = entry.locator('.case__panel');
  await page.mouse.move(450, 450);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => media.evaluate(e => e.scrollTop)).toBeGreaterThan(100);
  expect(await panel.evaluate(e => e.scrollTop)).toBe(0);
  await page.mouse.move(1250, 450);
  await page.mouse.wheel(0, 450);
  await expect.poll(() => panel.evaluate(e => e.scrollTop)).toBeGreaterThan(100);
});

test('continued wheel input at the end of the case stays on the case and can reverse', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 674 });
  await page.goto('/work/tribunpass/');
  const panel = page.locator('[data-case=tribunpass] .case__panel');
  await expect(panel).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  const max = await panel.evaluate(el => el.scrollHeight - el.clientHeight);
  await page.mouse.move(1100, 400);
  await page.mouse.wheel(0, max);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 120);
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(max - 1);
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, -240);
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeLessThan(max - 150);
  await expect(page).toHaveURL(/\/work\/tribunpass\/?$/);
});
