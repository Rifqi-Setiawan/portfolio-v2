import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1568, height: 745 } });

test('arrows move the strip, filters reflow the grid, and the view survives reload', async ({ page }) => {
  await page.goto('/portfolio?speed=100');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  const caption = page.locator('.works__caption');
  await expect(caption).toContainText('TribunPass');
  await page.keyboard.press('ArrowRight');
  await expect(caption).toContainText('TechHiring.id');
  const grid = page.getByRole('button', { name: 'grid view' });
  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-filter="data"]').click();
  await expect(page.locator('[data-work]:not([hidden])')).toHaveCount(3);
  await page.reload();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
});

test('a side card moves to the middle and a second click opens that project', async ({ page }) => {
  await page.goto('/portfolio?speed=100');
  await expect(page.locator('html')).not.toHaveClass(/is-intro/);
  await page.mouse.click(1210, 372);
  await expect(page.locator('.works__caption')).toContainText('TechHiring.id');
  await expect(page).toHaveURL(/\/portfolio\?speed=100$/);
  await page.mouse.click(784, 372);
  await expect(page).toHaveURL(/\/work\/techhiring$/);
});
