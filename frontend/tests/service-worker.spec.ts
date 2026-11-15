import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

const legacyWorker = `
const CACHE = 'labellens-shell-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/']))));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
`;

test('upgrades a legacy cache-first install and leaves API traffic uncached', async ({ page }) => {
  const replacement = await readFile('dist/sw.js', 'utf8');
  let deployed = false;
  let apiRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/sw.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
      response.end(deployed ? replacement : legacyWorker);
      return;
    }
    if (request.url === '/api/fixture') {
      response.end(String(++apiRequests));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    response.end(`<!doctype html><title>${deployed ? 'PresDes' : 'LabelLens'}</title>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;

  try {
    await page.goto(url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      await caches.open('another-app');
    });
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(page).toHaveTitle('LabelLens');

    deployed = true;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const changed = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      await registration.update();
      await changed;
    });
    await page.reload();
    await expect(page).toHaveTitle('PresDes');
    expect(await page.evaluate(() => caches.keys())).toEqual(['another-app']);
    expect(await page.evaluate(async () => [await (await fetch('/api/fixture')).text(), await (await fetch('/api/fixture')).text()])).toEqual(['1', '2']);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
