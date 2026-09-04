import { expect, test } from '@playwright/test'

import { FOOTER_LINKS } from '../../components/navigation/footer'

// Every route the launch plan requires the site footer to expose. The payment
// processor's underwriter reviews the live domain for Terms, Privacy, Refunds,
// Contact and clear Pricing, so these must never silently drop out of the footer.
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

test.describe('footer links', () => {
  test('contains all eight required routes', () => {
    const hrefs = FOOTER_LINKS.map((link) => link.href)
    for (const route of REQUIRED_ROUTES) {
      expect(hrefs, `footer is missing ${route}`).toContain(route)
    }
    expect(hrefs).toHaveLength(REQUIRED_ROUTES.length)
  })

  test('every link has a non-empty label and an internal href', () => {
    for (const link of FOOTER_LINKS) {
      expect(link.label.trim().length).toBeGreaterThan(0)
      expect(link.href.startsWith('/')).toBe(true)
    }
  })

  test('links appear in the order the plan specifies', () => {
    expect(FOOTER_LINKS.map((link) => link.href)).toEqual(REQUIRED_ROUTES)
  })

  test('hrefs are unique', () => {
    const hrefs = FOOTER_LINKS.map((link) => link.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
