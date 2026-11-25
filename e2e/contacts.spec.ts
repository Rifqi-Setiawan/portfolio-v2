import { test, expect } from '@playwright/test';

test('contact form validates the message and prepares a mail draft with the original text', async ({ page })=>{
  await page.goto('/contacts?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const form = page.locator('.contacts__form');
  await form.locator('[name=name]').fill('Rifqi');
  await form.locator('[name=reply]').fill('engineer@example.org');
  await form.locator('[type=submit]').click();
  await expect(form.getByText('Tell me a bit about your project',{exact:true})).toBeVisible();
  const message = 'API migration & reporting\nScope for next quarter?';
  const textarea = form.locator('[name=message]');
  await textarea.fill(message);
  await textarea.evaluate(el => el.scrollIntoView({ block: 'center' }));
  const box = (await textarea.boundingBox())!;
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height + 20, { steps: 4 });
  await page.mouse.up();
  expect((await textarea.boundingBox())!.height).toBeGreaterThan(box.height + 12);
  // Observe the normal mail link before it reaches the OS protocol handler.
  await page.evaluate(()=>{
    document.addEventListener('click', event=>{
      const a=(event.target as Element)?.closest<HTMLAnchorElement>('a[href^="mailto:"]');
      if(a){ event.preventDefault(); document.documentElement.dataset.draft=a.href; }
    },true);
  });
  await form.locator('[type=submit]').click();
  const url = new URL((await page.locator('html').getAttribute('data-draft'))!);
  expect(url.protocol).toBe('mailto:');
  expect(url.pathname).toBe('rifqis232@gmail.com');
  expect(url.searchParams.get('body')).toContain(message);
  expect(url.searchParams.get('body')).toContain('engineer@example.org');
  await expect(page.locator('[data-clock]')).toHaveText(/^(?:[01]\d|2[0-3]):[0-5]\d WIB$/);
});
test('contact panel returns to the previously opened project',async ({page})=>{
  await page.goto('/work/tribunpass?speed=10');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const panel = page.locator('[data-case=tribunpass] .case__panel');
  const readingPosition = await panel.evaluate(el => {el.scrollTop=230; return el.scrollTop;});
  await page.locator('header [data-go=contacts]').click();
  await expect(page.locator('html')).toHaveAttribute('data-state','contacts');
  await expect(panel).toBeVisible();
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('data-state','case');
  await expect(page.locator('[data-case=tribunpass] .case__title')).toBeVisible();
  expect(await panel.evaluate(el => el.scrollTop)).toBe(readingPosition);
});
