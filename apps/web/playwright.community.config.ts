import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
config({ path: '.env.qa', quiet: true })
export default defineConfig({
  testDir: './tests', testMatch: 'community-ui.spec.ts', fullyParallel: false, workers: 1,
  reporter: 'list', timeout: 60000, use: { baseURL: process.env.COMMUNITY_TEST_BASE_URL ?? 'http://localhost:3000', ...devices['Pixel 5'] },
})
