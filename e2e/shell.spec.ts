import { test, expect } from '@playwright/test';

const routes: [string, string][] = [
  ['/', 'hero'],
  ['/portfolio', 'portfolio'],
  ['/work/tribunpass', 'case'],
  ['/about', 'about'],
  ['/contacts', 'contacts'],
  ['/About/', 'about'],
  ['/work/TribunPass/', 'case'],
  ['/work', 'portfolio'],
  ['/work/nope', 'portfolio'],
  ['//contacts', 'contacts'],
];

test('shell paints dark before JS', async ({ page }) => {
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).toBe('rgb(37, 37, 37)');
});

test('head script stays within size budget', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  expect(Buffer.byteLength(m![1])).toBeLessThanOrEqual(600);
  expect(m![1]).not.toContain('__SLUGS__');
});

test.describe('head script', () => {
  test.beforeEach(async ({ page }) => {
    // Execute the inline head script but stop the application from finishing the intro.
    await page.route('**/assets/*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  });

  for (const [path, opened] of routes) {
    test(`head script marks opened state ${path}`, async ({ page, baseURL }) => {
      await page.goto(`${baseURL}${path}`);
      const el = page.locator('html');
      await expect(el).toHaveAttribute('data-opened', opened);
      await expect(el).toHaveClass(/(^|\s)js(\s|$)/);
      await expect(el).toHaveClass(/(^|\s)is-intro(\s|$)/);
    });
  }
});
