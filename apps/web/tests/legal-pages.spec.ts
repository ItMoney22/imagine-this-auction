import { test, expect } from '@playwright/test'

// Public legal / marketing pages that the payment processor's underwriter
// reviews on the live domain. Each must render its own distinctive H1 and the
// site-wide footer, and must not fall through to the 404 page.
const PAGES: { path: string; heading: RegExp }[] = [
  { path: '/pricing', heading: /^Pricing$/ },
  { path: '/terms', heading: /^Terms of Service$/ },
  { path: '/privacy', heading: /^Privacy Policy$/ },
  { path: '/refunds', heading: /^Refund Policy$/ },
  { path: '/contact', heading: /^Contact Us$/ },
  { path: '/drive', heading: /^Drive for us$/ },
]

const FOOTER_ROUTES = [
  '/auctions',
  '/how-it-works',
  '/pricing',
  '/drive',
  '/terms',
  '/privacy',
  '/refunds',
  '/contact',
]

test.describe('legal and info pages', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders its heading and the footer`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status(), `${path} should not 404`).toBeLessThan(400)

      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await expect(page.getByRole('heading', { name: /page not found/i })).toHaveCount(0)

      const footer = page.getByTestId('site-footer')
      await expect(footer).toBeVisible()
      for (const route of FOOTER_ROUTES) {
        await expect(
          footer.locator(`a[href="${route}"]`),
          `footer on ${path} should link to ${route}`
        ).toHaveCount(1)
      }
      await expect(footer).toContainText('2026 Imagine This Auction')
    })
  }

  test('/pricing shows the founding rate and the HiBid comparison', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByText('1.2%', { exact: true })).toBeVisible()
    await expect(page.getByRole('table')).toContainText('$0.25 per unique bid')
    await expect(page.getByRole('table')).toContainText(
      'HiBid and AuctionFlex 360 published pricing, September 2026'
    )
    // Business decision 2026-09-04: no prepaid currency anywhere on pricing.
    await expect(page.locator('main')).not.toContainText(/\bITC\b/)
  })

  test('/terms has the governing-law placeholder for David to fill', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.locator('#law')).toContainText('[STATE]')
  })

  test('/contact shows the support email and mailing address placeholder', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.getByRole('link', { name: 'support@imaginethisauction.com' })).toBeVisible()
    await expect(page.getByText('[MAILING ADDRESS]')).toBeVisible()
  })

  test('navbar links to /pricing', async ({ page, isMobile }) => {
    await page.goto('/')
    // Scoped to the header navbar; the footer also has a nav with a /pricing
    // link, so an unscoped `nav a[href="/pricing"]` would pass without it.
    const navbar = page.getByTestId('site-navbar')
    if (isMobile) {
      await navbar.getByRole('button', { name: 'Toggle navigation menu' }).click()
    }
    await expect(navbar.locator('a[href="/pricing"]').first()).toBeVisible()
    await expect(page.getByTestId('site-footer').locator('a[href="/pricing"]')).toHaveCount(1)
  })
})

test.describe('signup terms checkbox', () => {
  test('signup requires agreeing to the Terms before submitting', async ({ page }) => {
    await page.goto('/signup')

    const checkbox = page.getByRole('checkbox', { name: /I agree to the Terms of Service and Privacy Policy/ })
    const submit = page.getByRole('button', { name: 'Sign Up' })

    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()
    await expect(submit).toBeDisabled()

    await expect(page.locator('form a[href="/terms"]')).toHaveCount(1)
    await expect(page.locator('form a[href="/privacy"]')).toHaveCount(1)

    await checkbox.check()
    await expect(submit).toBeEnabled()

    // The magic-link form is gated the same way.
    await page.getByRole('button', { name: 'Magic Link' }).click()
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeEnabled()
    await page.getByRole('checkbox', { name: /I agree to the Terms of Service/ }).uncheck()
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeDisabled()
  })

  test('login does not show the terms checkbox', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled()
  })
})
