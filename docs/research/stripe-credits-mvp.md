# Stripe Credit Packs Integration - MVP Implementation Plan (Legacy)

> ⚠️ This plan targeted Stripe and is no longer active. Refer to `docs/PAYMENTCLOUD.md` for the current provider rollout.

## Executive Summary

This document outlines the comprehensive implementation plan for integrating Stripe credit pack purchases with the ImagineThisAuction platform. The system enables users to purchase ITC (ImagineThis Credits) in predefined packs through Stripe Checkout, with secure webhook processing that mints credits to user wallets upon successful payment.

## 1. Architecture Overview

### System Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Next.js API    │    │   Supabase DB   │
│   /wallet page  │◄──►│   Routes         │◄──►│   wallet_ledger │
│   Checkout flow │    │   /api/stripe/*  │    │   stripe_events │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌──────────────────┐
│   Stripe        │    │   Stripe         │
│   Checkout      │◄──►│   Webhooks       │
│   Session       │    │   Endpoint       │
└─────────────────┘    └──────────────────┘
```

### Credit Pack Configuration

```typescript
// Environment variables define pricing
NEXT_PUBLIC_CREDIT_PACK_100=10000   // $100.00 for 100 ITC
NEXT_PUBLIC_CREDIT_PACK_275=25000   // $250.00 for 275 ITC
NEXT_PUBLIC_CREDIT_PACK_600=50000   // $500.00 for 600 ITC
NEXT_PUBLIC_CREDIT_PACK_1300=100000 // $1000.00 for 1300 ITC
```

### Data Flow

1. User selects credit pack on /wallet page
2. Frontend calls `/api/stripe/create-checkout-session`
3. Stripe Checkout session created with metadata
4. User completes payment on Stripe
5. Stripe sends `checkout.session.completed` webhook
6. Webhook handler validates and processes payment
7. Credits minted to wallet_ledger with idempotency checks
8. User redirected to success page with updated balance

## 2. API Design

### 2.1 Create Checkout Session Endpoint

**Endpoint:** `POST /api/stripe/create-checkout-session`

```typescript
// Request body schema
interface CreateCheckoutRequest {
  creditPack: '100' | '275' | '600' | '1300'
  returnUrl?: string
}

// Response schema
interface CreateCheckoutResponse {
  sessionId: string
  url: string
}

// Implementation pseudocode
async function createCheckoutSession(req: NextRequest) {
  // 1. Authenticate user via Supabase Auth
  const user = await getUser(req)
  if (!user) return unauthorized()

  // 2. Validate credit pack selection
  const { creditPack, returnUrl } = await req.json()
  if (!['100', '275', '600', '1300'].includes(creditPack)) {
    return badRequest('Invalid credit pack')
  }

  // 3. Get pricing from environment
  const priceInCents = process.env[`NEXT_PUBLIC_CREDIT_PACK_${creditPack}`]
  const creditsAmount = parseInt(creditPack)

  // 4. Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${creditsAmount} ITC Credits`,
          description: `Credit pack for ImagineThisAuction platform`,
          images: [`${process.env.NEXT_PUBLIC_APP_URL}/images/itc-credits.png`]
        },
        unit_amount: priceInCents
      },
      quantity: 1
    }],

    // Critical metadata for webhook processing
    metadata: {
      user_id: user.id,
      credit_amount: creditsAmount.toString(),
      product_type: 'credit_pack',
      environment: process.env.NODE_ENV
    },

    // Customer data for record keeping
    customer_email: user.email,

    // URLs
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/wallet/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: returnUrl || `${process.env.NEXT_PUBLIC_APP_URL}/wallet`,

    // Security settings
    expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
    allow_promotion_codes: false,
    billing_address_collection: 'required',

    // Webhook integration
    payment_intent_data: {
      metadata: {
        user_id: user.id,
        credit_amount: creditsAmount.toString()
      }
    }
  })

  return Response.json({
    sessionId: session.id,
    url: session.url
  })
}
```

### 2.2 Webhook Handler Endpoint

**Endpoint:** `POST /api/stripe/webhooks`

```typescript
// Webhook event processing pseudocode
async function handleStripeWebhook(req: NextRequest) {
  // 1. Verify webhook signature
  const signature = req.headers.get('stripe-signature')
  const payload = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2. Check for duplicate events (idempotency)
  const existingEvent = await supabase
    .from('stripe_events')
    .select('id, processed')
    .eq('id', event.id)
    .single()

  if (existingEvent.data) {
    if (existingEvent.data.processed) {
      return Response.json({ received: true, message: 'Already processed' })
    }
  } else {
    // Store new event
    await supabase
      .from('stripe_events')
      .insert({
        id: event.id,
        event_type: event.type,
        data: event.data,
        processed: false
      })
  }

  // 3. Process specific event types
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    // 4. Mark event as processed
    await supabase
      .from('stripe_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', event.id)

    return Response.json({ received: true })

  } catch (error) {
    console.error('Webhook processing failed:', error)
    // Don't mark as processed so it can be retried
    return Response.json({ error: 'Processing failed' }, { status: 500 })
  }
}

// Checkout completion handler
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // 1. Validate session data
  if (session.payment_status !== 'paid') {
    throw new Error(`Payment not completed: ${session.payment_status}`)
  }

  const userId = session.metadata?.user_id
  const creditAmount = parseInt(session.metadata?.credit_amount || '0')

  if (!userId || !creditAmount) {
    throw new Error('Missing required metadata')
  }

  // 2. Verify user exists
  const { data: user } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .single()

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  // 3. Check for existing credit transaction (additional idempotency)
  const existingCredit = await supabase
    .from('wallet_ledger')
    .select('id')
    .eq('reference_id', session.id)
    .eq('reference_type', 'stripe_session')
    .single()

  if (existingCredit.data) {
    console.log(`Credits already minted for session: ${session.id}`)
    return
  }

  // 4. Calculate current balance
  const { data: balanceResult } = await supabase
    .rpc('get_wallet_balance', { p_user_id: userId })

  const currentBalance = balanceResult || 0
  const newBalance = currentBalance + (creditAmount * 100) // Convert to cents

  // 5. Mint credits with transaction
  const { error } = await supabase
    .from('wallet_ledger')
    .insert({
      user_id: userId,
      transaction_type: 'purchase',
      amount: creditAmount * 100, // Store in cents
      balance_after: newBalance,
      description: `Credit pack purchase: ${creditAmount} ITC`,
      reference_id: session.id,
      reference_type: 'stripe_session',
      metadata: {
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent,
        amount_paid_usd: session.amount_total,
        customer_email: session.customer_email,
        purchased_at: new Date().toISOString()
      }
    })

  if (error) {
    throw new Error(`Failed to mint credits: ${error.message}`)
  }

  console.log(`Successfully minted ${creditAmount} ITC for user ${userId}`)
}
```

### 2.3 Balance Check Endpoint

**Endpoint:** `GET /api/wallet/balance`

```typescript
async function getWalletBalance(req: NextRequest) {
  // 1. Authenticate user
  const user = await getUser(req)
  if (!user) return unauthorized()

  // 2. Calculate balance from ledger
  const { data: balance, error } = await supabase
    .rpc('get_wallet_balance', { p_user_id: user.id })

  if (error) {
    return Response.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }

  return Response.json({
    balance: balance || 0,
    balanceUsd: (balance || 0) / 100 // Convert cents to dollars for display
  })
}
```

## 3. Security Model

### 3.1 Webhook Security

```typescript
// Signature verification implementation
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')

  const receivedSignature = signature.split('=')[1]

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(receivedSignature, 'hex')
  )
}

// Rate limiting for webhook endpoint
const webhookRateLimit = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute per IP
  message: 'Too many webhook requests'
}
```

### 3.2 PII Protection

```typescript
// Logging sanitization
function sanitizeForLogging(data: any): any {
  const sensitiveFields = [
    'email', 'phone', 'address', 'customer_email',
    'billing_details', 'shipping', 'payment_method'
  ]

  const sanitized = { ...data }

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]'
    }
  })

  return sanitized
}

// Error response sanitization
function sanitizeError(error: Error, isProduction: boolean): string {
  if (isProduction) {
    // Generic error message in production
    return 'An error occurred processing your request'
  }
  return error.message
}
```

### 3.3 Input Validation

```typescript
import { z } from 'zod'

// Request validation schemas
const CreateCheckoutSchema = z.object({
  creditPack: z.enum(['100', '275', '600', '1300']),
  returnUrl: z.string().url().optional()
})

const WebhookMetadataSchema = z.object({
  user_id: z.string().uuid(),
  credit_amount: z.string().regex(/^\d+$/).transform(Number),
  product_type: z.literal('credit_pack'),
  environment: z.enum(['development', 'production'])
})
```

## 4. User Experience Flow

### 4.1 Wallet Page Design

```typescript
// /app/wallet/page.tsx
export default function WalletPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Wallet</h1>
          <p className="text-gray-600">Manage your ITC credits</p>
        </div>
        <WalletBalance />
      </div>

      {/* Credit Packs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <CreditPackCard pack="100" price="$100" popular={false} />
        <CreditPackCard pack="275" price="$250" popular={true} />
        <CreditPackCard pack="600" price="$500" popular={false} />
        <CreditPackCard pack="1300" price="$1000" popular={false} />
      </div>

      {/* Transaction History */}
      <TransactionHistory />
    </div>
  )
}
```

### 4.2 Purchase Flow Components

```typescript
// Credit pack selection component
function CreditPackCard({ pack, price, popular }: CreditPackProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handlePurchase = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditPack: pack,
          returnUrl: window.location.href
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const { url } = await response.json()
      window.location.href = url

    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: "Unable to start checkout process. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className={`relative ${popular ? 'ring-2 ring-blue-500' : ''}`}>
      {popular && (
        <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
          Most Popular
        </Badge>
      )}

      <CardHeader className="text-center">
        <CardTitle>{pack} ITC</CardTitle>
        <CardDescription className="text-2xl font-bold text-green-600">
          {price}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Button
          onClick={handlePurchase}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Purchase
            </>
          )}
        </Button>

        <p className="text-xs text-gray-500 mt-2 text-center">
          ${(parseFloat(price.slice(1)) / parseInt(pack)).toFixed(2)} per credit
        </p>
      </CardContent>
    </Card>
  )
}
```

### 4.3 Success and Error States

```typescript
// /app/wallet/success/page.tsx
export default function SuccessPage({ searchParams }: { searchParams: { session_id: string } }) {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSession() {
      try {
        const response = await fetch(`/api/stripe/session/${searchParams.session_id}`)
        const sessionData = await response.json()
        setSession(sessionData)
      } catch (error) {
        console.error('Failed to fetch session:', error)
      } finally {
        setLoading(false)
      }
    }

    if (searchParams.session_id) {
      fetchSession()
    }
  }, [searchParams.session_id])

  if (loading) {
    return <SuccessPageSkeleton />
  }

  return (
    <div className="container mx-auto px-4 py-8 text-center">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
      <h1 className="text-3xl font-bold mb-2">Purchase Successful!</h1>
      <p className="text-gray-600 mb-6">
        Your credits have been added to your wallet
      </p>

      {session && (
        <Card className="max-w-md mx-auto mb-6">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Credits Purchased:</span>
                <span className="font-semibold">{session.metadata?.credit_amount} ITC</span>
              </div>
              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span className="font-semibold">
                  ${(session.amount_total / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-x-4">
        <Button asChild>
          <Link href="/wallet">View Wallet</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/auctions">Browse Auctions</Link>
        </Button>
      </div>
    </div>
  )
}
```

## 5. Database Changes

### 5.1 Required Schema Modifications

The existing schema already supports the credit system. No schema changes are required, but we should add some indexes for performance:

```sql
-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_type
ON wallet_ledger(user_id, transaction_type);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference
ON wallet_ledger(reference_id, reference_type);

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed
ON stripe_events(processed, created_at);

-- Helper function for wallet balance calculation
CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    balance INTEGER;
BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO balance
    FROM wallet_ledger
    WHERE user_id = p_user_id;

    RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 5.2 Stripe Product Configuration

```typescript
// Stripe product setup (run once in setup script)
async function createStripeProducts() {
  const products = [
    { credits: 100, priceUsd: 100.00 },
    { credits: 275, priceUsd: 250.00 },
    { credits: 600, priceUsd: 500.00 },
    { credits: 1300, priceUsd: 1000.00 }
  ]

  for (const { credits, priceUsd } of products) {
    // Create product
    const product = await stripe.products.create({
      name: `${credits} ITC Credits`,
      description: `Credit pack for ImagineThisAuction platform`,
      images: [`${process.env.NEXT_PUBLIC_APP_URL}/images/itc-credits.png`],
      metadata: {
        credit_amount: credits.toString(),
        product_type: 'credit_pack'
      }
    })

    // Create price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceUsd * 100, // Convert to cents
      currency: 'usd',
      metadata: {
        credit_amount: credits.toString()
      }
    })

    console.log(`Created product ${product.id} with price ${price.id} for ${credits} credits`)
  }
}
```

## 6. Testing Strategy

### 6.1 Unit Tests

```typescript
// __tests__/api/stripe/create-checkout-session.test.ts
describe('/api/stripe/create-checkout-session', () => {
  it('should create checkout session for valid credit pack', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    jest.mocked(getUser).mockResolvedValue(mockUser)

    const response = await POST(new Request('http://localhost:3000/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ creditPack: '100' })
    }))

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('sessionId')
    expect(data).toHaveProperty('url')
  })

  it('should reject invalid credit pack', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    jest.mocked(getUser).mockResolvedValue(mockUser)

    const response = await POST(new Request('http://localhost:3000/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ creditPack: '999' })
    }))

    expect(response.status).toBe(400)
  })

  it('should require authentication', async () => {
    jest.mocked(getUser).mockResolvedValue(null)

    const response = await POST(new Request('http://localhost:3000/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ creditPack: '100' })
    }))

    expect(response.status).toBe(401)
  })
})

// __tests__/api/stripe/webhooks.test.ts
describe('/api/stripe/webhooks', () => {
  it('should process checkout.session.completed event', async () => {
    const mockEvent = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_status: 'paid',
          metadata: {
            user_id: 'user-123',
            credit_amount: '100'
          },
          customer_email: 'test@example.com',
          amount_total: 10000
        }
      }
    }

    // Mock Stripe webhook verification
    jest.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent)

    const response = await POST(new Request('http://localhost:3000/api/stripe/webhooks', {
      method: 'POST',
      headers: { 'stripe-signature': 'test-signature' },
      body: JSON.stringify(mockEvent)
    }))

    expect(response.status).toBe(200)

    // Verify credits were minted
    const { data } = await supabase
      .from('wallet_ledger')
      .select('*')
      .eq('reference_id', 'cs_test_123')

    expect(data).toHaveLength(1)
    expect(data[0].amount).toBe(10000) // 100 credits * 100 cents
  })

  it('should handle duplicate webhook events', async () => {
    // First event
    await handleWebhookEvent(mockEvent)

    // Duplicate event
    const response = await POST(webhookRequest)
    expect(response.status).toBe(200)

    const { data } = await response.json()
    expect(data.message).toContain('Already processed')
  })
})
```

### 6.2 Integration Tests

```typescript
// __tests__/integration/credit-purchase-flow.test.ts
describe('Credit Purchase Flow', () => {
  let user: any

  beforeEach(async () => {
    user = await createTestUser()
  })

  it('should complete full purchase flow', async () => {
    // 1. Create checkout session
    const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ creditPack: '100' })
    })

    expect(checkoutResponse.status).toBe(200)
    const { sessionId } = await checkoutResponse.json()

    // 2. Simulate webhook event
    const webhookEvent = createMockWebhookEvent(sessionId, user.id, 100)
    const webhookResponse = await fetch('/api/stripe/webhooks', {
      method: 'POST',
      headers: { 'stripe-signature': generateTestSignature(webhookEvent) },
      body: JSON.stringify(webhookEvent)
    })

    expect(webhookResponse.status).toBe(200)

    // 3. Verify balance updated
    const balanceResponse = await fetch('/api/wallet/balance', {
      headers: { 'Authorization': `Bearer ${user.session.access_token}` }
    })

    const { balance } = await balanceResponse.json()
    expect(balance).toBe(10000) // 100 credits * 100 cents
  })
})
```

### 6.3 E2E Tests (Playwright)

```typescript
// tests/credit-purchase.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Credit Purchase Flow', () => {
  test('should purchase 100 ITC credits successfully', async ({ page }) => {
    // 1. Login as test user
    await page.goto('/login')
    await page.fill('[data-testid=email]', 'test@example.com')
    await page.fill('[data-testid=password]', 'password123')
    await page.click('[data-testid=login-button]')

    // 2. Navigate to wallet
    await page.goto('/wallet')
    await expect(page.locator('h1')).toContainText('My Wallet')

    // 3. Check initial balance
    const initialBalance = await page.locator('[data-testid=wallet-balance]').textContent()

    // 4. Purchase 100 credits
    await page.click('[data-testid=credit-pack-100] button')

    // 5. Complete Stripe checkout (test mode)
    await expect(page).toHaveURL(/checkout\.stripe\.com/)

    // Fill test card details
    await page.fill('[data-testid=cardNumber]', '4242424242424242')
    await page.fill('[data-testid=cardExpiry]', '12/25')
    await page.fill('[data-testid=cardCvc]', '123')
    await page.fill('[data-testid=billingName]', 'Test User')
    await page.click('[data-testid=submit-button]')

    // 6. Verify success page
    await expect(page).toHaveURL(/\/wallet\/success/)
    await expect(page.locator('h1')).toContainText('Purchase Successful')

    // 7. Return to wallet and verify balance
    await page.click('a[href="/wallet"]')

    // Wait for balance to update
    await page.waitForFunction(() => {
      const balance = document.querySelector('[data-testid=wallet-balance]')?.textContent
      return balance && !balance.includes(initialBalance)
    })

    const finalBalance = await page.locator('[data-testid=wallet-balance]').textContent()
    expect(finalBalance).toContain('100.00') // Should show $100 worth of credits
  })

  test('should handle insufficient balance gracefully', async ({ page }) => {
    // Setup user with 0 balance
    await setupUserWithBalance(0)

    await page.goto('/auctions/test-auction/lots/1')

    // Try to bid
    await page.click('[data-testid=quick-bid-button]')

    // Should show insufficient balance message
    await expect(page.locator('[data-testid=insufficient-balance]')).toBeVisible()

    // Click "Add Credits" button
    await page.click('[data-testid=add-credits-button]')

    // Should navigate to wallet
    await expect(page).toHaveURL('/wallet')
  })
})
```

## 7. Error Handling

### 7.1 Webhook Error Scenarios

```typescript
// Comprehensive error handling for webhooks
async function handleWebhookError(error: Error, event: Stripe.Event) {
  const errorInfo = {
    eventId: event.id,
    eventType: event.type,
    error: error.message,
    timestamp: new Date().toISOString(),
    metadata: sanitizeForLogging(event.data.object)
  }

  // Log error for monitoring
  console.error('Webhook processing error:', errorInfo)

  // Store error for manual review
  await supabase
    .from('webhook_errors')
    .insert({
      event_id: event.id,
      error_message: error.message,
      error_stack: error.stack,
      event_data: event.data,
      created_at: new Date().toISOString()
    })

  // Alert monitoring system
  if (process.env.WEBHOOK_ERROR_ALERT_URL) {
    await fetch(process.env.WEBHOOK_ERROR_ALERT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorInfo)
    })
  }
}
```

### 7.2 Payment Failure Handling

```typescript
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const userId = paymentIntent.metadata?.user_id
  if (!userId) return

  // Log payment failure
  console.log(`Payment failed for user ${userId}:`, {
    paymentIntentId: paymentIntent.id,
    lastPaymentError: paymentIntent.last_payment_error,
    amount: paymentIntent.amount
  })

  // Send user notification (optional)
  await sendPaymentFailureNotification(userId, paymentIntent)
}

async function sendPaymentFailureNotification(userId: string, paymentIntent: Stripe.PaymentIntent) {
  const { data: user } = await supabase
    .from('users')
    .select('email, first_name')
    .eq('id', userId)
    .single()

  if (!user) return

  // Use your email service (Resend, SendGrid, etc.)
  await emailService.send({
    to: user.email,
    subject: 'Payment Failed - ImagineThisAuction',
    template: 'payment-failed',
    data: {
      firstName: user.first_name,
      amount: paymentIntent.amount / 100,
      reason: paymentIntent.last_payment_error?.message || 'Unknown error'
    }
  })
}
```

### 7.3 Frontend Error Boundaries

```typescript
// Credit purchase error boundary
function CreditPurchaseErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={({ error, retry }) => (
        <Card className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Purchase Error</h3>
          <p className="text-gray-600 mb-4">
            {error.message || 'Something went wrong with your purchase'}
          </p>
          <div className="space-x-2">
            <Button onClick={retry} variant="outline">
              Try Again
            </Button>
            <Button asChild>
              <Link href="/support">Contact Support</Link>
            </Button>
          </div>
        </Card>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
```

## 8. Documentation Requirements

### 8.1 Developer Setup Guide

```markdown
# Stripe Credit Packs - Setup Guide

## Prerequisites

1. Stripe account with test mode enabled
2. Supabase project with database schema deployed
3. Environment variables configured

## Environment Variables

```bash
# Stripe Configuration
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Credit Pack Pricing (in cents)
NEXT_PUBLIC_CREDIT_PACK_100=10000
NEXT_PUBLIC_CREDIT_PACK_275=25000
NEXT_PUBLIC_CREDIT_PACK_600=50000
NEXT_PUBLIC_CREDIT_PACK_1300=100000
```

## Stripe Webhook Setup

1. Login to Stripe Dashboard
2. Navigate to Developers > Webhooks
3. Add endpoint: `https://yourdomain.com/api/stripe/webhooks`
4. Select events: `checkout.session.completed`, `payment_intent.payment_failed`
5. Copy webhook secret to environment variables

## Testing

```bash
# Install Stripe CLI
npm install -g stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local development
stripe listen --forward-to localhost:3000/api/stripe/webhooks

# Test with sample events
stripe trigger checkout.session.completed
```

### 8.2 Troubleshooting Guide

```markdown
# Common Issues and Solutions

## Webhook Signature Verification Failed

**Symptoms:** Webhook returns 400 with "Invalid signature" error

**Solutions:**
1. Verify STRIPE_WEBHOOK_SECRET matches dashboard
2. Check webhook URL is exactly correct
3. Ensure raw body is used for signature verification

## Credits Not Minting After Payment

**Symptoms:** Payment succeeds but balance doesn't update

**Solutions:**
1. Check webhook logs in Stripe dashboard
2. Verify stripe_events table shows processed=true
3. Check wallet_ledger for transaction record
4. Verify user_id metadata is correct

## Duplicate Credit Minting

**Symptoms:** Same payment creates multiple credit entries

**Solutions:**
1. Check idempotency logic in webhook handler
2. Verify stripe_events table prevents duplicates
3. Add additional reference_id check in wallet_ledger

## Checkout Session Creation Fails

**Symptoms:** Error when clicking "Purchase" button

**Solutions:**
1. Verify user authentication
2. Check credit pack configuration
3. Validate Stripe API key permissions
4. Check network connectivity
```

### 8.3 API Documentation

```yaml
# OpenAPI specification for credit pack endpoints
openapi: 3.0.0
info:
  title: ImagineThisAuction Credit Packs API
  version: 1.0.0

paths:
  /api/stripe/create-checkout-session:
    post:
      summary: Create Stripe checkout session for credit purchase
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                creditPack:
                  type: string
                  enum: ['100', '275', '600', '1300']
                returnUrl:
                  type: string
                  format: uri
              required: [creditPack]
      responses:
        200:
          description: Checkout session created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  sessionId:
                    type: string
                  url:
                    type: string
                    format: uri
        400:
          description: Invalid request
        401:
          description: Unauthorized

  /api/stripe/webhooks:
    post:
      summary: Handle Stripe webhook events
      parameters:
        - name: stripe-signature
          in: header
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
      responses:
        200:
          description: Webhook processed successfully
        400:
          description: Invalid signature or payload
        500:
          description: Processing error

  /api/wallet/balance:
    get:
      summary: Get user wallet balance
      security:
        - BearerAuth: []
      responses:
        200:
          description: Balance retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  balance:
                    type: integer
                    description: Balance in cents
                  balanceUsd:
                    type: number
                    description: Balance in USD
```

## 9. Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Database schema review and indexing
- [ ] Stripe webhook endpoint implementation
- [ ] Checkout session creation endpoint
- [ ] Basic error handling and logging
- [ ] Environment variable configuration

### Phase 2: Frontend Integration
- [ ] Wallet page UI implementation
- [ ] Credit pack selection components
- [ ] Purchase flow integration
- [ ] Success/error page implementation
- [ ] Loading states and user feedback

### Phase 3: Security & Testing
- [ ] Webhook signature verification
- [ ] Input validation and sanitization
- [ ] Idempotency mechanisms
- [ ] Unit test suite
- [ ] Integration tests
- [ ] E2E test scenarios

### Phase 4: Production Readiness
- [ ] Error monitoring setup
- [ ] Performance optimization
- [ ] Documentation completion
- [ ] Production environment testing
- [ ] Go-live checklist completion

## 10. Production Considerations

### 10.1 Monitoring & Alerting

```typescript
// Key metrics to monitor
const metrics = {
  // Business metrics
  successfulPurchases: 'stripe.checkout.success.count',
  purchaseVolume: 'stripe.checkout.volume.sum',
  averageOrderValue: 'stripe.checkout.aov.avg',

  // Technical metrics
  webhookLatency: 'stripe.webhook.latency.avg',
  webhookErrors: 'stripe.webhook.errors.count',
  checkoutErrors: 'stripe.checkout.errors.count',

  // User experience
  checkoutAbandonmentRate: 'stripe.checkout.abandonment.rate',
  pageLoadTime: 'wallet.page.load_time.avg'
}

// Alert thresholds
const alerts = {
  webhookErrorRate: { threshold: 5, window: '5m' },
  checkoutFailureRate: { threshold: 10, window: '10m' },
  purchaseVolumeAnomaly: { threshold: 50, window: '1h' }
}
```

### 10.2 Performance Optimization

```typescript
// Caching strategy for wallet balance
const balanceCache = new Map<string, { balance: number, timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 1 minute

async function getCachedBalance(userId: string): Promise<number | null> {
  const cached = balanceCache.get(userId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.balance
  }
  return null
}

async function setCachedBalance(userId: string, balance: number): Promise<void> {
  balanceCache.set(userId, { balance, timestamp: Date.now() })
}

// Database connection pooling
const dbConfig = {
  max: 20, // Maximum pool size
  min: 5,  // Minimum pool size
  idle: 10000, // Close connections after 10 seconds of inactivity
  acquire: 60000, // Maximum time to acquire connection
  evict: 1000 // Check for idle connections every second
}
```

### 10.3 Compliance & Audit

```typescript
// Audit trail for credit transactions
interface CreditAuditLog {
  transaction_id: string
  user_id: string
  action: 'credit_purchase' | 'credit_spent' | 'credit_refund'
  amount: number
  stripe_session_id?: string
  ip_address: string
  user_agent: string
  timestamp: string
  metadata: Record<string, any>
}

// PCI compliance considerations
const pciCompliance = {
  // Never store card details
  cardDataHandling: 'stripe_only',

  // Log access to payment data
  auditAccess: true,

  // Encrypt sensitive metadata
  encryptMetadata: ['customer_email', 'billing_address'],

  // Regular security reviews
  securityReviewSchedule: 'quarterly'
}
```

This comprehensive implementation plan provides the foundation for a robust, secure, and scalable Stripe credit pack integration. The design prioritizes security, user experience, and operational reliability while maintaining compliance with financial regulations and best practices.

## Next Steps

1. **Review and Approval**: Technical team review of architecture and implementation approach
2. **Environment Setup**: Configure Stripe test environment and webhook endpoints
3. **Development Sprint Planning**: Break down implementation into manageable sprints
4. **Security Review**: Conduct security assessment of proposed implementation
5. **Go-Live Planning**: Prepare production deployment and monitoring strategy

The system is designed to handle the complexity of financial transactions while providing an excellent user experience and maintaining the highest standards of security and reliability.
