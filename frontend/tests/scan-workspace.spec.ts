import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { exampleAnalysis } from '../src/demo';
import type { Workspace } from '../src/scan-workspace';
import { fictionalPhoto, ScanPage } from './scan-page';

test.use({ serviceWorkers: 'block' });

const labelName = 'Pine Sample 5 mg';
const scanTitle = 'Scan a medication label';
const resultTitle = 'Read your label';
const historyUrl = /\/api\/saved-scans(?:\?|$)/;
const detail = '**/api/saved-scans/' + exampleAnalysis.id;

const photoInput = (page: Page) => page.getByLabel('Photo file', { exact: true });
const newScan = (page: Page) => page.getByRole('button', { name: 'New scan', exact: true });
const scanLink = (page: Page) => page.getByRole('link', { name: 'Scan', exact: true });
const historyLink = (page: Page) => page.getByRole('link', { name: 'Saved medications', exact: true });
const reading = (page: Page) => page.getByLabel('Reading level', { exact: true });

async function storedWorkspace(page: Page): Promise<Workspace | null> {
  return page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open('presdes-scan-workspace', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction('workspace');
      const read = tx.objectStore('workspace').get('current');
      tx.oncomplete = () => { database.close(); resolve(read.result?.workspace ?? null); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    };
  }));
}

async function emptyHistory(page: Page) {
  await page.route(historyUrl, route => route.fulfill({ json: { items: [], next_before: null } }));
}

test('restores an ordered draft after navigation, refresh and reopening the browser profile', async ({ playwright, browserName, baseURL }, info) => {
  test.setTimeout(60_000);
  const profile = info.outputPath('profile');
  const options = { baseURL, viewport: { width: 390, height: 780 }, serviceWorkers: 'block' as const };
  const first = await playwright[browserName].launchPersistentContext(profile, options);
  try {
    const page = first.pages()[0] ?? await first.newPage();
    await emptyHistory(page);
    await new ScanPage(page).open();
    const png = await readFile(fictionalPhoto);
    await photoInput(page).setInputFiles(['front.png', 'back.png'].map(name => ({ name, mimeType: 'image/png', buffer: png })));
    await page.getByLabel('Explanation language', { exact: true }).selectOption('es');
    await historyLink(page).click();
    await page.getByRole('link', { name: 'PresDes', exact: true }).click();
    await scanLink(page).click();
    await expect(page.getByText('Photo 1 · front.png', { exact: true })).toBeVisible();
    await expect.poll(async () => (await storedWorkspace(page))?.language).toBe('es');
    await page.reload();
    await expect(page.getByText('Photo 2 · back.png', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Explanation language', { exact: true })).toHaveValue('es');
  } finally {
    await first.close();
  }
  const second = await playwright[browserName].launchPersistentContext(profile, options);
  try {
    const page = second.pages()[0] ?? await second.newPage();
    await new ScanPage(page).open();
    await expect(page.getByText('Photo 1 · front.png', { exact: true })).toBeVisible();
    await expect(page.getByText('Photo 2 · back.png', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Explanation language', { exact: true })).toHaveValue('es');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await newScan(page).focus();
    await newScan(page).press('Enter');
    await expect(page.getByRole('heading', { name: scanTitle, exact: true })).toBeFocused();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
    await expect(newScan(page)).toHaveCount(0);
  } finally {
    await second.close();
  }
});

test('restores the result and source photo, checks the bookmark, and clears only the workspace', async ({ page }) => {
  let analyses = 0;
  let bookmark = false;
  let gets = 0;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const stored = () => ({ result: exampleAnalysis, saved_at: exampleAnalysis.created_at, example: false, saved_medication: bookmark });
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', async route => {
    analyses++;
    await wait;
    return route.fulfill({ json: exampleAnalysis, headers: { 'X-PresDes-History': 'saved' } });
  });
  await page.route(historyUrl, route => {
    expect(route.request().method()).toBe('GET');
    const medications = new URL(route.request().url()).searchParams.has('medications');
    const item = { id: exampleAnalysis.id, name: labelName, source_language: 'en', saved_at: exampleAnalysis.created_at, example: false, saved_medication: bookmark };
    return route.fulfill({ json: { items: medications && !bookmark ? [] : [item], next_before: null } });
  });
  await page.route(detail, route => {
    expect(route.request().method()).toBe('GET');
    gets++;
    return route.fulfill({ json: stored() });
  });
  await page.route(detail + '/medication', route => {
    expect(route.request().method()).toBe('PUT');
    bookmark = true;
    return route.fulfill({ status: 204 });
  });

  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await expect.poll(() => analyses).toBe(1);
  await historyLink(page).click();
  await expect(page.getByRole('heading', { name: 'Saved medications', exact: true })).toBeVisible();
  release();
  await scanLink(page).click();
  await expect(page.getByText('Saved to Scan history.', { exact: true })).toBeVisible();
  await reading(page).selectOption('detailed');
  await expect.poll(async () => (await storedWorkspace(page))?.scan?.view.level).toBe('detailed');
  await page.getByRole('button', { name: 'View source photo', exact: true }).click();
  const photo = page.getByRole('img', { name: 'Medication label photo used for this analysis', exact: true });
  const before = await photo.getAttribute('src');

  await historyLink(page).click();
  await page.getByRole('button', { name: 'Scan history', exact: true }).click();
  const open = page.getByRole('button', { name: 'Open saved scan for ' + labelName });
  await open.click();
  await expect(page.getByRole('heading', { name: resultTitle, exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Add to saved medications', exact: true }).press('Enter');
  await expect(page.getByText('Added to saved medications', { exact: true })).toBeVisible();
  await scanLink(page).click();
  await expect(page.getByRole('button', { name: 'Remove from saved medications', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: resultTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove from saved medications', exact: true })).toBeVisible();
  await expect(reading(page)).toHaveValue('detailed');
  await page.getByRole('button', { name: 'View source photo', exact: true }).click();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await photo.getAttribute('src')).not.toBe(before);
  expect((await storedWorkspace(page))?.scan?.result.id).toBe(exampleAnalysis.id);
  expect(analyses).toBe(1);
  expect(gets).toBeGreaterThanOrEqual(3);

  await newScan(page).click();
  await expect(page.getByRole('heading', { name: scanTitle, exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  await expect(newScan(page)).toHaveCount(0);
  await historyLink(page).click();
  await open.click();
  await expect(page.getByRole('button', { name: 'Remove from saved medications', exact: true })).toBeVisible();
  expect(analyses).toBe(1);
});

test('keeps the local result when the corresponding history record was deleted', async ({ page }) => {
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', route => route.fulfill({ json: exampleAnalysis, headers: { 'X-PresDes-History': 'saved' } }));
  await page.route(historyUrl, route => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({ json: { items: [], next_before: null } });
  });
  await page.route(detail, route => route.fulfill({ status: 404, json: { detail: 'Saved scan not found.' } }));
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await expect(page.getByText('Saved to Scan history.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: resultTitle, exact: true })).toBeVisible();
  await expect(page.getByText('This scan is no longer in Scan history.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry saving scan', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to saved medications', exact: true })).toHaveCount(0);
});

test('a reload during analysis restores the photos and waits for an explicit retry', async ({ page }) => {
  let analyses = 0;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', async route => {
    analyses++;
    if (analyses === 1) await waiting;
    await route.fulfill({ json: exampleAnalysis }).catch(() => {});
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await expect.poll(() => analyses).toBe(1);
  await expect.poll(async () => (await storedWorkspace(page))?.analyzing).toBe(true);
  try {
    await page.reload();
    await expect(page.getByText(/Analysis was interrupted/)).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'Review your photo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze label', exact: true })).toBeEnabled();
  expect(analyses).toBe(1);
  await scan.analyze();
  await expect(page.getByRole('heading', { name: resultTitle, exact: true })).toBeVisible();
  expect(analyses).toBe(2);
});

test('reuses completed HEIC previews and retains pending originals after an interrupted conversion', async ({ page, browserName }) => {
  const png = await readFile(fictionalPhoto);
  const first = Buffer.from('original HEIC first');
  const second = Buffer.from('original HEIC second');
  let previews = 0;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/scans/preview', async route => {
    previews++;
    expect(route.request().headers()['content-type']).toBe('image/heic');
    if (browserName === 'chromium') expect(route.request().postDataBuffer()).toEqual(previews === 1 ? first : second);
    if (previews === 2) await waiting;
    await route.fulfill({ contentType: 'image/jpeg', body: png }).catch(() => {});
  });
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', route => {
    if (browserName === 'chromium') {
      const body = route.request().postDataBuffer()!;
      expect(body.includes(first)).toBe(true);
      expect(body.includes(second)).toBe(true);
    }
    return route.fulfill({ json: exampleAnalysis });
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await photoInput(page).setInputFiles([
    { name: 'front.heic', mimeType: 'image/heic', buffer: first },
    { name: 'side.heic', mimeType: 'image/heic', buffer: second },
  ]);
  await expect.poll(() => previews).toBe(2);
  await expect.poll(async () => (await storedWorkspace(page))?.pendingPhotos?.photos.length).toBe(2);
  try {
    await page.reload();
    await expect(page.getByText(/Photo preparation was interrupted/)).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'Review your photo', exact: true })).toBeVisible();
  expect(previews).toBe(2);
  await page.getByRole('button', { name: 'Retry photo preview', exact: true }).click();
  await expect(page.getByText('Photo 2 · front.heic', { exact: true })).toBeVisible();
  await expect(page.getByText('Photo 3 · side.heic', { exact: true })).toBeVisible();
  await expect.poll(async () => (await storedWorkspace(page))?.photos.length).toBe(3);
  await page.reload();
  const preview = page.getByRole('img', { name: 'Medication label photo 2 selected for analysis', exact: true });
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(previews).toBe(3);
  await scan.analyze();
  await expect(page.getByRole('heading', { name: resultTitle, exact: true })).toBeVisible();
});

test('a late analysis in another tab cannot restore a cleared workspace', async ({ context, page }) => {
  let analyses = 0;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await context.route('**/api/scans?*', async route => {
    analyses++;
    await waiting;
    await route.fulfill({ json: exampleAnalysis });
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await expect.poll(() => analyses).toBe(1);
  const other = await context.newPage();
  await new ScanPage(other).open();
  await expect(other.getByText(/Analysis was interrupted/)).toBeVisible();
  await newScan(other).click();
  await expect(other.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  release();
  await expect(page.getByText(/The current scan changed in another tab/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  await expect(newScan(page)).toHaveCount(0);
  expect(analyses).toBe(1);
});

test('refreshing while the clear is still waiting does not bring photos back', async ({ page }) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    let delay = false;
    window.addEventListener('delay-next-workspace-clear', () => { delay = true; });
    IDBFactory.prototype.open = function (name, version) {
      if (delay && name === 'presdes-scan-workspace') return {} as IDBOpenDBRequest;
      return open.call(this, name, version);
    };
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await expect.poll(async () => (await storedWorkspace(page))?.photos.length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('delay-next-workspace-clear')));
  await newScan(page).click();
  await expect(page.getByText('Clearing the current scan…', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  await expect(newScan(page)).toHaveCount(0);
  expect((await storedWorkspace(page))?.photos).toEqual([]);
});

test('an invalid saved workspace can be replaced with a new photo', async ({ page }) => {
  const scan = new ScanPage(page);
  await scan.open();
  await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('presdes-scan-workspace', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put({ version: 1, revision: 'invalid-draft', workspace: { photos: ['blob:invalid'] } }, 'current');
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    };
  }));
  await page.reload();
  const notice = page.getByText('Could not restore the current scan from this browser.', { exact: true });
  await expect(notice).toBeVisible();
  await scan.choosePhoto();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Review your photo', exact: true })).toBeVisible();
});

test('a browser quota error leaves the photos and result usable in the current tab', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'workspace') throw new DOMException('Quota limit', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', route => route.fulfill({ json: exampleAnalysis }));
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  const notice = page.getByText(/Could not save the current scan on this browser/);
  await expect(notice).toBeVisible();
  await scan.analyze();
  await expect(page.getByRole('heading', { name: resultTitle, exact: true })).toBeVisible();
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: 'View source photo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Medication label photo used for this analysis', exact: true })).toBeVisible();
});
