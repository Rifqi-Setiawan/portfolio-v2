import { test, expect, type Page } from '@playwright/test';
import { CONTACTS, PM, PORTRAIT, SD } from '../src/core/timings';
type App = {
  director: { idle(): Promise<void>; lastDuration: number };
  scenes: { about?: { u: { uSplit: { value: number } } }; hero?: { u: { uFly: { value: number } } } };
};
async function settled(page: Page) {
  return page.evaluate(async () => {
    const app = (window as unknown as {__app:App}).__app;
    await app.director.idle();
    return { duration: app.director.lastDuration, split: app.scenes.about?.u.uSplit.value, flight: app.scenes.hero?.u.uFly.value };
  });
}
test('the engine reveals the About split and restores the hero title on return',async ({page}) => {
  await page.goto('/?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.evaluate(() => {
    const article = document.querySelector<HTMLElement>('.about__content')!;
    const observer = new MutationObserver(() => {
      if (article.classList.contains('is-revealed')) {
        const app = (window as unknown as { __app: App }).__app;
        article.dataset.splitAtReveal = String(app.scenes.about?.u.uSplit.value);
        observer.disconnect();
      }
    });
    observer.observe(article, { attributes: true, attributeFilter: ['class'] });
  });
  await page.locator('header [data-go=about]').click();
  await expect(page).toHaveURL(/\/about$/);
  const state = await settled(page);
  expect(state.split).toBe(1);
  expect(state.duration).toBeCloseTo(PORTRAIT.aboutEnd, 2);
  await expect(page.locator('.about__content')).toHaveAttribute('data-split-at-reveal', '1');
  const metrics = page.locator('.about__stat strong');
  await metrics.first().scrollIntoViewIfNeeded();
  await expect(metrics).toHaveText(['8','3×','100+','3.80']);
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('data-state','hero');
  await expect(page.locator('.hero__role')).toHaveClass(/is-in/);
});

test('the Contacts portrait survives both cross-routes and releases the hero on return', async ({ page }) => {
  await page.goto('/?speed=12');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  for (const kind of ['contacts', 'about', 'contacts', 'hero']) {
    await page.locator(`header [data-go="${kind}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-state', kind);
    if (kind === 'contacts') {
      expect((await settled(page)).split).toBe(0);
      const eyes = page.locator('canvas.contacts__eyes[data-ready]');
      await expect(eyes).toBeVisible();
      await expect(page.locator('.contacts__photo')).toBeHidden();
      expect(await eyes.evaluate(canvas => {
        const context = (canvas as HTMLCanvasElement).getContext('2d')!;
        return context.getImageData(0, 0, context.canvas.width, context.canvas.height).data.some((v, i) => i % 4 === 3 && v > 0);
      })).toBe(true);
      await expect(page.locator('.contacts__form')).toHaveCSS('opacity', '1');
    } else if (kind === 'about') {
      expect((await settled(page)).split).toBe(1);
      await expect(page.locator('.stage canvas')).toHaveCSS('clip-path', 'none');
      await expect(page.locator('html')).not.toHaveClass(/is-expanding-eyes/);
      await expect(page.locator('.about__lead')).toBeVisible();
    }
  }
  await expect(page.locator('html')).not.toHaveClass(/is-folding-title|is-contact-overlay/);
  await expect(page.locator('.hero__role')).toHaveClass(/is-in/);
});
for (const path of ['/portfolio', '/work/tribunpass/']) {
  test(path + ' reaches Contacts by the room flight and returns to Portfolio', async ({ page }) => {
    await page.goto(path + '?speed=10');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    await page.locator('header [data-go=contacts]').click();
    await expect(page.locator('html')).toHaveAttribute('data-state', 'contacts');
    const landing = await settled(page);
    expect(landing.flight).toBe(1);
    expect(landing.split).toBe(0);
    const windowAt = PORTRAIT.contactsAt - (PORTRAIT.flyAt - PORTRAIT.workRoomAt);
    expect(landing.duration).toBeCloseTo(windowAt + PORTRAIT.formAt + SD.out);
    await expect(page.locator('canvas.contacts__eyes[data-ready]')).toHaveCSS('opacity', '1');
    await expect(page.locator('.contacts__photo')).toBeHidden();

    await page.locator('header [data-go=portfolio]').click();
    await expect(page.locator('html')).toHaveAttribute('data-state', 'portfolio');
    const room = await settled(page);
    const expandedAt = CONTACTS.eyesExpandAt + CONTACTS.photoToInk + CONTACTS.photoShrink;
    const flightDuration = PORTRAIT.faceAt - PORTRAIT.flyAt;
    expect(room.duration).toBeCloseTo(expandedAt + PORTRAIT.focusDuration + flightDuration + PM.heroPortfolio);
    expect(room.flight).toBe(0);
    await expect(page.locator('.works__caption')).toBeVisible();
  });
}
for (const [kind, path] of [['portfolio', '/portfolio'], ['case', '/work/tribunpass/']]) {
  test(kind + ' flies through the room to About and restores the work on Back', async ({ page }) => {
    await page.goto(path + '?speed=10');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    // Direct work links prepare the portrait after entry, before the About click.
    await page.waitForFunction(() => !!(window as unknown as { __app: App }).__app.scenes.about);
    await page.locator('header [data-go=about]').click();
    await expect(page.locator('html')).toHaveAttribute('data-state', 'about');
    const state = await settled(page);
    expect(state.duration).toBeCloseTo(PORTRAIT.aboutEnd - PORTRAIT.flyAt + PORTRAIT.workRoomAt, 2);
    expect(state.flight).toBe(1);
    expect(state.split).toBe(1);
    await expect(page.locator('.about__content')).toHaveClass(/is-revealed/);
    await page.goBack();
    await expect(page.locator('html')).toHaveAttribute('data-state', kind);
    const backDuration = kind === 'portfolio'
      ? PORTRAIT.portfolioPullAt + PORTRAIT.faceAt - PORTRAIT.flyAt + PM.heroPortfolio : PM.aboutPortfolio;
    expect((await settled(page)).duration).toBeCloseTo(backDuration, 2);
    const target = kind === 'case' ? '[data-case="tribunpass"] .case__panel' : '.works__caption';
    await expect(page.locator(target)).toBeVisible();
  });
}
