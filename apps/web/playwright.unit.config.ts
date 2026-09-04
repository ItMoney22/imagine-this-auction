import { defineConfig } from '@playwright/test'

/**
 * Pure-logic unit tests.
 *
 * Separate from playwright.config.ts because that config starts a dev server
 * for the browser E2E specs; these tests need no server and no browser.
 *
 * Run with: npm run test:unit
 */
export default defineConfig({
  testDir: './tests/unit',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {},
  projects: [{ name: 'unit' }],
})
