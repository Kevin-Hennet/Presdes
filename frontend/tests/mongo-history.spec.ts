import { expect, test } from '@playwright/test';
import { exampleAnalysis } from '../src/demo';
import { ScanPage } from './scan-page';

const prepared = { result: exampleAnalysis, saved_at: '2026-11-14T12:00:00Z', example: true };
const local = { ...exampleAnalysis, id: 'previous-local-scan' };
const localKey = 'presdes:scan:v1:' + local.id;
const summary = {
  id: exampleAnalysis.id, name: 'Pine Sample 5 mg', source_language: 'en',
  saved_at: prepared.saved_at, example: true,
};

test('opts in to MongoDB, reopens and deletes there, and preserves existing browser history', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.hasOwnProperty(key)) localStorage.setItem(key, value);
  }, { key: localKey, value: JSON.stringify(local) });
  let saved = false;
  let session = false;
  let detailReads = 0;
  await page.route('**/api/saved-scans/session', route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-presdes-request']).toBe('1');
    session = true;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/saved-scans', route => {
    if (route.request().method() === 'POST') {
      expect(session).toBe(true);
      expect(route.request().postDataJSON()).toEqual({ result: exampleAnalysis, example: true });
      saved = true;
      return route.fulfill({ json: prepared });
    }
    return route.fulfill({ json: { items: saved ? [summary] : [], next_before: null } });
  });
  await page.route('**/api/saved-scans/' + exampleAnalysis.id, route => {
    if (route.request().method() === 'DELETE') {
      expect(route.request().headers()['x-presdes-request']).toBe('1');
      saved = false;
      return route.fulfill({ status: 204 });
    }
    detailReads += 1;
    return route.fulfill({ json: prepared });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Try fictional example' }).click();
  await expect(page.getByText('Fictional example · prepared result')).toBeVisible();
  expect(saved).toBe(false);
  expect(session).toBe(false);
  await page.getByRole('button', { name: 'View source photo' }).click();
  await expect(page.getByRole('img', { name: 'Fictional Pine Sample training label' })).toBeVisible();
  await page.getByRole('button', { name: 'Save text to MongoDB' }).click();
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Prepared example saved to MongoDB.' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), localKey)).toBe(JSON.stringify(local));

  await page.getByRole('link', { name: 'Saved scans' }).click();
  const open = page.getByRole('button', { name: 'Open saved scan for Pine Sample 5 mg' });
  await expect(open).toBeVisible();
  await page.getByRole('button', { name: 'MongoDB', exact: true }).click();
  await expect(page.getByText('Fictional example', { exact: true })).toBeVisible();
  await open.click();
  expect(detailReads).toBe(1);
  await expect(page.getByText('Stored in MongoDB for this browser session.', { exact: false })).toBeVisible();
  await expect(page.getByText('Fictional example · prepared result')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View source photo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to saved scans' }).click();
  await expect(open).toBeFocused();
  await page.getByRole('button', { name: 'Delete saved scan for Pine Sample 5 mg' }).click();
  await expect(page.getByRole('heading', { name: 'No saved scans on this page' })).toBeVisible();
  await page.getByRole('button', { name: 'This browser' }).click();
  await expect(open).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), localKey)).toBe(JSON.stringify(local));
});

test('keeps an analysis and offers explicit browser saving during a MongoDB outage', async ({ page }) => {
  await page.route('**/api/scans?*', route => route.fulfill({ json: exampleAnalysis }));
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/saved-scans', route => route.fulfill({
    status: 503, json: { detail: 'MongoDB storage is unavailable. Try again later.' },
  }));
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await page.getByRole('button', { name: 'Save text to MongoDB' }).click();
  await expect(page.getByRole('alert')).toContainText('MongoDB save failed');
  await expect(page.getByRole('heading', { name: 'Read your label' })).toBeVisible();
  const browserKey = 'presdes:scan:v1:' + exampleAnalysis.id;
  expect(await page.evaluate(key => localStorage.getItem(key), browserKey)).toBeNull();
  await page.getByRole('button', { name: 'Save text on this browser' }).click();
  await expect(page.getByText('Scan text saved on this browser.')).toBeVisible();
});
