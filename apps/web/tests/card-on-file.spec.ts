import { expect, test } from '@playwright/test'

/**
 * Card on file (Task 4b).
 *
 * /account/payment is where a bidder saves the card that is charged if they
 * win. Signed out it must bounce to login and remember where to come back
 * to; the API behind it must refuse anonymous calls before touching the
 * gateway. The signed-in cases need a bidder login and are skipped unless
 * E2E_BIDDER_EMAIL / E2E_BIDDER_PASSWORD are set.
 */

test.describe('/account/payment signed out', () => {
  test('redirects to login and keeps the payment page (with ?next=) as the return target', async ({ page }) => {
    await page.goto('/account/payment?next=/lots/abc')
    await expect(page).toHaveURL(/\/login\?redirectedFrom=/)
    // The inner ?next= stays percent-encoded inside redirectedFrom so it
    // survives as a single query value; /login sends the bidder to exactly
    // this path, and the payment page then decodes next back to /lots/abc.
    const redirectedFrom = new URL(page.url()).searchParams.get('redirectedFrom')
    expect(redirectedFrom).toBe('/account/payment?next=%2Flots%2Fabc')
  })

  test('drops an off-site ?next= before building the return target', async ({ page }) => {
    await page.goto('/account/payment?next=https://evil.example/')
    await expect(page).toHaveURL(/\/login\?redirectedFrom=/)
    expect(new URL(page.url()).searchParams.get('redirectedFrom')).toBe('/account/payment')
  })
})

test.describe('/api/payments/methods signed out', () => {
  test('GET is 401', async ({ request }) => {
    const res = await request.get('/api/payments/methods')
    expect(res.status()).toBe(401)
  })

  test('POST is 401 before any validation or gateway call', async ({ request }) => {
    const res = await request.post('/api/payments/methods', {
      data: { paymentToken: 'not-a-real-token', firstName: 'Ada', lastName: 'Lovelace' },
    })
    expect(res.status()).toBe(401)
  })

  test('DELETE is 401', async ({ request }) => {
    const res = await request.delete('/api/payments/methods')
    expect(res.status()).toBe(401)
  })
})

test.describe('/account/payment signed in', () => {
  const email = process.env.E2E_BIDDER_EMAIL
  const password = process.env.E2E_BIDDER_PASSWORD

  test.skip(!email || !password, 'Set E2E_BIDDER_EMAIL and E2E_BIDDER_PASSWORD to run the signed-in checks')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login?redirectedFrom=%2Faccount%2Fpayment')
    await page.getByLabel(/email/i).fill(email as string)
    await page.getByLabel(/password/i).fill(password as string)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/account\/payment/)
  })

  test('shows the card form or the not-configured notice, never a wallet', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /payment method/i })).toBeVisible()

    if (process.env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY) {
      // Collect.js hosted fields mount into these containers.
      await expect(page.locator('#cof-ccnumber')).toBeVisible()
      await expect(page.locator('#cof-ccexp')).toBeVisible()
      await expect(page.locator('#cof-cvv')).toBeVisible()
    } else {
      await expect(page.getByText(/card entry is not configured yet/i)).toBeVisible()
    }

    await expect(page.locator('main')).not.toContainText(/wallet|\bITC\b|credits/i)
  })
})
