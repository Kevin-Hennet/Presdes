import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { exampleAnalysis } from '../src/demo';
import { fictionalPhoto, ScanPage } from './scan-page';

test('uploads, removes and retakes views, then exposes every submitted photo in the result', async ({ page }) => {
  const bytes = await readFile(fictionalPhoto);
  const file = (name: string) => ({ name, mimeType: 'image/png', buffer: bytes });
  let submitted: string[] = [];
  await page.route('**/api/scans?*', async route => {
    const request = route.request();
    const body = new Response(request.postDataBuffer(), { headers: { 'Content-Type': request.headers()['content-type'] } });
    submitted = (await body.formData()).getAll('files').map(part => (part as File).name);
    await route.fulfill({ json: exampleAnalysis });
  });
  await page.setViewportSize({ width: 390, height: 780 });
  const scan = new ScanPage(page);
  await scan.open();
  const upload = page.getByLabel('Photo file', { exact: true });
  await upload.setInputFiles([file('front.png'), file('side.png'), file('extra.png')]);
  await page.getByRole('button', { name: 'Remove photo 3', exact: true }).click();
  await expect(page.getByText('extra.png', { exact: false })).toHaveCount(0);
  const front = await page.getByRole('img', { name: 'Medication label photo 1 selected for analysis' }).getAttribute('src');
  await page.getByRole('button', { name: 'Retake photo 2', exact: true }).click();
  await expect(page.getByText('Retaking photo 2.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze label' })).toBeDisabled();
  await upload.setInputFiles(file('back.png'));
  const back = await page.getByRole('img', { name: 'Medication label photo 2 selected for analysis' }).getAttribute('src');
  await scan.analyze();
  await expect(page.getByRole('heading', { name: 'Read your label' })).toBeFocused();
  expect(submitted).toEqual(['front.png', 'back.png']);
  await page.getByRole('button', { name: 'View source photos' }).click();
  await expect(page.getByRole('img', { name: 'Medication label source photo 1' })).toHaveAttribute('src', front!);
  await expect(page.getByRole('img', { name: 'Medication label source photo 2' })).toHaveAttribute('src', back!);
  await expect(page.getByRole('link', { name: 'Open full-size photo 1 (new tab)' })).toHaveAttribute('href', front!);
  await expect(page.getByRole('link', { name: 'Open full-size photo 2 (new tab)' })).toHaveAttribute('href', back!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('keeps valid selections when photo limits are exceeded', async ({ page }) => {
  const bytes = await readFile(fictionalPhoto);
  const file = (name: string, buffer = bytes) => ({ name, mimeType: 'image/png', buffer });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  const upload = page.getByLabel('Photo file', { exact: true });
  await upload.setInputFiles(['a', 'b', 'c', 'd'].map(name => file(name + '.png')));
  await expect(page.getByRole('alert')).toContainText('up to four');
  await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible();
  await upload.setInputFiles(file('large.png', Buffer.alloc(12 * 1024 * 1024 + 1)));
  await expect(page.getByRole('alert')).toContainText('exceeds 12 MB');
  const nineMiB = Buffer.alloc(9 * 1024 * 1024);
  await upload.setInputFiles(['a', 'b', 'c'].map(name => file(name + '.png', nineMiB)));
  await expect(page.getByRole('alert')).toContainText('exceed 24 MB total');
  await expect(page.getByRole('button', { name: 'Remove photo 2' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Analyze label' })).toBeEnabled();
});

test('returns mismatched bottles to photo review without showing combined instructions', async ({ page }) => {
  const bytes = await readFile(fictionalPhoto);
  const missing = { state: 'not_found', excerpts: [] };
  await page.route('**/api/scans?*', route => route.fulfill({ json: {
    ...exampleAnalysis,
    readability: 'mismatched_labels',
    extracted_text: '',
    source_language: 'und',
    medication: missing, directions: missing, warnings: missing, printed_dates: missing,
    explanations: null,
    uncertainties: ['The photos appear to show different medication names.'],
  } }));
  const scan = new ScanPage(page);
  await scan.open();
  await page.getByLabel('Photo file', { exact: true }).setInputFiles(['first.png', 'second.png'].map(name => ({ name, mimeType: 'image/png', buffer: bytes })));
  await scan.analyze();
  await expect(page.getByRole('heading', { name: 'Scan one bottle at a time' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Directions', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save text to MongoDB' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review photos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your photos' })).toBeFocused();
  await page.getByRole('button', { name: 'Remove photo 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your photo', exact: true })).toBeFocused();
});
