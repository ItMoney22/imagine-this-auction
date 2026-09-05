import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
config({ path: '.env.qa', quiet: true })
export default defineConfig({
  testDir: './tests', testMatch: 'community-ui.spec.ts', fullyParallel: false, workers: 1,
  reporter: 'list', timeout: 60000, use: { baseURL: 'http://127.0.0.1:3100', ...devices['Pixel 5'] },
})
