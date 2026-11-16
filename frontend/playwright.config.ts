import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E Configuration for Forever Hotel FOSS
 *
 * Viewports verified against approved Final Design Report (Figures 31–39):
 * - Mobile Standard: 375x812 (Figma baseline, iPhone X/11/12 mini)
 * - Mobile Small: 320x568 (iPhone SE / compact mobile boundary)
 * - Modern Mobile: 390x844 (iPhone 12/13/14)
 * - Tablet: 768x1024 (iPad vertical)
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 375, height: 812 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'default',
      use: {
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: 'mobile-small',
      use: {
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: 'mobile-modern',
      use: {
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'tablet-768',
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
  webServer: {
    command: 'npx next dev --webpack -p 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: {
      NEXT_PUBLIC_DEPLOYMENT_ENV: 'development',
      NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE || 'demo',
    },
  },
});
