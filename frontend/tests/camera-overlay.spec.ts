import { expect, test, type Locator, type Page } from '@playwright/test';
import { ScanPage } from './scan-page';

async function simulateCamera(page: Page, useNativeStream: boolean) {
  await page.addInitScript(useNative => {
    const root = () => document.documentElement.dataset;
    const videoSources = new WeakMap<HTMLVideoElement, HTMLCanvasElement>();
    const nativeStream = useNative && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });

    // Emulate the same camera frames in WebKit without relying on host media services.
    if (!nativeStream) {
      Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', {
        configurable: true,
        set(this: HTMLVideoElement, media: { source: HTMLCanvasElement } | null) {
          if (media) videoSources.set(this, media.source);
          else videoSources.delete(this);
        },
      });
      Object.defineProperties(HTMLVideoElement.prototype, {
        videoWidth: { configurable: true, get(this: HTMLVideoElement) { return videoSources.get(this)?.width ?? 0; } },
        videoHeight: { configurable: true, get(this: HTMLVideoElement) { return videoSources.get(this)?.height ?? 0; } },
        readyState: { configurable: true, get(this: HTMLVideoElement) { return videoSources.has(this) ? 4 : 0; } },
      });
      HTMLVideoElement.prototype.play = async function () {
        this.dispatchEvent(new Event('loadeddata'));
        this.dispatchEvent(new Event('playing'));
      };
    }

    navigator.mediaDevices.getUserMedia = async () => {
      const source = document.createElement('canvas');
      source.width = 640;
      source.height = 480;
      const drawing = source.getContext('2d')!;
      const camera = nativeStream ? source.captureStream(10) : null;
      const track = camera?.getVideoTracks()[0] ?? Object.assign(new EventTarget(), {
        stop() {}, muted: false, readyState: 'live',
      });
      const stream = camera ?? {
        source, getVideoTracks: () => [track], getTracks: () => [track],
      };
      const stopped = track.stop.bind(track);
      const finish = () => track.dispatchEvent(new Event('ended'));
      let color = false;
      const repaint = window.setInterval(() => {
        drawing.fillStyle = color ? '#294c68' : '#315e7c';
        drawing.fillRect(0, 0, 640, 480);
        drawing.fillStyle = '#fefefe';
        drawing.fillRect(160, 166, 320, 148);
        drawing.fillStyle = '#102a43';
        drawing.font = '30px sans-serif';
        drawing.fillText('Fictional label', 206, 252);
        color = !color;
      }, 50);
      window.addEventListener('end-test-camera', finish, { once: true });
      root().cameraOpens = String(Number(root().cameraOpens ?? 0) + 1);
      track.stop = () => {
        clearInterval(repaint);
        window.removeEventListener('end-test-camera', finish);
        root().cameraStops = String(Number(root().cameraStops ?? 0) + 1);
        stopped();
      };
      return stream as MediaStream;
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D, ...args: Parameters<typeof draw>
    ) {
      const video = args[0];
      if (video instanceof HTMLVideoElement) root().lastCapture = JSON.stringify(args.slice(1));
      const mockedFrame = video instanceof HTMLVideoElement ? videoSources.get(video) : undefined;
      Reflect.apply(draw, this, mockedFrame ? [mockedFrame, ...args.slice(1)] : args);
    };
  }, useNativeStream);
}

async function insideViewport(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox();
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-0.5);
  expect(bounds!.y).toBeGreaterThanOrEqual(-0.5);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 0.5);
  return bounds!;
}

async function assertCaptureCrop(page: Page, preview: Locator) {
  const crop = await page.locator('html').getAttribute('data-last-capture');
  expect(crop).toBeTruthy();
  const [x, y, width, height, , , outputWidth, outputHeight] = JSON.parse(crop!);
  const geometry = await preview.evaluate((video: HTMLVideoElement) => {
    const rect = video.getBoundingClientRect();
    return {
      ratio: rect.width / rect.height,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      fit: getComputedStyle(video).objectFit,
    };
  });
  expect(geometry.fit).toBe('cover');
  expect(width / height).toBeCloseTo(geometry.ratio, 3);
  const scale = Math.min(1, 2560 / Math.max(width, height));
  expect(Math.abs(outputWidth - width * scale)).toBeLessThanOrEqual(0.50001);
  expect(Math.abs(outputHeight - height * scale)).toBeLessThanOrEqual(0.50001);
  expect(x).toBeCloseTo((geometry.videoWidth - width) / 2, 3);
  expect(y).toBeCloseTo((geometry.videoHeight - height) / 2, 3);
  expect(x > 0 || y > 0).toBe(true);
}

test('keeps a full-screen preview and bottom thumbnails through capture, review, retake, remove and reopen', async ({ page, browserName }) => {
  await simulateCamera(page, browserName === 'chromium');
  await page.setViewportSize({ width: 390, height: 780 });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('checkbox', { name: 'Large text' }).check();
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'Open camera' }).click();

  const camera = page.getByRole('dialog', { name: 'Label camera' });
  const preview = camera.getByLabel('Live camera preview');
  const capture = camera.getByRole('button', { name: 'Capture photo', exact: true });
  const done = camera.getByRole('button', { name: 'Done with camera' });
  const thumbs = camera.getByRole('list', { name: 'Selected photos' });
  await expect(camera).toBeVisible();
  await expect(thumbs.getByRole('button', { name: 'Review photo 1' })).toBeVisible();
  const dialogBounds = await insideViewport(camera, page);
  const previewBounds = await insideViewport(preview, page);
  const stripBounds = await insideViewport(thumbs, page);
  expect(dialogBounds.width).toBe(390);
  expect(dialogBounds.height).toBe(780);
  expect(previewBounds.height).toBeGreaterThan(dialogBounds.height / 2);
  expect(stripBounds.y).toBeGreaterThan(previewBounds.y + previewBounds.height);
  await capture.click();
  await expect(thumbs.getByRole('button')).toHaveCount(2);
  await assertCaptureCrop(page, preview);

  await page.setViewportSize({ width: 844, height: 390 });
  await insideViewport(capture, page);
  await insideViewport(done, page);
  await insideViewport(thumbs, page);
  await capture.click();
  await expect(thumbs.getByRole('button')).toHaveCount(3);
  await assertCaptureCrop(page, preview);
  await capture.click();
  await expect(capture).toBeDisabled();
  await expect(thumbs.getByRole('button')).toHaveCount(4);
  for (const thumb of await thumbs.getByRole('button').all()) await insideViewport(thumb, page);

  const second = thumbs.getByRole('button', { name: 'Review photo 2' });
  const before = await second.locator('img').getAttribute('src');
  await second.click();
  await expect(camera.getByRole('img', { name: 'Selected label photo 2' })).toHaveAttribute('src', before!);
  const back = camera.getByRole('button', { name: 'Back to camera' });
  await expect(back).toBeFocused();
  await back.click();
  await expect(second).toBeFocused();
  await second.click();
  await camera.getByRole('button', { name: 'Retake photo 2' }).click();
  await expect(camera.getByText('Retaking photo 2', { exact: true })).toBeVisible();
  await camera.getByRole('button', { name: 'Capture replacement photo' }).click();
  await expect(camera.getByText('Photo 2 replaced.', { exact: true })).toHaveCount(1);
  await expect(second.locator('img')).not.toHaveAttribute('src', before!);
  await expect(thumbs.getByRole('button')).toHaveCount(4);
  await expect(page.locator('html')).toHaveAttribute('data-camera-opens', '1');

  await done.click();
  await expect(camera).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Review your photos' })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-camera-stops', '1');
  await page.getByRole('button', { name: 'Open camera' }).click();
  await expect(thumbs.getByRole('button')).toHaveCount(4);
  await thumbs.getByRole('button', { name: 'Review photo 3' }).click();
  await camera.getByRole('button', { name: 'Remove photo 3' }).click();
  await expect(thumbs.getByRole('button')).toHaveCount(3);
  await expect(capture).toBeEnabled();
  await done.click();
  await expect(page.getByRole('button', { name: 'Analyze label' })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-camera-stops', '2');
});

test('contains keyboard focus, locks page scroll and releases the camera on Escape or interruption', async ({ page, browserName }) => {
  await simulateCamera(page, browserName === 'chromium');
  await page.setViewportSize({ width: 320, height: 665 });
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  const open = page.getByRole('button', { name: 'Open camera' });
  await open.focus();
  await open.press('Enter');
  const camera = page.getByRole('dialog', { name: 'Label camera' });
  const done = camera.getByRole('button', { name: 'Done with camera' });
  const thumb = camera.getByRole('button', { name: 'Review photo 1' });
  await expect(done).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe('fixed');
  await page.keyboard.press('Shift+Tab');
  await expect(thumb).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(done).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(camera).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-camera-stops', '1');
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe('static');

  await open.click();
  await expect(camera.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('end-test-camera')));
  await expect(camera).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('The camera disconnected');
  await expect(open).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-camera-stops', '2');
  await expect(page.getByRole('button', { name: 'Analyze label' })).toBeEnabled();
});

test('backgrounding closes the camera and keeps selected photos available', async ({ page, browserName }) => {
  await simulateCamera(page, browserName === 'chromium');
  const scan = new ScanPage(page);
  await scan.open();
  await scan.choosePhoto();
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  const camera = page.getByRole('dialog', { name: 'Label camera', exact: true });
  await expect(camera.getByRole('button', { name: 'Capture photo', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(camera).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-camera-stops', '1');
  await expect(page.getByRole('heading', { name: 'Review your photo', exact: true })).toBeVisible();
});
