import { test, expect, type Page } from '@playwright/test';

type Win = { __app: { director: { go(s: unknown): Promise<boolean>; idle(): Promise<void> } } };

async function force(page: Page, state: unknown) {
  await page.goto('/?speed=100');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.evaluate(async (s) => {
    const d = (window as unknown as Win).__app.director;
    await d.idle();
    await d.go(s);
    await d.idle();
  }, state);
}

test.describe('desktop 1568x745', () => {
  test.use({ viewport: { width: 1568, height: 745 } });

  test('case panel is ~33.4% wide and scrolls on its own', async ({ page }) => {
    await force(page, { kind: 'case', slug: 'wellmom' });
    await expect(page.locator('html')).toHaveAttribute('data-state', 'case');
    const panel = page.locator('.case__entry[data-case="wellmom"]:not([hidden]) .case__panel');
    await expect(panel).toBeVisible();
    const w = (await panel.boundingBox())!.width;
    expect(w / 1568).toBeGreaterThan(0.31);
    expect(w / 1568).toBeLessThan(0.35);
    expect(await panel.evaluate((e) => getComputedStyle(e).overflowY)).toBe('auto');
  });

  test('preloader title sits at 6rem (6 x 1568 x .00520833 = 49px)', async ({ page }) => {
    await page.route('**/assets/*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/');
    const left = await page.locator('.preloader__title').evaluate((el) => el.getBoundingClientRect().left);
    expect(Math.abs(left - 6 * 1568 * 0.00520833)).toBeLessThanOrEqual(1);
  });

  test('hero title: lead left of centre, role right of centre; header nav right', async ({ page }) => {
    await page.goto('/?speed=100');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    await expect(page.locator('html')).toHaveAttribute('data-state', 'hero');
    const logo = (await page.locator('header .logo').boundingBox())!;
    const nav = (await page.locator('header .nav').boundingBox())!;
    expect(logo.x).toBeLessThan(100);
    expect(nav.x + nav.width).toBeGreaterThan(1400);
    await expect(page.locator('.hero__lead [data-goo]')).toHaveText(['Software', '&']);
    await expect(page.locator('.hero__tail [data-goo]')).toHaveText(['AI', 'Engineer']);
    for (const [width, height] of [[1536, 674], [1568, 745], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      const bounds = await page.locator('.hero__title [data-goo]').evaluateAll(words => words.map(word => {
        const range = new Range();
        range.selectNodeContents(word);
        const { left, right } = range.getBoundingClientRect();
        return { left, right };
      }));
      const [first, amp, ai, last] = bounds;
      const subjectGap = ai.left - amp.right;
      expect(Math.max(amp.left - first.right, last.left - ai.right)).toBeLessThan(subjectGap);
      expect(Math.abs(first.left - (width - last.right)) / width).toBeLessThan(.02);
      expect(Math.abs((amp.right + ai.left) / (2 * width) - .495)).toBeLessThan(.005);
    }
  });

  test('about: only about section visible', async ({ page }) => {
    await force(page, { kind: 'about' });
    await expect(page.locator('section.about')).toBeVisible();
    await expect(page.locator('section.hero')).toBeHidden();
  });
});

test.describe('mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('case panel is full width', async ({ page }) => {
    await force(page, { kind: 'case', slug: 'wellmom' });
    const panel = page.locator('.case__entry:not([hidden]) .case__panel');
    const box = (await panel.boundingBox())!;
    expect(Math.abs(box.width - 390)).toBeLessThanOrEqual(1);
  });
});
