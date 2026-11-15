import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { exampleAnalysis } from '../src/demo';
import { fictionalPhoto, ScanPage } from './scan-page';

const fixture = {
  ...exampleAnalysis,
  id: 'f5cda2b4-9d64-4135-a6ac-84d514277da1',
  explanation_language: 'es',
  explanations: {
    simple: 'Solo para demostración.',
    detailed: 'Este envase ficticio es solo para una demostración.',
  },
};

test('scans a fixture and saves, reopens and deletes text on this browser', async ({ page }) => {
  await page.route('**/api/scans?*', async route => {
    expect(route.request().url()).toContain('language=es');
    expect(route.request().headers()['content-type']).toBe('image/png');
    expect(route.request().postDataBuffer()).toEqual(await readFile(fictionalPhoto));
    await route.fulfill({ json: fixture });
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await expect(page.getByRole('heading', { name: 'Review your photo' })).toBeFocused();
  await page.getByLabel('Explanation language').selectOption('es');
  await scan.analyze();
  await expect(page.getByRole('heading', { name: 'Read your label' })).toBeFocused();
  await page.getByRole('button', { name: 'View source photo' }).click();
  await expect(page.getByRole('img', { name: 'Medication label photo used for this analysis' })).toBeVisible();
  await expect(page.getByText(fixture.directions.excerpts[0], { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.printed_dates.excerpts[0], { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.explanations.simple)).toBeVisible();
  await page.getByLabel('Reading level').selectOption('detailed');
  await expect(page.getByText(fixture.explanations.detailed)).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('presdes:scan:')))).toEqual([]);

  await page.getByRole('button', { name: 'Save text on this browser' }).click();
  await expect(page.getByText('Scan text saved on this browser.')).toBeVisible();
  await page.getByRole('link', { name: 'Saved scans' }).click();
  await expect(page.getByRole('heading', { name: 'Saved scans', exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Open saved scan for Pine Sample 5 mg' }).click();
  await expect(page.getByText('Saved scans contain text only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View source photo' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open full-size photo (new tab)' })).toHaveCount(0);
  await expect(page.getByText(fixture.explanations.simple)).toBeVisible();
  await page.getByRole('button', { name: 'Back to saved scans' }).click();
  await expect(page.getByRole('button', { name: 'Open saved scan for Pine Sample 5 mg' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete saved scan for Pine Sample 5 mg' }).click();
  await expect(page.getByRole('heading', { name: 'No saved scans yet' })).toBeVisible();
});

test('keeps the result on screen when local storage cannot save', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('presdes:scan:')) throw new DOMException('Quota full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.route('**/api/scans?*', route => route.fulfill({ json: fixture }));
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await page.getByRole('button', { name: 'Save text on this browser' }).click();
  await expect(page.getByRole('alert')).toContainText('Scan not saved');
  await expect(page.getByText(fixture.directions.excerpts[0], { exact: true })).toBeVisible();
});

test('invalidates responses from a photo replaced during analysis', async ({ page }) => {
  // Let the first response reach the app even after abort, to exercise the request identity check.
  await page.addInitScript(() => {
    const fetcher = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (input !== '/api/scans?language=en') return fetcher(input, init);
      document.documentElement.dataset.firstScanStarted = 'true';
      init?.signal?.addEventListener('abort', () => {
        document.documentElement.dataset.firstScanAborted = 'true';
      });
      return new Promise(resolve => window.addEventListener('complete-first-scan', event => {
        resolve(Response.json((event as CustomEvent).detail));
      }, { once: true }));
    };
  });
  const bytes = await readFile(fictionalPhoto);
  let requests = 0;
  await page.route('**/api/scans?*', async route => {
    requests += 1;
    await route.fulfill({ json: fixture });
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await expect(page.locator('html')).toHaveAttribute('data-first-scan-started', 'true');
  await expect(page.getByRole('button', { name: 'Analyzing…' })).toBeDisabled();
  const firstPhoto = await page.getByRole('img', { name: 'Medication label photo selected for analysis' }).getAttribute('src');
  await page.getByRole('button', { name: 'Retake photo 1' }).click();
  await page.getByLabel('Photo file', { exact: true }).setInputFiles({ name: 'new-label.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.locator('html')).toHaveAttribute('data-first-scan-aborted', 'true');
  await expect(page.getByText('new-label.png')).toBeVisible();
  const currentPhoto = await page.getByRole('img', { name: 'Medication label photo selected for analysis' }).getAttribute('src');
  expect(firstPhoto).not.toBe(currentPhoto);
  await page.getByLabel('Explanation language').selectOption('es');
  await scan.analyze();
  await page.getByRole('button', { name: 'View source photo' }).click();
  await expect(page.getByRole('img', { name: 'Medication label photo used for this analysis' })).toHaveAttribute('src', currentPhoto!);
  await expect(page.getByRole('link', { name: 'Open full-size photo (new tab)' })).toHaveAttribute('href', currentPhoto!);
  await page.evaluate(async stale => {
    window.dispatchEvent(new CustomEvent('complete-first-scan', { detail: stale }));
    await new Promise(requestAnimationFrame);
  }, { ...fixture, medication: { state: 'found', excerpts: ['Stale training label'] } });
  await expect(page.getByText('Stale training label', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Pine Sample 5 mg', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open full-size photo (new tab)' })).toHaveAttribute('href', currentPhoto!);
  expect(requests).toBe(1);
});

test('can retry a failed scan and retake an unreadable image', async ({ page }) => {
  let attempt = 0;
  await page.route('**/api/scans?*', route => {
    attempt += 1;
    return attempt === 1
      ? route.fulfill({ status: 504, json: { detail: 'Analysis took too long. Try again.' } })
      : route.fulfill({ json: { ...fixture, readability: 'unreadable', uncertainties: ['El texto está borroso.'] } });
  });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await scan.analyze();
  await expect(page.getByRole('alert')).toContainText('Analysis took too long');
  await scan.analyze();
  await expect(page.getByRole('heading', { name: 'This label is unreadable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Directions', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'New photo' }).click();
  await expect(page.getByRole('heading', { name: 'Scan a medication label' })).toBeFocused();
  await scan.choosePhoto();
  await expect(page.getByRole('heading', { name: 'Review your photo' })).toBeVisible();
});

test('offers a file fallback when camera permission is denied', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  const scan = new ScanPage(page);
  await scan.open();
  await page.getByRole('button', { name: 'Open camera' }).click();
  await expect(page.getByRole('alert')).toContainText('Camera access was declined');
  await expect(page.getByRole('button', { name: 'Use device camera' })).toBeVisible();
  await scan.choosePhoto();
  await expect(page.getByRole('heading', { name: 'Review your photo' })).toBeVisible();
});

test('captures successive camera views and stops the video track when done', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await page.addInitScript(() => {
    const stop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function () {
      document.documentElement.dataset.trackStopped = 'true';
      stop.call(this);
    };
  });
  const scan = new ScanPage(page);
  await scan.open();
  await page.getByRole('button', { name: 'Open camera' }).click();
  await expect(page.getByLabel('Live camera preview')).toBeVisible();
  await page.getByRole('button', { name: 'Capture photo' }).click();
  await expect(page.getByRole('button', { name: 'Review photo 1' })).toBeVisible();
  await expect(page.getByLabel('Live camera preview')).toBeVisible();
  await page.getByRole('button', { name: 'Capture photo' }).click();
  await expect(page.getByRole('button', { name: 'Review photo 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Done with camera' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-track-stopped', 'true');
  await expect(page.getByRole('heading', { name: 'Review your photos' })).toBeFocused();
  await expect(page.getByText('captured-label-2.jpg', { exact: false })).toBeVisible();
});

test('speaks the selected result language, handles errors and cancels on navigation', async ({ page }) => {
  await page.addInitScript(() => {
    window.speechSynthesis.speak = speech => {
      document.documentElement.dataset.spoken = speech.lang + '|' + speech.text;
      if (speech.text.startsWith('Solo')) queueMicrotask(() => speech.onerror?.(new Event('error') as SpeechSynthesisErrorEvent));
    };
    window.speechSynthesis.cancel = () => {
      const data = document.documentElement.dataset;
      data.speechCancels = String(Number(data.speechCancels ?? 0) + 1);
    };
  });
  await page.route('**/api/scans?*', route => route.fulfill({ json: fixture }));
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await page.getByLabel('Explanation language').selectOption('es');
  await scan.analyze();
  await page.getByRole('button', { name: 'Listen to explanation', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken', 'es-ES|Solo para demostración.');
  await expect(page.getByRole('alert')).toContainText('Read-aloud could not play');
  await page.getByLabel('Reading level').selectOption('detailed');
  await page.getByRole('button', { name: 'Listen to explanation', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken', 'es-ES|' + fixture.explanations.detailed);
  await page.getByLabel('Reading level').selectOption('simple');
  await expect(page.locator('html')).toHaveAttribute('data-speech-cancels', '1');
  await expect(page.getByRole('button', { name: 'Listen to explanation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Listen to directions', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken', 'en-US|' + fixture.directions.excerpts[0]);
  await page.getByRole('link', { name: 'Saved scans' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-speech-cancels', '2');
});

test('announces uncertain or missing label text and speaks any excerpt in its source language', async ({ page }) => {
  await page.addInitScript(() => {
    let current: SpeechSynthesisUtterance | undefined;
    const spoken: Array<{ text: string; language: string }> = [];
    window.speechSynthesis.speak = utterance => {
      current = utterance;
      spoken.push({ text: utterance.text, language: utterance.lang });
      document.documentElement.dataset.speechLog = JSON.stringify(spoken);
    };
    window.speechSynthesis.cancel = () => {};
    window.addEventListener('finish-test-utterance', () => {
      current?.onend?.(new Event('end') as SpeechSynthesisEvent);
    });
  });
  const fragment = 'ملصق للتدريب فقط.';
  const uncertainties = ['El resto de las instrucciones está borroso.', 'La fecha queda fuera de la foto.'];
  await page.route('**/api/scans?*', route => route.fulfill({ json: {
    ...fixture,
    readability: 'partial',
    source_language: 'ar',
    extracted_text: 'Pine Sample 5 mg\n' + fragment,
    directions: { state: 'unclear', excerpts: [fragment] },
    warnings: { state: 'unclear', excerpts: [] },
    printed_dates: { state: 'not_found', excerpts: [] },
    uncertainties,
  } }));
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await page.getByLabel('Explanation language').selectOption('es');
  await scan.analyze();

  const finishUtterance = () => page.evaluate(() => window.dispatchEvent(new Event('finish-test-utterance')));
  const speechLog = () => page.evaluate(() => JSON.parse(document.documentElement.dataset.speechLog ?? '[]'));
  const preface = 'Text for the directions is unclear or incomplete in this photo. Check the printed label or retake the photo. Readable text follows.';
  const spoken: Array<{ text: string; language: string }> = [];

  await page.getByRole('button', { name: 'Listen to directions', exact: true }).click();
  spoken.push({ text: preface, language: 'en-US' });
  expect(await speechLog()).toEqual(spoken);
  await expect(page.getByRole('blockquote').filter({ hasText: fragment })).toHaveAttribute('lang', 'ar');
  await finishUtterance();
  spoken.push({ text: fragment, language: 'ar' });
  expect(await speechLog()).toEqual(spoken);
  await finishUtterance();

  await page.getByRole('button', { name: 'Listen to printed warnings', exact: true }).click();
  spoken.push({
    text: 'Text for printed warnings is unclear or incomplete in this photo. Check the printed label or retake the photo.',
    language: 'en-US',
  });
  await finishUtterance();
  expect(await speechLog()).toEqual(spoken);

  await page.getByRole('button', { name: 'Listen to printed expiration or discard dates', exact: true }).click();
  spoken.push({ text: 'No text for printed expiration or discard dates was found in this photo.', language: 'en-US' });
  await finishUtterance();
  expect(await speechLog()).toEqual(spoken);

  await page.getByRole('button', { name: 'Listen to what may be unclear', exact: true }).click();
  spoken.push({ text: uncertainties.join('\n'), language: 'es-ES' });
  await finishUtterance();
  expect(await speechLog()).toEqual(spoken);

  await page.getByRole('button', { name: 'Listen to directions', exact: true }).click();
  spoken.push({ text: preface, language: 'en-US' });
  await page.getByRole('button', { name: 'Stop reading directions', exact: true }).click();
  await finishUtterance();
  expect(await speechLog()).toEqual(spoken);
  await expect(page.getByRole('button', { name: 'Listen to directions', exact: true })).toBeVisible();
});

test('opens and closes the source photo from the results heading with the keyboard', async ({ page }) => {
  await page.goto('/#scan');
  await page.getByRole('button', { name: 'Try fictional example' }).click();
  await expect(page.getByText('Fictional example · prepared result')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Read your label' })).toBeFocused();
  const photo = page.getByRole('img', { name: 'Fictional Pine Sample training label' });
  await expect(photo).toBeHidden();
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', { name: /^(View|Hide) source photo$/ });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toBeFocused();
  await expect(photo).toBeVisible();
  await page.keyboard.press('Tab');
  const fullSize = page.getByRole('link', { name: 'Open full-size photo (new tab)' });
  await expect(fullSize).toBeFocused();
  await expect(fullSize).toHaveAttribute('target', '_blank');
  await expect(fullSize).toHaveAttribute('href', '/fictional-label.png');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Listen to medication on label' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(photo).toBeHidden();
  await expect(page).toHaveURL('/#scan');
});

test('separates FDA lookup failures from no matches and links the exact record', async ({ page }) => {
  const url = 'https://api.fda.gov/drug/label.json?search=id%3A10afb12c-295a-4820-9b21-116230bae821&limit=1';
  await page.route('**/api/labels?*', route => {
    const name = new URL(route.request().url()).searchParams.get('name');
    if (name === 'Unknown Demo') return route.fulfill({ json: { matches: [] } });
    if (name === 'Unavailable Demo') return route.fulfill({ status: 502, json: { detail: 'The FDA label service is unavailable.' } });
    return route.fulfill({ json: { matches: [{ name: 'Pine Sample', manufacturer: 'Fictional Maker', source_url: url }] } });
  });
  await page.goto('/#reference');
  const name = page.getByLabel('Medication name');
  const submit = page.getByRole('button', { name: 'Search labels' });
  await name.fill('Unknown Demo');
  await submit.click();
  await expect(page.getByRole('status')).toContainText('No label records found');
  await name.fill('Unavailable Demo');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('FDA label service is unavailable');
  await name.fill('Pine Sample');
  await submit.click();
  await expect(page.getByRole('link', { name: 'Open FDA record for Pine Sample (new tab)' })).toHaveAttribute('href', url);
});

test('enlarges result text and fits the expanded photo at mobile and desktop widths in every palette', async ({ page }) => {
  await page.route('**/api/scans?*', route => route.fulfill({ json: {
    ...exampleAnalysis,
    readability: 'partial',
    uncertainties: ['The edge of the label is outside the photo.'],
  } }));
  await page.setViewportSize({ width: 320, height: 740 });
  const scan = new ScanPage(page);
  await scan.open();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await scan.choosePhoto();
  await scan.analyze();
  await expect(page.getByRole('heading', { name: 'What may be unclear' })).toBeVisible();
  await page.getByRole('button', { name: 'View source photo' }).click();
  const excerpts = page.getByRole('blockquote');
  const transcript = page.getByText(exampleAnalysis.extracted_text, { exact: true });
  const form = page.getByLabel('Reading level');
  const control = page.getByRole('button', { name: 'Listen to directions', exact: true });
  const sizes = () => Promise.all([excerpts.nth(1), excerpts.nth(2), excerpts.nth(3), transcript, form, control].map(locator =>
    locator.evaluate(element => parseFloat(getComputedStyle(element).fontSize))));
  const base = await sizes();

  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('checkbox', { name: 'Large text' }).check();
  const large = await sizes();
  large.forEach((size, index) => expect(size).toBeGreaterThan(base[index] * 1.2));
  await page.getByRole('checkbox', { name: 'Large text' }).press('Escape');
  await expect(page.getByRole('button', { name: 'Display' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');

  for (const [dark, contrast] of [[false, false], [false, true], [true, true], [true, false]]) {
    await page.getByRole('button', { name: 'Display' }).click();
    await page.getByRole('checkbox', { name: 'Dark mode' }).setChecked(dark);
    await page.getByRole('checkbox', { name: 'High contrast' }).setChecked(contrast);
    const violations = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.getByRole('button', { name: 'Display' }).click();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 740 });
      await expect(page.getByRole('button', { name: 'Hide source photo' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open full-size photo (new tab)' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    await page.setViewportSize({ width: 320, height: 740 });
  }
  await page.reload();
  await page.getByRole('button', { name: 'Display' }).click();
  await expect(page.getByRole('checkbox', { name: 'Large text' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Dark mode' })).toBeChecked();
});
