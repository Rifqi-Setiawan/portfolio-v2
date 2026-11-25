import { test, expect } from '@playwright/test';
type App={ scenes:{hero?:{count:number}}; director:{idle():Promise<void>;lastDuration:number}; stage:unknown; filmTitles:unknown };
type LiveStage = { renderer: import('three').WebGLRenderer; frames: number };

test('a lost stage shows usable DOM covers and restores the settled About route', async ({ page }) => {
  await page.goto('/portfolio?speed=20');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.evaluate(() => {
    const stage = (window as unknown as { __app: { stage: LiveStage } }).__app.stage;
    stage.renderer.forceContextLoss();
  });
  const stage = page.locator('.stage');
  await expect(stage).toHaveClass(/stage--lost/);
  const cover = page.locator('.is-active .works__thumbnail');
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await page.locator('header [data-go=about]').click();
  await expect(page.locator('html')).toHaveAttribute('data-state', 'about');
  await expect(page.locator('.about__title')).toBeVisible();
  expect(await page.locator('.about__stage').evaluate(el => getComputedStyle(el, '::before').backgroundImage)).toContain('/scenes/about/photo.webp');
  const before = await page.evaluate(() => {
    const stage = (window as unknown as { __app: { stage: LiveStage } }).__app.stage;
    const frames = stage.frames;
    stage.renderer.forceContextRestore();
    return frames;
  });
  await expect(stage).not.toHaveClass(/stage--lost/);
  await expect(stage.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __app: { stage: LiveStage } }).__app.stage.frames)).toBeGreaterThan(before);
});

test('a denied worker uses the still photograph and a navigable project grid', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { value: class {
      constructor() { throw new DOMException('Workers disabled', 'SecurityError'); }
    } });
  });
  await page.goto('/?speed=20');
  await expect(page.locator('.stage')).toHaveClass(/stage--still/);
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.locator('header [data-go=portfolio]').click();
  await expect(page.locator('.works__list')).toHaveCSS('display', 'grid');
  await page.locator('[data-work=tribunpass] a').click();
  await expect(page.locator('html')).toHaveAttribute('data-state', 'case');
});

test('a stalled scene fetch is aborted when the loading deadline expires', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch;
    window.fetch = (input, init) => {
      if (!String(input).endsWith('/hero/depth.webp')) return nativeFetch(input, init);
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => {
        performance.mark('depth-request-aborted');
        reject(init.signal!.reason);
      }, { once: true }));
    };
  });
  await page.goto('/?speed=20', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await expect(page.locator('.stage')).toHaveClass(/stage--still/);
  expect(await page.evaluate(() => performance.getEntriesByName('depth-request-aborted').length)).toBe(1);
});
for(const mode of ['reduced','no WebGL2'] as const){
  test(mode+' navigates through the grid, project, About and Contacts with .3s fades',async ({page})=>{
    if(mode==='reduced') await page.emulateMedia({reducedMotion:'reduce'});
    else await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,id:string,...args:unknown[]){
        if(id==='webgl2') return null;
        return Reflect.apply(original,this,[id,...args]);
      } as typeof original;
    });
    await page.goto('/portfolio?speed=10');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    await expect(page.locator('.stage')).toHaveClass(/stage--still/);
    await expect(page.locator('.works__list')).toHaveCSS('display','grid');
    for(const [selector,kind] of [
      ['[data-work="tribunpass"] a','case'],['header [data-go=about]','about'],
      ['header [data-go=contacts]','contacts'],['header .logo','hero'],
    ]){
      await page.locator(selector).click();
      await expect(page.locator('html')).toHaveAttribute('data-state',kind);
      expect(await page.evaluate(()=>(window as unknown as {__app:App}).__app.director.lastDuration)).toBeCloseTo(.3,2);
    }
    expect(await page.evaluate(()=>(window as unknown as {__app:App}).__app.stage)).toBeNull();
    expect(await page.evaluate(()=>(window as unknown as {__app:App}).__app.filmTitles)).toBeNull();
  });
}
test('portrait mobile stacks hero and case in reading order, landscape shows turn prompt',async ({browser})=>{
  const context=await browser.newContext({baseURL:test.info().project.use.baseURL, viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  try {
    const page=await context.newPage();
    await page.goto('/?speed=20');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    const lead=(await page.locator('.hero__lead').boundingBox())!;
    const role=(await page.locator('.hero__role').boundingBox())!;
    expect(role.y).toBeGreaterThanOrEqual(lead.y+lead.height-1);
    const preset = await (await page.request.get('/scenes/hero/preset.json')).json();
    expect(await page.evaluate(()=>(window as unknown as {__app:App}).__app.scenes.hero?.count)).toBe(preset.particles.countMobile);
    await page.goto('/portfolio?speed=30');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    const filters = page.locator('.filters');
    const caption = page.locator('.works__caption');
    await expect(filters.getByRole('button').first()).toHaveCSS('opacity', '1');
    await expect(caption.locator('.works__title')).toHaveCSS('opacity', '1');
    await expect(caption).toContainText('TribunPass');
    await expect(filters).toBeInViewport({ ratio: 1 });
    await expect(caption).toBeInViewport({ ratio: 1 });
    const card = (await page.locator('[data-work=tribunpass] a').boundingBox())!;
    const bar = (await filters.boundingBox())!;
    const label = (await caption.boundingBox())!;
    expect(card.width).toBeGreaterThan(390 * .6);
    expect(bar.y + bar.height).toBeLessThanOrEqual(card.y);
    expect(label.y).toBeGreaterThanOrEqual(card.y + card.height);
    await page.goto('/work/tribunpass?speed=20');
    await expect(page.locator('html')).not.toHaveClass(/is-intro/);
    const entry=page.locator('[data-case=tribunpass]');
    const first=(await entry.locator('.case__media li').first().boundingBox())!;
    const panel=(await entry.locator('.case__panel').boundingBox())!;
    const second=(await entry.locator('.case__media li').nth(1).boundingBox())!;
    const header = (await page.locator('header').boundingBox())!;
    expect(first.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(Math.abs(first.width-390)).toBeLessThan(2);
    expect(Math.abs(panel.y-first.y-first.height)).toBeLessThan(2);
    expect(second.y).toBeGreaterThanOrEqual(panel.y+panel.height-1);
    await page.setViewportSize({width:844,height:390});
    await expect(page.locator('p.turn')).toBeVisible();
  } finally {await context.close();}
});
test('reduced motion uses plain opacity during a text reveal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?speed=30');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const appearance = await page.locator('.header [data-goo]').first().evaluate(async el => {
    const app = (window as unknown as { __app: { gooIn(el: Element): unknown } }).__app;
    app.gooIn(el);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const style = getComputedStyle(el);
    return { filter: style.filter, transform: style.transform };
  });
  expect(appearance).toEqual({ filter: 'none', transform: 'none' });
});

test('reduced motion returns from a case to the readable hero with the authored fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/work/tribunpass?speed=30');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.locator('header .logo').click();
  await expect(page.locator('html')).toHaveAttribute('data-state', 'hero');
  await expect(page.locator('.hero__role')).toHaveCSS('opacity', '1');
  await expect(page.locator('section.case')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __app: App }).__app.director.lastDuration)).toBeCloseTo(.3);
});
