import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { exampleAnalysis } from '../src/demo';
import { fictionalPhoto, ScanPage } from './scan-page';

test.use({ serviceWorkers: 'block' });

test('shows pending analysis, honors reduced motion, and preserves the photo for retry', async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', async route => {
    if (++requests === 1) {
      await waiting;
      await route.fulfill({ status: 504, json: { detail: 'Analysis took too long. Try again.' } });
    } else {
      await route.fulfill({ json: exampleAnalysis });
    }
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  const preview = page.getByRole('img', { name: 'Medication label photo selected for analysis', exact: true });
  const selectedPhoto = await preview.getAttribute('src');
  const result = page.getByRole('heading', { name: 'Read your label', exact: true });
  await scan.analyze();

  try {
    const heading = page.getByRole('heading', { name: 'Analyzing your label…', exact: true });
    await expect(heading).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Reading your photos and preparing an explanation.');
    await expect(page.locator('.scan-analysis-preview')).toHaveAttribute('aria-busy', 'true');
    const sweep = page.locator('.scan-sweep');
    await expect(sweep).toHaveCSS('animation-name', 'presdes-label-scan');
    await expect(result).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(sweep).toHaveCSS('animation-name', 'none');
    await expect(heading).toBeVisible();
  } finally {
    release();
  }

  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('alert')).toHaveText('Analysis took too long. Try again.');
  await expect(preview).toHaveAttribute('src', selectedPhoto!);
  await scan.analyze();
  await expect(result).toBeFocused();
  expect(requests).toBe(2);
});

test('keeps mobile capture, format guidance, and review accessible across display settings', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const scan = new ScanPage(page);
  await scan.open();
  const camera = page.getByRole('button', { name: 'Open camera', exact: true });
  await expect(camera).toBeVisible();
  await expect(page.getByText('0 of 4 photos')).toHaveCount(0);
  await camera.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Use device camera', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByText('Photo formats and limits', { exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/24 MB total limit/)).toBeVisible();

  const png = await readFile(fictionalPhoto);
  const photos = ['front', 'side', 'back', 'base'].map(name => ({ name: name + '.png', mimeType: 'image/png', buffer: png }));
  await page.getByLabel('Photo file', { exact: true }).setInputFiles(photos);
  await expect(page.getByRole('heading', { name: 'Review your photos' })).toBeFocused();
  await scan.reviewPhoto(3);
  await expect(page.getByRole('button', { name: 'Review photo 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Photo 3 · back.png', { exact: true })).toBeVisible();
  await expect(page.getByText(/Analysis sends photos to OpenAI/)).toBeVisible();

  const settings = page.getByRole('button', { name: 'Display', exact: true });
  await settings.click();
  for (const label of ['Large text', 'High contrast', 'Dark mode']) {
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  }
  await settings.click();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  expect((await new AxeBuilder({ page }).include('.scan-workspace').analyze()).violations).toEqual([]);
});
