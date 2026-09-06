import { existsSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { FOOTER_LINKS } from '../../components/navigation/footer'

// Every route the launch plan requires the site footer to expose, in the order
// it specifies. The payment processor's underwriter reviews the live domain
// for Terms, Privacy, Refunds, Contact and clear Pricing, so these must never
// silently drop out of the footer.
const REQUIRED_ROUTES = [
  '/auctions',
  '/how-it-works',
  '/pricing',
  '/drive',
  '/terms',
  '/privacy',
  '/refunds',
  '/contact',
]

/** apps/web/app, where the App Router looks for `<route>/page.tsx`. */
const APP_DIR = path.resolve(__dirname, '../../app')

test.describe('footer links', () => {
  test('links are exactly the required routes, in the order the plan specifies', () => {
    expect(FOOTER_LINKS.map((link) => link.href)).toEqual(REQUIRED_ROUTES)
  })

  test('every link has a non-empty label and an internal href', () => {
    for (const link of FOOTER_LINKS) {
      expect(link.label.trim().length).toBeGreaterThan(0)
      expect(link.href.startsWith('/')).toBe(true)
    }
  })

  test('every href resolves to an App Router page', () => {
    for (const link of FOOTER_LINKS) {
      const segments = link.href.split('/').filter(Boolean)
      const pageFile = path.join(APP_DIR, ...segments, 'page.tsx')
      expect(existsSync(pageFile), `${link.href} should be served by ${pageFile}`).toBe(true)
    }
  })

  test('hrefs are unique', () => {
    const hrefs = FOOTER_LINKS.map((link) => link.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
