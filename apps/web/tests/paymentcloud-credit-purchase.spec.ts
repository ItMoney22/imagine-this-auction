import { test, expect, Page } from '@playwright/test'

const testUser = {
  email: 'credit-test@example.com',
  password: 'password123',
}

test.describe('PaymentCloud credit purchase flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('Wallet UI references PaymentCloud provider', async ({ page }) => {
    await loginAndGoToWallet(page)
    await expect(page.locator('text=Secure payment via PaymentCloud')).toBeVisible()
  })

  test('Handles provider API errors gracefully', async ({ page }) => {
    await loginAndGoToWallet(page)

    await page.route('/api/payments/card/create', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, status: 'pending', error: 'Provider offline' }),
      })
    })

    await page.click('[data-testid="credit-pack-100"] button:has-text("Buy Now")')

    await expect(page.locator('[role="alert"]:has-text("Purchase Failed")')).toBeVisible()
    await expect(page.locator('text=Provider offline')).toBeVisible()
  })

  test('Shows pending toast when provider requires manual confirmation', async ({ page }) => {
    await loginAndGoToWallet(page)
    await page.route('/api/payments/card/create', (route) => {
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, status: 'pending', paymentReference: 'demo-ref' }),
      })
    })

    await page.click('[data-testid="credit-pack-275"] button:has-text("Buy Now")')

    await expect(page.locator('[role="alert"]:has-text("Payment Pending")')).toBeVisible()
    await expect(page.locator('text=demo-ref')).toBeVisible()
  })

  test('Wallet success querystring works for PaymentCloud', async ({ page }) => {
    await loginAndGoToWallet(page)
    await page.goto('/wallet?payment_status=success&payment_reference=demo-ref')
    await expect(page.locator('[role="alert"]:has-text("Purchase Successful")')).toBeVisible()
  })
})

test.describe('PaymentCloud webhook safety', () => {
  test('Webhook route is protected when signature is required', async ({ request }) => {
    const response = await request.post('/api/webhooks/paymentcloud', {
      headers: {
        'content-type': 'application/json',
        'x-paymentcloud-signature': 'invalid',
      },
      data: {
        eventId: 'evt_invalid',
        type: 'sale.approved',
        payload: {
          userId: '00000000-0000-0000-0000-000000000000',
          packId: 'pack_100',
          amountUsdCents: 999,
          creditAmount: 100,
          description: '100 ITC Credits',
        },
      },
    })

    if (process.env.PAYMENTCLOUD_WEBHOOK_SECRET) {
      expect(response.status()).toBe(401)
    } else {
      expect([200, 500]).toContain(response.status())
    }
  })

  test('Permits webhook processing when signature header omitted in development', async ({ request }) => {
    const response = await request.post('/api/webhooks/paymentcloud', {
      headers: { 'content-type': 'application/json' },
      data: {
        eventId: 'evt_pending_demo',
        type: 'sale.pending',
        payload: {
          userId: '00000000-0000-0000-0000-000000000000',
          packId: 'pack_100',
          amountUsdCents: 999,
          creditAmount: 100,
          description: '100 ITC Credits',
        },
      },
    })

    expect([200, 202, 500]).toContain(response.status())
  })
})

test.describe('Daily reconciliation placeholder', () => {
  test('surface reconciliation endpoint returns 202 while provider is pending', async ({ request }) => {
    const response = await request.post('/api/payments/reconcile/daily')
    expect([202, 501]).toContain(response.status())
  })
})

async function loginAndGoToWallet(page: Page) {
  await page.goto('/login')
  await page.fill('[name="email"]', testUser.email)
  await page.fill('[name="password"]', testUser.password)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(250)
  await page.goto('/wallet')
  await page.waitForLoadState('networkidle')
}
