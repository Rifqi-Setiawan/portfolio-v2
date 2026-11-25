import { test, expect, type Page } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

type Win = { __app: { director: { idle(): Promise<void>; state: { kind: string } } } };

test.beforeEach(async ({ page }) => {
  await page.goto('/?speed=30');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '/about';
    a.setAttribute('data-go', 'about');
    document.body.appendChild(a);
  });
});

const clickAbout = (page: Page) =>
  page.evaluate(() => (document.querySelector('[data-go="about"]') as HTMLElement).click());

test('data-go click changes URL and title; back returns to /', async ({ page }) => {
  await clickAbout(page);
  await expect(page).toHaveURL(/\/about$/);
  await page.evaluate(() => (window as unknown as Win).__app.director.idle());
  await expect(page).toHaveTitle('About — Rifqi Setiawan');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/about$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'About — Rifqi Setiawan');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /experience/);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/\?speed=30$/);
  const kind = await page.evaluate(async () => {
    const d = (window as unknown as Win).__app.director;
    await d.idle();
    return d.state.kind;
  });
  expect(kind).toBe('hero');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://v3.rifqisetiawan.my.id/');
});

test('popstate mid-transition resolves to URL state', async ({ page }) => {
  const res = await page.evaluate(async () => {
    (document.querySelector('[data-go="about"]') as HTMLElement).click();
    const popped = new Promise<void>(resolve => addEventListener('popstate', () => resolve(), { once: true }));
    history.back();
    const d = (window as unknown as Win).__app.director;
    await popped;
    await d.idle();
    return { kind: d.state.kind, path: location.pathname };
  });
  expect(res.path).toBe('/');
  expect(res.kind).toBe('hero');
});
