import { test, expect } from '@playwright/test'

import {
  GOVERNING_LAW_STATE,
  LEGAL_LAST_UPDATED,
  LEGAL_LAST_UPDATED_LABEL,
  MAILING_ADDRESS,
  SUPPORT_EMAIL,
  isPlaceholder,
} from '../lib/legal/company'
import { COMPETITOR_CAPTION } from '../lib/pricing/competitors'

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

// The three documents that carry a "Last updated" date.
const LEGAL_DOCUMENTS = ['/terms', '/privacy', '/refunds']

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
      await expect(footer).toContainText(/© \d{4} Imagine This Auction/)
    })
  }

  for (const path of LEGAL_DOCUMENTS) {
    test(`${path} shows the machine-readable last-updated date`, async ({ page }) => {
      await page.goto(path)
      const updated = page.locator('main time').first()
      await expect(updated).toHaveAttribute('datetime', LEGAL_LAST_UPDATED)
      await expect(updated).toHaveText(LEGAL_LAST_UPDATED_LABEL)
    })
  }

  test('/pricing shows the founding rate and the HiBid comparison', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByText('1.2%', { exact: true })).toBeVisible()
    await expect(page.getByRole('table')).toContainText('$0.25 per unique bid')
    await expect(page.getByRole('table')).toContainText(COMPETITOR_CAPTION)
    // Business decision 2026-09-04: no prepaid currency anywhere on pricing.
    await expect(page.locator('main')).not.toContainText(/\bITC\b/)
  })

  test('/terms names the governing-law state from lib/legal/company', async ({ page }) => {
    await page.goto('/terms')
    const law = page.locator('#law')
    await expect(law).toContainText(GOVERNING_LAW_STATE)
    // While the value is still a bracketed placeholder it must be drawn as
    // one (dashed outline, "to be filled in"), never styled as real content.
    await expect(law.locator('[data-placeholder]')).toHaveCount(isPlaceholder(GOVERNING_LAW_STATE) ? 1 : 0)
  })

  test('/contact shows the support email and mailing address', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.getByRole('link', { name: SUPPORT_EMAIL })).toBeVisible()
    await expect(page.getByText(MAILING_ADDRESS)).toBeVisible()
    await expect(
      page.locator('main [data-placeholder]', { hasText: MAILING_ADDRESS })
    ).toHaveCount(isPlaceholder(MAILING_ADDRESS) ? 1 : 0)
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

    const form = page.locator('form')
    const checkbox = form.getByRole('checkbox', { name: /I agree to the Terms of Service and Privacy Policy/ })
    const submit = page.getByRole('button', { name: 'Sign Up', exact: true })

    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()
    await expect(submit).toBeDisabled()

    await expect(form.locator('a[href="/terms"]')).toHaveCount(1)
    await expect(form.locator('a[href="/privacy"]')).toHaveCount(1)

    await checkbox.check()
    await expect(submit).toBeEnabled()

    // The magic-link form is gated the same way.
    await page.getByRole('button', { name: 'Magic Link', exact: true }).click()
    const sendMagicLink = page.getByRole('button', { name: 'Send Magic Link', exact: true })
    await expect(sendMagicLink).toBeEnabled()
    await form.getByRole('checkbox', { name: /I agree to the Terms of Service/ }).uncheck()
    await expect(sendMagicLink).toBeDisabled()
  })

  test('login does not show the terms checkbox', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('form').getByRole('checkbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  })
})
