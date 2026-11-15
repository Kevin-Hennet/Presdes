import { expect, test } from '@playwright/test';
import { exampleAnalysis } from '../src/demo';
import { ScanPage } from './scan-page';

const historyUrl = /\/api\/saved-scans(?:\?|$)/;
const detailUrl = '**/api/saved-scans/' + exampleAnalysis.id;
const bookmarkUrl = detailUrl + '/medication';
const summary = {
  id: exampleAnalysis.id, name: 'Pine Sample 5 mg', source_language: 'en',
  saved_at: '2026-11-14T12:00:00Z', example: false,
};
const stored = { result: exampleAnalysis, saved_at: summary.saved_at, example: false };

test('auto-saves, bookmarks once, reopens, unmarks without deleting, and deletes explicitly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  let hasScan = false;
  let bookmarked = false;
  let adds = 0;
  let releaseBookmark!: () => void;
  const bookmarkDelay = new Promise<void>(resolve => { releaseBookmark = resolve; });
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', route => {
    expect(route.request().headers()['x-presdes-request']).toBe('1');
    hasScan = true;
    return route.fulfill({ json: exampleAnalysis, headers: { 'X-PresDes-History': 'saved' } });
  });
  await page.route(historyUrl, route => {
    expect(route.request().method()).toBe('GET');
    const medications = new URL(route.request().url()).searchParams.has('medications');
    const items = hasScan && (!medications || bookmarked) ? [{ ...summary, saved_medication: bookmarked }] : [];
    return route.fulfill({ json: { items, next_before: null } });
  });
  await page.route(detailUrl, route => {
    if (route.request().method() === 'DELETE') {
      expect(route.request().headers()['x-presdes-request']).toBe('1');
      hasScan = false;
      bookmarked = false;
      return route.fulfill({ status: 204 });
    }
    expect(hasScan).toBe(true);
    return route.fulfill({ json: { ...stored, saved_medication: bookmarked } });
  });
  await page.route(bookmarkUrl, async route => {
    expect(route.request().headers()['x-presdes-request']).toBe('1');
    expect(hasScan).toBe(true);
    if (route.request().method() === 'PUT') {
      adds += 1;
      await bookmarkDelay;
      bookmarked = true;
    } else {
      expect(route.request().method()).toBe('DELETE');
      bookmarked = false;
    }
    await route.fulfill({ status: 204 });
  });

  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await expect(page.getByText(/saved automatically in Scan history/)).toBeVisible();
  await scan.analyze();
  await expect(page.getByText('Saved to Scan history.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep this scan' })).toHaveCount(0);
  const source = page.getByRole('button', { name: 'View source photo' });
  const add = page.getByRole('button', { name: 'Add to saved medications' });
  const explanation = page.getByRole('heading', { name: 'AI explanation' });
  const [sourceBox, bookmarkBox, explanationBox] = await Promise.all([source.boundingBox(), add.boundingBox(), explanation.boundingBox()]);
  expect(sourceBox!.y).toBeLessThanOrEqual(bookmarkBox!.y);
  expect(bookmarkBox!.y).toBeLessThan(explanationBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole('link', { name: 'Saved medications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No saved medications yet' })).toBeVisible();
  const history = page.getByRole('button', { name: 'Scan history', exact: true });
  const open = page.getByRole('button', { name: 'Open saved scan for Pine Sample 5 mg' });
  await history.click();
  await open.click();
  await expect(explanation).toBeVisible();
  await expect(source).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(add).toBeFocused();
  await page.keyboard.press('Enter');
  const adding = page.getByRole('button', { name: 'Adding medication…', exact: true });
  await expect(adding).toBeFocused();
  await expect(adding).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => adds).toBe(1);
  await expect(page.getByText('Added to saved medications', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Enter');
  releaseBookmark();
  const remove = page.getByRole('button', { name: 'Remove from saved medications', exact: true });
  await expect(remove).toBeFocused();
  await expect(page.getByText('Added to saved medications', { exact: true })).toBeVisible();
  expect(adds).toBe(1);

  await page.reload();
  await open.click();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(add).toBeVisible();
  const back = page.getByRole('button', { name: 'Back to list' });
  await back.click();
  await expect(page.getByRole('heading', { name: 'No saved medications yet' })).toBeVisible();
  await history.click();
  await open.click();
  await expect(page.getByText(exampleAnalysis.explanations!.simple, { exact: true })).toBeVisible();
  await add.click();
  await expect(remove).toBeVisible();
  await back.click();
  await expect(open).toBeFocused();
  await page.getByRole('button', { name: 'Delete scan and saved medication for Pine Sample 5 mg' }).click();
  await expect(page.getByRole('heading', { name: 'No scans in this history' })).toBeVisible();
  await page.getByRole('button', { name: 'Saved medications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No saved medications yet' })).toBeVisible();
});

test('keeps the result on an autosave failure and retries the same scan without more analysis', async ({ page }) => {
  let analyses = 0;
  let retries = 0;
  let adds = 0;
  let releaseSave!: () => void;
  const saveDelay = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route('**/api/saved-scans/session', route => route.fulfill({ status: 204 }));
  await page.route('**/api/scans?*', route => {
    analyses += 1;
    return route.fulfill({ json: exampleAnalysis, headers: { 'X-PresDes-History': 'failed' } });
  });
  await page.route(historyUrl, async route => {
    retries += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ result: exampleAnalysis });
    if (retries === 1) return route.fulfill({ status: 503, json: { detail: 'Scan history is unavailable.' } });
    await saveDelay;
    return route.fulfill({ json: { ...stored, saved_medication: false } });
  });
  await page.route(bookmarkUrl, route => {
    adds += 1;
    return route.fulfill({ status: 204 });
  });

  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await expect(page.getByRole('heading', { name: 'Read your label' })).toBeVisible();
  await expect(page.getByText('Could not save this scan.')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry saving scan' });
  await retry.click();
  await expect(page.getByText('Could not save this scan.')).toBeVisible();

  await page.getByRole('button', { name: 'Add to saved medications' }).click();
  await expect(page.getByText('Saving this scan…')).toBeVisible();
  await expect(retry).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => retries).toBe(2);
  await retry.evaluate((button: HTMLButtonElement) => button.click());
  expect(adds).toBe(0);
  releaseSave();
  await expect(page.getByText('Saved to Scan history.')).toBeVisible();
  await expect(page.getByText('Added to saved medications', { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
  expect({ analyses, retries, adds }).toEqual({ analyses: 1, retries: 2, adds: 1 });
});

for (const webLocks of [true, false]) {
  test(`serializes first-time history sessions across tabs with ${webLocks ? 'Web Locks' : 'IndexedDB'}`, async ({ context, page }) => {
    if (!webLocks) {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'locks', { value: undefined });
        const get = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function (key) {
          if (this.name === 'leases') {
            const data = document.documentElement.dataset;
            data.leaseReads = String(Number(data.leaseReads ?? '0') + 1);
          }
          return get.call(this, key);
        };
      });
    }
    const other = await context.newPage();
    let sessions = 0;
    let releaseSession!: () => void;
    const sessionDelay = new Promise<void>(resolve => { releaseSession = resolve; });
    const cookie = 'presdes_history=owner-session';
    await context.route('**/api/saved-scans/session', async route => {
      sessions += 1;
      if (sessions === 1) {
        await sessionDelay;
        return route.fulfill({ status: 204, headers: { 'Set-Cookie': cookie + '; Path=/; HttpOnly; SameSite=Strict' } });
      }
      expect((await route.request().allHeaders()).cookie).toBe(cookie);
      return route.fulfill({ status: 204 });
    });
    await context.route('**/api/scans?*', async route => {
      expect((await route.request().allHeaders()).cookie).toBe(cookie);
      return route.fulfill({ json: exampleAnalysis, headers: { 'X-PresDes-History': 'saved' } });
    });
    const tabs = [new ScanPage(page), new ScanPage(other)];
    for (const tab of tabs) {
      await tab.open();
      await tab.choosePhoto();
    }
    await tabs[0].analyze();
    await expect.poll(() => sessions).toBe(1);
    await tabs[1].analyze();
    const queued = () => other.evaluate(async () => navigator.locks
      ? (await navigator.locks.query()).pending?.length === 1
      : Number(document.documentElement.dataset.leaseReads) > 0);
    await expect.poll(queued).toBe(true);
    expect(sessions).toBe(1);
    releaseSession();
    for (const tab of tabs) {
      await expect(tab.page.getByText('Saved to Scan history.')).toBeVisible();
    }
    expect(sessions).toBe(2);
  });
}
