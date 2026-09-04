import { expect, test, type Page } from '@playwright/test'

/**
 * E2E coverage for AI Quick Listing.
 *
 * Credential-dependent flows are skipped unless the environment provides test
 * accounts, so this spec is safe to run on a bare checkout. Set these to run
 * the authenticated paths:
 *
 *   QUICK_LIST_AUCTIONEER_EMAIL / QUICK_LIST_AUCTIONEER_PASSWORD
 *   QUICK_LIST_BIDDER_EMAIL     / QUICK_LIST_BIDDER_PASSWORD
 *   QUICK_LIST_ADMIN_EMAIL      / QUICK_LIST_ADMIN_PASSWORD
 */

const auctioneer = {
  email: process.env.QUICK_LIST_AUCTIONEER_EMAIL,
  password: process.env.QUICK_LIST_AUCTIONEER_PASSWORD,
}

const bidder = {
  email: process.env.QUICK_LIST_BIDDER_EMAIL,
  password: process.env.QUICK_LIST_BIDDER_PASSWORD,
}

const admin = {
  email: process.env.QUICK_LIST_ADMIN_EMAIL,
  password: process.env.QUICK_LIST_ADMIN_PASSWORD,
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
}

test.describe('Quick List access control', () => {
  test('signed-out visitors are sent to login', async ({ page }) => {
    await page.goto('/org/quick-list')
    await expect(page).toHaveURL(/\/login/)
  })

  test('bidders cannot reach the auctioneer workspace', async ({ page }) => {
    test.skip(!bidder.email || !bidder.password, 'bidder credentials not configured')

    await signIn(page, bidder.email!, bidder.password!)
    await page.goto('/org/quick-list')

    // The /org layout redirects non-auctioneers to their own dashboard.
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('the pricing API rejects unauthenticated callers', async ({ request }) => {
    const response = await request.get('/api/ai/quick-list/pricing')
    expect([401, 403, 503]).toContain(response.status())
  })

  test('the identify API rejects unauthenticated callers', async ({ request }) => {
    const response = await request.post('/api/ai/quick-list/identify', {
      data: { idempotency_key: 'test-key-12345678', scan_value: '9780262033848', images: [] },
    })
    expect([401, 403, 503]).toContain(response.status())
  })

  test('the admin AI console rejects non-admins', async ({ request }) => {
    const response = await request.get('/api/admin/ai/pricing')
    expect(response.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('Quick List workspace', () => {
  test.skip(!auctioneer.email || !auctioneer.password, 'auctioneer credentials not configured')

  test.beforeEach(async ({ page }) => {
    await signIn(page, auctioneer.email!, auctioneer.password!)
    await page.goto('/org/quick-list')
  })

  test('shows the capture step with scan and photo entry points', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /AI Quick Listing/i })).toBeVisible()
    await expect(page.getByLabel('Code')).toBeVisible()
    await expect(page.getByText(/Take photo/i)).toBeVisible()
  })

  test('states the auction-integrity guarantees up front', async ({ page }) => {
    await expect(page.getByText(/Verified Original Photos stay unaltered/i)).toBeVisible()
    await expect(page.getByText(/AI images are labelled presentation mockups only/i)).toBeVisible()
  })

  test('shows the credit cost before any generation happens', async ({ page }) => {
    const identifyButton = page.getByRole('button', { name: /Identify this item/i })
    await expect(identifyButton).toBeVisible()

    // The cost badge is rendered inside the button itself.
    await expect(identifyButton).toContainText(/\d+/)
    await expect(page.getByText(/Credits are only deducted if we identify the item/i)).toBeVisible()
  })

  test('identify is disabled until there is a code or a photo', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Identify this item/i })).toBeDisabled()

    await page.getByLabel('Code').fill('9780262033848')
    await expect(page.getByRole('button', { name: /Identify this item/i })).toBeEnabled()
  })

  test('a mis-scanned code is flagged to the auctioneer', async ({ page }) => {
    await page.getByLabel('Code').fill('9780262033847')
    await expect(page.getByText(/Checksum failed/i)).toBeVisible()
  })

  test('shows the ITC balance and the live per-action prices', async ({ page }) => {
    await expect(page.getByText(/ITC balance/i)).toBeVisible()
    await expect(page.getByText(/Credits are deducted only after a successful result/i)).toBeVisible()
  })

  test('the batch queue is present for repeat listing', async ({ page }) => {
    await expect(page.getByText(/Batch queue/i)).toBeVisible()
    await expect(page.getByText(/Scan → draft → approve → next item/i)).toBeVisible()
  })

  test('is usable on a phone-sized viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()

    await expect(page.getByRole('heading', { name: /AI Quick Listing/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Identify this item/i })).toBeVisible()

    // The page must not scroll sideways on mobile.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe('Bidder-facing image integrity', () => {
  test('a lot shows verified originals first, with AI images labelled', async ({ page }) => {
    await page.goto('/lots')

    const firstLot = page.locator('a[href^="/lots/"]').first()
    const lotCount = await page.locator('a[href^="/lots/"]').count()
    test.skip(lotCount === 0, 'no lots available to inspect')

    await firstLot.click()
    await page.waitForURL(/\/lots\/[0-9a-f-]+/)

    const verifiedTab = page.getByRole('button', { name: /Verified Original Photos/i })
    await expect(verifiedTab).toBeVisible()

    // Originals are the default selection.
    await expect(verifiedTab).toHaveAttribute('aria-pressed', 'true')

    const aiTab = page.getByRole('button', { name: /AI-Enhanced/i })

    if (await aiTab.isVisible().catch(() => false)) {
      await aiTab.click()

      await expect(
        page.getByText(
          /AI-generated presentation image\. Refer to verified original photos for the item's actual condition and included contents\./i
        ).first()
      ).toBeVisible()

      // A route back to the truth is always offered.
      await expect(page.getByText(/View the \d+ verified original photo/i)).toBeVisible()
    }
  })
})

test.describe('Admin AI controls', () => {
  test.skip(!admin.email || !admin.password, 'admin credentials not configured')

  test('exposes per-action credit prices and the spend ledger', async ({ page }) => {
    await signIn(page, admin.email!, admin.password!)
    await page.goto('/admin/ai')

    await expect(page.getByRole('heading', { name: /AI Quick Listing Controls/i })).toBeVisible()
    await expect(page.getByText(/AI credit prices/i)).toBeVisible()
    await expect(page.getByText(/AI credit ledger/i)).toBeVisible()

    // Every seeded action must be configurable from here.
    for (const actionKey of [
      'quick_list_identify',
      'quick_list_draft',
      'image_cleanup',
      'image_studio',
      'image_lifestyle',
    ]) {
      await expect(page.getByText(actionKey, { exact: false }).first()).toBeVisible()
    }
  })
})
