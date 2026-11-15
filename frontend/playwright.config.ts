import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    { name: 'chromium' },
    {
      name: 'iphone-webkit',
      testMatch: ['**/camera-overlay.spec.ts', '**/heic.spec.ts', '**/scan-ui.spec.ts', '**/scan-workspace.spec.ts'],
      use: {
        ...devices['iPhone 15'],
        browserName: 'webkit',
        serviceWorkers: 'block',
        launchOptions: {},
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
