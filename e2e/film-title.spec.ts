type Timeline = ReturnType<typeof import('gsap').gsap.timeline>;
import { test, expect, type Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };
type DItem = Box & { clip: Box; liquid: number; rasters: number };
type DTitle = { name: string; dpr: number; canvas: { width: number; height: number }; rasters: number; items: (DItem | null)[] };
type Win = { __app: { filmTitles: { debugRects(): DTitle[]; setLiquid(el: Element, v: number): void } | null } };

/** Debug draw state of one title plus the DOM rects of its [data-goo] items. */
async function snapshot(page: Page, title: string) {
  return page.evaluate((title) => {
    const d = (window as unknown as Win).__app.filmTitles!.debugRects().find((x) => x.name === title)!;
    const t = document.querySelector('.' + title)!;
    const els = t.matches('[data-goo]') ? [t] : Array.from(t.querySelectorAll('[data-goo]'));
    const dom = els.map((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
    return { d, dom };
  }, title);
}

function near(a: Box, b: Box): void {
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(a[k] - b[k]), k).toBeLessThanOrEqual(1);
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.classList.contains('has-film-titles') && !document.documentElement.classList.contains('is-intro'));
}

test('film titles render through overlay', async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  await page.goto('/?speed=100');
  await ready(page);
  const r = await page.evaluate(() => {
    const title = document.querySelector('.hero__title') as HTMLElement;
    return {
      canvas: !!document.querySelector('canvas.film-titles'),
      color: getComputedStyle(title).color,
      text: title.textContent!.replace(/\s+/g, ' ').trim(),
      z: Number(getComputedStyle(document.querySelector('canvas.film-titles')!).zIndex),
      header: Number(getComputedStyle(document.querySelector('.header')!).zIndex),
    };
  });
  expect(r.canvas).toBe(true);
  const bounds = await page.locator('canvas.film-titles').boundingBox();
  expect(bounds!.height).toBeLessThan(900);
  expect(r.color).toBe('rgba(0, 0, 0, 0)');
  expect(r.text.length).toBeGreaterThan(5);
  // Below the fixed header so scrolled case/about titles pass under it (ruling R11), above every section.
  expect(r.z).toBeLessThan(r.header);
  expect(r.z).toBeGreaterThan(6);
});

test('falls back to svg without webgl2', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto('/?speed=100');
  await page.waitForFunction(() => !!(window as unknown as { __app?: unknown }).__app);
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-intro'));
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => ({
    canvas: !!document.querySelector('canvas.film-titles'),
    ft: (window as unknown as Win).__app.filmTitles,
    colors: Array.from(document.querySelectorAll('.hero__word')).map((el) => getComputedStyle(el).color),
  }));
  expect(r.canvas).toBe(false);
  expect(r.ft).toBeNull();
  for (const c of r.colors) expect(c).not.toBe('rgba(0, 0, 0, 0)');
});

test('refresh re-rasterises on resize', async ({ page }) => {
  await page.setViewportSize({ width: 1568, height: 900 });
  await page.goto('/?speed=100');
  await ready(page);
  await expect.poll(async () => (await snapshot(page, 'hero__title')).d.items.filter(Boolean).length).toBe(4);
  const before = await snapshot(page, 'hero__title');
  expect(before.d.items.length).toBe(4);
  before.d.items.forEach((it, i) => near(it!, before.dom[i]));
  expect(before.d.canvas.width).toBe(Math.round(1568 * before.d.dpr));

  await page.setViewportSize({ width: 1200, height: 900 });
  await expect.poll(async () => (await snapshot(page, 'hero__title')).d.rasters).toBeGreaterThan(before.d.rasters);
  const after = await snapshot(page, 'hero__title');
  after.d.items.forEach((it, i) => near(it!, after.dom[i]));
  expect(after.d.rasters).toBeGreaterThan(before.d.rasters);
  expect(after.d.items[3]!.width).toBeLessThan(before.d.items[3]!.width - 10);
  expect(after.d.canvas.width).toBe(Math.round(1200 * after.d.dpr));
});

test('project titles use readable DOM text when the overlay is active', async ({ page }) => {
  await page.goto('/work/tribunpass?speed=30');
  await ready(page);
  const title = page.locator('.case__entry:not([hidden]) .case__title');
  await expect(title).toBeVisible();
  await expect(page.locator('canvas.film-titles')).toBeHidden();
  await expect(title).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)');
  const managed = await page.evaluate(() => (window as unknown as Win).__app.filmTitles!.debugRects().map(t => t.name));
  expect(managed.sort()).toEqual(['hero__title', 'preloader__title']);
});

test('a screen density change resizes both canvases without changing the viewport', async ({ page }) => {
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const media = match(query);
      if (query.startsWith('(resolution:')) {
        // CDP changes the reported DPR without delivering the monitor's media-query event.
        window.addEventListener('test-display-change', () => media.dispatchEvent(new Event('change')), { once: true });
      }
      return media;
    };
  });
  await page.goto('/?speed=30');
  await ready(page);
  const client = await page.context().newCDPSession(page);
  const { width, height } = page.viewportSize()!;
  for (const deviceScaleFactor of [2, 1]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
    await page.evaluate(() => window.dispatchEvent(new Event('test-display-change')));
    await expect(page.locator('canvas.film-titles')).toHaveJSProperty('width', Math.round(width * Math.min(deviceScaleFactor, 1.5)));
    await expect.poll(() => page.evaluate(({ width, deviceScaleFactor }) => {
      const app = (window as unknown as { __app: { stage: { qualityTier: number } } }).__app;
      return document.querySelector<HTMLCanvasElement>('.stage canvas')!.width
        === Math.round(width * Math.min(deviceScaleFactor, app.stage.qualityTier ? 1 : 1.5));
    }, { width, deviceScaleFactor })).toBe(true);
  }
});

test('gooIn on a film title drives the overlay instead of an svg filter', async ({ page }) => {
  await page.goto('/?speed=30');
  await ready(page);
  const r = await page.evaluate(async () => {
    const el = document.querySelector('.hero__word') as HTMLElement;
    const a = (window as unknown as Win & { __app: { gooIn(el: Element): Timeline } }).__app;
    const liquid = () => a.filmTitles!.debugRects().find((t) => t.name === 'hero__title')!.items[0]!.liquid;
    const tl = a.gooIn(el).pause().progress(.2);
    await new Promise(requestAnimationFrame);
    const mid = { f: el.style.filter, op: parseFloat(getComputedStyle(el).opacity), liquid: liquid() };
    tl.progress(1);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { mid, end: { f: el.style.filter, op: getComputedStyle(el).opacity, cls: el.classList.contains('is-in'), liquid: liquid() } };
  });
  expect(r.mid.f).toBe('');
  expect(r.mid.op).toBeLessThan(1);
  expect(r.mid.liquid).toBeGreaterThan(0.05);
  expect(r.mid.liquid).toBeLessThan(1);
  expect(r.end).toEqual({ f: '', op: '1', cls: true, liquid: 0 });
});
