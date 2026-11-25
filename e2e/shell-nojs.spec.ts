import { test, expect } from '@playwright/test';

test('the portfolio and its project reader work with scripting disabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(37, 37, 37)');
  await expect(page.getByRole('heading', { name: 'Muhammad Rifqi Setiawan' })).toBeVisible();
  await page.getByRole('link', { name: 'View all projects' }).click();
  await page.getByRole('link', { name: /PartPilot/ }).click();
  await expect(page.getByRole('heading', { name: 'PartPilot', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data layer' })).toBeVisible();
});

test('the static project reader shows the photos and links its captioned diagram at full size', async ({ page }) => {
  await page.goto('/work/wellmom/');
  const reader = page.locator('.reader');
  await expect(reader.getByRole('img', { name: /mobile app and Puskesmas dashboard/ })).toHaveAttribute('src', '/media/wellmom/01.webp');
  await expect(reader.getByRole('img', { name: /used in the field/ })).toHaveAttribute('src', '/media/wellmom/02.webp');
  const figure = reader.locator('figure').filter({ hasText: 'High-level multi-tier cloud architecture.' });
  await expect(figure.locator('img')).toBeVisible();
  await expect(figure.getByRole('link')).toHaveAttribute('href', '/media/wellmom/architecture.png');
});

test('unknown addresses serve the missing page with working navigation', async ({ page }) => {
  const response = await page.goto('/missing-project-address');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'View all projects' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
});
