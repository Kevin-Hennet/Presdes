import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { exampleAnalysis } from '../src/demo';
import { fictionalPhoto, ScanPage } from './scan-page';

test.use({ serviceWorkers: 'block' });

test('prepares generic-type HEIC with another photo, retakes it, and analyzes originals', async ({ page, browserName }) => {
  const png = await readFile(fictionalPhoto);
  const original = Buffer.from('original HEIC bytes checked by server');
  let previews = 0;
  await page.route('**/api/scans/preview', async route => {
    expect(route.request().headers()['content-type']).toBe('image/heic');
    // Windows WebKit does not expose file-backed request bodies to its inspector.
    if (browserName === 'chromium') expect(route.request().postDataBuffer()).toEqual(original);
    previews++;
    await route.fulfill({contentType:'image/jpeg',body:png});
  });
  await page.route('**/api/scans?*', async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    if (browserName === 'chromium') {
      const body = route.request().postDataBuffer()!;
      expect(body.includes(original)).toBe(true);
      expect(body.toString()).toContain('image/heic');
      expect(body.includes(png)).toBe(true);
    }
    await route.fulfill({json:exampleAnalysis});
  });
  const scan = new ScanPage(page);
  await scan.open();
  await page.getByLabel('Photo file',{exact:true}).setInputFiles([
    {name:'IMG_1234.HEIC',mimeType:'application/octet-stream',buffer:original},
    {name:'second.png',mimeType:'image/png',buffer:png},
  ]);
  await expect(page.getByRole('heading',{name:'Review your photos'})).toBeVisible();
  const preview = page.getByRole('img',{name:'Medication label photo 1 selected for analysis'});
  await expect.poll(()=>preview.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Retake photo 1',exact:true}).click();
  await page.getByLabel('Photo file',{exact:true}).setInputFiles({name:'retake.heic',mimeType:'image/heic',buffer:original});
  await expect(page.getByText('Photo 1 · retake.heic',{exact:true})).toBeVisible();
  expect(previews).toBe(2);
  await scan.analyze();
  await page.getByRole('button',{name:'View source photos',exact:true}).click();
  await expect(page.getByRole('img',{name:'Medication label source photo 1',exact:true})).toBeVisible();
});

test('locks selection during conversion and preserves earlier photos after a conversion failure', async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/scans/preview', async route => {
    await waiting;
    await route.fulfill({status:422,json:{detail:'This photo could not be opened.'}});
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await page.getByLabel('Photo file',{exact:true}).setInputFiles({name:'broken.heif',mimeType:'image/heif',buffer:Buffer.from('broken')});
  await expect(page.getByText('Preparing iPhone photo preview…')).toBeVisible();
  await expect(page.getByRole('button',{name:'Analyze label',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Open camera',exact:true})).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toHaveText('This photo could not be opened.');
  await expect(page.getByRole('img',{name:'Medication label photo selected for analysis',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Analyze label',exact:true})).toBeEnabled();
});

test('conversion can finish while viewing Saved medications', async ({ page }) => {
  const png = await readFile(fictionalPhoto);
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/saved-scans?*', route => route.fulfill({ json: { items: [], next_before: null } }));
  await page.route('**/api/scans/preview', async route => {
    await wait;
    await route.fulfill({ contentType: 'image/jpeg', body: png });
  });
  await page.goto('/');
  await page.getByLabel('Photo file', { exact: true }).setInputFiles({ name: 'label.heic', mimeType: 'image/heic', buffer: Buffer.from('sample') });
  await expect(page.getByText('Preparing iPhone photo preview…')).toBeVisible();
  await page.getByRole('link', { name: 'Saved medications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved medications', exact: true })).toBeVisible();
  release();
  await page.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your photo' })).toBeVisible();
  const preview = page.getByRole('img', { name: 'Medication label photo selected for analysis', exact: true });
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('New scan aborts a conversion and ignores its late response', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (input !== '/api/scans/preview') return original(input, init);
      document.documentElement.dataset.previewStarted = 'true';
      init?.signal?.addEventListener('abort', () => { document.documentElement.dataset.previewAborted = 'true'; });
      return new Promise(resolve => window.addEventListener('finish-preview', () => resolve(new Response(new Blob(['late']), {headers:{'Content-Type':'image/jpeg'}})), {once:true}));
    };
  });
  await page.goto('/');
  await page.getByLabel('Photo file',{exact:true}).setInputFiles({name:'label.heic',mimeType:'image/heic',buffer:Buffer.from('sample')});
  await expect(page.getByText('Preparing iPhone photo preview…')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.previewStarted)).toBe('true');
  await page.getByRole('button', { name: 'New scan', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-preview-aborted','true');
  await page.evaluate(()=>window.dispatchEvent(new Event('finish-preview')));
  await expect(page.getByRole('heading',{name:'Add label photos',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Review your photo',exact:true})).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New scan', exact: true })).toHaveCount(0);
});
