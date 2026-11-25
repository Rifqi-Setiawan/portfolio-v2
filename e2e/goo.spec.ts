import { test, expect } from '@playwright/test';
type Timeline = ReturnType<typeof import('gsap').gsap.timeline>;

type App = {
  director: { idle(): Promise<void> };
  gooIn(el: Element): Timeline;
  gooOut(el: Element): Timeline;
  releaseGoo(el: Element): void;
};

for (const [path, selector] of [
  ['/contacts', '.contacts__liquid'],
  ['/work/tribunpass/', '[data-case="tribunpass"] .case__title'],
]) {
  test(`a prepared liquid label on ${path} follows its text and restores native ink on a forced finish`, async ({ page }) => {
    await page.goto(path + '?speed=12');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    const label = page.locator(selector).first();
    await expect(label).toHaveAttribute('data-goo-atlas', /.*/);
    const result = await label.evaluate(node => {
      const el = node as HTMLElement;
      const app = (window as unknown as { __app: App }).__app;
      const text = Array.from(el.childNodes).find(child => child.nodeType === Node.TEXT_NODE)!;
      const range = document.createRange();
      range.selectNodeContents(text);
      const native = range.getBoundingClientRect();
      const color = getComputedStyle(el).color;
      app.gooOut(el).pause().progress(.5);
      const mask = el.querySelector<HTMLElement>('.goo-raster');
      const bounds = mask?.getBoundingClientRect();
      const halfway = el.hasAttribute('data-raster-goo') && !!mask?.querySelector('canvas');
      const coversWord = !!bounds && bounds.left <= native.left + 2 && bounds.right >= native.right - 2 &&
        bounds.top < native.bottom && bounds.bottom > native.top;
      app.gooIn(el).pause().progress(1);
      const restored = !el.hasAttribute('data-raster-goo') && getComputedStyle(el).color === color &&
        getComputedStyle(el).opacity === '1' && el.classList.contains('is-in');
      const width = range.getBoundingClientRect().width;
      // A changed wrapping line must never show the stale single-line bitmap.
      text.textContent += ' changed label';
      el.style.width = '3ch';
      el.style.whiteSpace = 'normal';
      el.style.overflowWrap = 'anywhere';
      app.gooOut(el).pause().progress(.5);
      range.selectNodeContents(text);
      const wrapped = range.getClientRects().length > 1;
      const fallback = !el.hasAttribute('data-raster-goo') && el.style.filter.includes('goo-');
      app.releaseGoo(el);
      return { halfway, coversWord, restored, shift: Math.abs(width - native.width), wrapped, fallback };
    });
    expect(result).toEqual({ halfway: true, coversWord: true, restored: true, shift: 0, wrapped: true, fallback: true });
  });
}

test('a text reveal applies its SVG filter, then clears it at its authored endpoint', async ({ page }) => {
  await page.goto('/contacts?speed=100');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const result = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.header [data-goo]')!;
    const app = (window as unknown as { __app: App }).__app;
    const reveal = app.gooIn(el).pause().progress(.25);
    const filter = el.style.filter;
    reveal.progress(1);
    return {
      duration: reveal.duration(), filter,
      settled: { filter: el.style.filter, opacity: getComputedStyle(el).opacity, visible: el.classList.contains('is-in') },
    };
  });
  expect(result.duration).toBeCloseTo(.55);
  expect(result.filter).toContain('goo-');
  expect(result.settled).toEqual({ filter: '', opacity: '1', visible: true });
});

test('an interrupted text reveal yields to the exit and releases its SVG filter', async ({ page }) => {
  await page.goto('/contacts?speed=100');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const result = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.header [data-goo]')!;
    const app = (window as unknown as { __app: App }).__app;
    const reveal = app.gooIn(el).pause().progress(.25);
    const exit = app.gooOut(el).pause().progress(1);
    const interrupted = !reveal.parent;
    const filterId = el.style.filter.match(/#(goo-\d+)/)?.[1];
    const visible = el.classList.contains('is-in');
    const before = !!filterId && !!document.getElementById(filterId);
    app.releaseGoo(el);
    return {
      duration: exit.duration(), interrupted, opacity: getComputedStyle(el).opacity, visible, before,
      removed: !!filterId && !document.getElementById(filterId), filter: el.style.filter,
    };
  });
  expect(result).toEqual({ duration: .3, interrupted: true, opacity: '0', visible: false, before: true, removed: true, filter: '' });
});
