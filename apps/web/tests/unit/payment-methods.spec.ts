import { expect, test } from '@playwright/test'

import {
  friendlyGatewayMessage,
  PaymentMethodRequestSchema,
  paymentMethodPagePath,
  sanitizeReturnPath,
  saveCardOnFile,
  toPaymentMethodPublic,
  type SaveCardDeps,
  type UpsertPaymentMethodInput,
} from '../../lib/payments/methods'
import { NmiError, parseResponse } from '../../lib/payments/nmi'
import { createRateLimiter, PAYMENT_METHODS_RATE_LIMIT } from '../../lib/payments/rate-limit'

/**
 * Request validation for POST /api/payments/methods. The route only ever sees
 * a Collect.js token plus the cardholder name; the card number never reaches
 * our servers, so there is nothing card-shaped to validate here.
 */
test.describe('PaymentMethodRequestSchema', () => {
  test('accepts a token and a cardholder name, trimming whitespace', () => {
    const parsed = PaymentMethodRequestSchema.safeParse({
      paymentToken: ' tok_abc123 ',
      firstName: '  Ada ',
      lastName: ' Lovelace ',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({ paymentToken: 'tok_abc123', firstName: 'Ada', lastName: 'Lovelace' })
    }
  })

  test('rejects a missing or blank token', () => {
    expect(PaymentMethodRequestSchema.safeParse({ firstName: 'Ada', lastName: 'Lovelace' }).success).toBe(false)
    expect(
      PaymentMethodRequestSchema.safeParse({ paymentToken: '   ', firstName: 'Ada', lastName: 'Lovelace' }).success
    ).toBe(false)
  })

  test('rejects blank names', () => {
    expect(
      PaymentMethodRequestSchema.safeParse({ paymentToken: 'tok', firstName: '', lastName: 'Lovelace' }).success
    ).toBe(false)
    expect(
      PaymentMethodRequestSchema.safeParse({ paymentToken: 'tok', firstName: 'Ada', lastName: '  ' }).success
    ).toBe(false)
  })

  test('rejects oversized fields so a hostile body cannot be relayed to the gateway', () => {
    expect(
      PaymentMethodRequestSchema.safeParse({ paymentToken: 'x'.repeat(513), firstName: 'Ada', lastName: 'L' }).success
    ).toBe(false)
    expect(
      PaymentMethodRequestSchema.safeParse({ paymentToken: 'tok', firstName: 'A'.repeat(101), lastName: 'L' }).success
    ).toBe(false)
  })

  test('rejects non-string values rather than coercing them', () => {
    expect(
      PaymentMethodRequestSchema.safeParse({ paymentToken: 123, firstName: 'Ada', lastName: 'Lovelace' }).success
    ).toBe(false)
    expect(PaymentMethodRequestSchema.safeParse(null).success).toBe(false)
    expect(PaymentMethodRequestSchema.safeParse('tok').success).toBe(false)
  })
})

test.describe('toPaymentMethodPublic', () => {
  test('maps the view row to the API shape and derives verified from verified_at', () => {
    expect(
      toPaymentMethodPublic({
        card_brand: 'visa',
        last4: '4242',
        exp_month: 10,
        exp_year: 2027,
        verified_at: '2026-09-05T12:00:00.000Z',
      })
    ).toEqual({
      brand: 'visa',
      last4: '4242',
      expMonth: 10,
      expYear: 2027,
      verified: true,
      verifiedAt: '2026-09-05T12:00:00.000Z',
    })
  })

  test('an unverified row is verified: false with nulls preserved', () => {
    expect(
      toPaymentMethodPublic({ card_brand: null, last4: null, exp_month: null, exp_year: null, verified_at: null })
    ).toEqual({ brand: null, last4: null, expMonth: null, expYear: null, verified: false, verifiedAt: null })
  })

  test('never exposes a customer vault id even if one is on the input object', () => {
    const result = toPaymentMethodPublic({
      card_brand: 'visa',
      last4: '4242',
      exp_month: 1,
      exp_year: 2030,
      verified_at: null,
      // Simulates a caller that passed the full table row by mistake.
      ...({ customer_vault_id: 'vault-123', user_id: 'user-1' } as Record<string, unknown>),
    })
    expect(JSON.stringify(result)).not.toContain('vault-123')
    expect(JSON.stringify(result)).not.toContain('user-1')
  })
})

test.describe('friendlyGatewayMessage', () => {
  test('strips the NMI REFID suffix and keeps the human part', () => {
    expect(friendlyGatewayMessage('Invalid Customer Vault Id REFID:3150929683')).toBe('Invalid Customer Vault Id')
    expect(friendlyGatewayMessage('DECLINE REFID:123')).toBe('DECLINE')
  })

  test('falls back to a plain decline sentence when the gateway says nothing useful', () => {
    expect(friendlyGatewayMessage('')).toBe('Your card was declined. Check the details or try another card.')
    expect(friendlyGatewayMessage(undefined)).toBe('Your card was declined. Check the details or try another card.')
    expect(friendlyGatewayMessage('SUCCESS')).toBe('Your card was declined. Check the details or try another card.')
  })
})

/**
 * `?next=` on /account/payment sends the bidder back to the lot they came
 * from. Only same-site paths are honoured so the page can never be used as an
 * open redirect.
 */
test.describe('sanitizeReturnPath', () => {
  test('keeps a same-site absolute path, with query string', () => {
    expect(sanitizeReturnPath('/lots/abc')).toBe('/lots/abc')
    expect(sanitizeReturnPath('/lots/abc?quickbid=1')).toBe('/lots/abc?quickbid=1')
    expect(sanitizeReturnPath('/')).toBe('/')
  })

  test('refuses external, protocol-relative, and malformed targets', () => {
    expect(sanitizeReturnPath('https://evil.example/')).toBeNull()
    expect(sanitizeReturnPath('//evil.example/')).toBeNull()
    expect(sanitizeReturnPath('/\\evil.example')).toBeNull()
    expect(sanitizeReturnPath('javascript:alert(1)')).toBeNull()
    expect(sanitizeReturnPath('lots/abc')).toBeNull()
    expect(sanitizeReturnPath('/lots/abc\n')).toBeNull()
    expect(sanitizeReturnPath('/' + 'a'.repeat(600))).toBeNull()
  })

  test('refuses non-strings and empties', () => {
    expect(sanitizeReturnPath(undefined)).toBeNull()
    expect(sanitizeReturnPath(null)).toBeNull()
    expect(sanitizeReturnPath('')).toBeNull()
    expect(sanitizeReturnPath(['/lots/abc'])).toBeNull()
  })

  test('paymentMethodPagePath encodes the return path once', () => {
    expect(paymentMethodPagePath()).toBe('/account/payment')
    expect(paymentMethodPagePath(null)).toBe('/account/payment')
    expect(paymentMethodPagePath('/lots/abc?quickbid=1')).toBe(
      '/account/payment?next=%2Flots%2Fabc%3Fquickbid%3D1'
    )
    expect(paymentMethodPagePath('https://evil.example/')).toBe('/account/payment')
  })
})

/**
 * POST /api/payments/methods is limited to 5 attempts per minute per user so
 * a stolen session cannot be used to test card numbers against the gateway.
 */
test.describe('rate limiter', () => {
  test('the payment-methods limit is 5 per minute', () => {
    expect(PAYMENT_METHODS_RATE_LIMIT).toEqual({ limit: 5, windowMs: 60_000 })
  })

  test('allows up to the limit inside one window, then refuses', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 })
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) {
      const decision = limiter.check('user-1', t0 + i)
      expect(decision.allowed).toBe(true)
      expect(decision.remaining).toBe(4 - i)
    }
    const sixth = limiter.check('user-1', t0 + 10)
    expect(sixth.allowed).toBe(false)
    expect(sixth.remaining).toBe(0)
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0)
    expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  test('a refused attempt does not extend the window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 })
    limiter.check('u', 0)
    limiter.check('u', 100)
    expect(limiter.check('u', 200).allowed).toBe(false)
    // The oldest attempt (t=0) expires at t=1000 regardless of the refusal at t=200.
    expect(limiter.check('u', 1_000).allowed).toBe(true)
  })

  test('the window slides: the oldest attempt falling out frees one slot', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 })
    expect(limiter.check('u', 0).allowed).toBe(true)
    expect(limiter.check('u', 500).allowed).toBe(true)
    expect(limiter.check('u', 999).allowed).toBe(false)
    expect(limiter.check('u', 1_000).allowed).toBe(true) // t=0 expired
    expect(limiter.check('u', 1_001).allowed).toBe(false) // t=500 and t=1000 still inside
    expect(limiter.check('u', 1_500).allowed).toBe(true) // t=500 expired
  })

  test('retryAfterSeconds counts to the moment the oldest attempt expires, rounded up', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    limiter.check('u', 0)
    expect(limiter.check('u', 30_000).retryAfterSeconds).toBe(30)
    expect(limiter.check('u', 59_001).retryAfterSeconds).toBe(1)
  })

  test('keys are independent', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('b', 0).allowed).toBe(true)
    expect(limiter.check('a', 1).allowed).toBe(false)
    expect(limiter.check('b', 1).allowed).toBe(false)
  })

  test('reset clears one key or all keys', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    limiter.check('a', 0)
    limiter.check('b', 0)
    limiter.reset('a')
    expect(limiter.check('a', 1).allowed).toBe(true)
    expect(limiter.check('b', 1).allowed).toBe(false)
    limiter.reset()
    expect(limiter.check('b', 2).allowed).toBe(true)
  })

  test('rejects a non-positive limit or window', () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow(RangeError)
    expect(() => createRateLimiter({ limit: 5, windowMs: 0 })).toThrow(RangeError)
  })
})

/**
 * POST /api/payments/methods orchestration, with the gateway and the database
 * injected. The invariant under test: the stored row changes ONLY when the
 * gateway has verified the new card. A decline or an outage must never
 * downgrade a bidder who already had a verified card.
 */
test.describe('saveCardOnFile', () => {
  const INPUT = {
    userId: 'user-1',
    paymentToken: 'tok_abc',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  }
  const NOW = '2026-09-05T12:00:00.000Z'
  const NEW_VAULT = { customerVaultId: 'vault-new', brand: 'visa', last4: '4242', expMonth: 10, expYear: 2027 }
  const EXISTING_VERIFIED = {
    customerVaultId: 'vault-old',
    unvoidedAuthTransactionId: null,
    verifiedAt: '2026-08-01T00:00:00.000Z',
  }

  const DECLINED_VAULT_ADD =
    'response=2&responsetext=DECLINE+REFID%3A123&authcode=&transactionid=0&avsresponse=&cvvresponse=&orderid=&type=&response_code=200'

  function harness(overrides: Partial<SaveCardDeps> = {}) {
    const calls = {
      addVault: [] as unknown[],
      validate: [] as unknown[],
      upsert: [] as UpsertPaymentMethodInput[],
      deleteVault: [] as string[],
    }
    const deps: SaveCardDeps = {
      addVault: async (options) => {
        calls.addVault.push(options)
        return NEW_VAULT
      },
      validate: async (options) => {
        calls.validate.push(options)
        return { ok: true, message: 'SUCCESS' }
      },
      existing: null,
      upsert: async (input) => {
        calls.upsert.push(input)
        return {
          brand: input.brand ?? null,
          last4: input.last4 ?? null,
          expMonth: input.expMonth ?? null,
          expYear: input.expYear ?? null,
          verified: input.verifiedAt != null,
          verifiedAt: input.verifiedAt,
        }
      },
      deleteVault: async (customerVaultId) => {
        calls.deleteVault.push(customerVaultId)
      },
      now: () => NOW,
      ...overrides,
    }
    return { deps, calls }
  }

  test('verified card: vaults, validates against the platform processor, stores verified_at, returns 200', async () => {
    const { deps, calls } = harness({ processorId: 'mid-platform' })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      brand: 'visa',
      last4: '4242',
      expMonth: 10,
      expYear: 2027,
      verified: true,
      verifiedAt: NOW,
    })
    expect(calls.addVault).toEqual([
      { paymentToken: 'tok_abc', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    ])
    expect(calls.validate).toEqual([{ customerVaultId: 'vault-new', processorId: 'mid-platform' }])
    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]).toMatchObject({
      userId: 'user-1',
      customerVaultId: 'vault-new',
      verifiedAt: NOW,
      unvoidedAuthTransactionId: null,
    })
    // Nothing to clean up on a first card.
    expect(calls.deleteVault).toEqual([])
  })

  test('vault add rejected by the gateway: 402 with the gateway message, nothing stored', async () => {
    const { deps, calls } = harness({
      addVault: async () => {
        throw new NmiError('NMI customer vault add failed: DECLINE', parseResponse(DECLINED_VAULT_ADD))
      },
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(402)
    expect(result.body).toEqual({ error: 'DECLINE' })
    expect(calls.validate).toEqual([])
    expect(calls.upsert).toEqual([])
    expect(calls.deleteVault).toEqual([])
  })

  test('vault add HTTP or network failure: 502, nothing stored', async () => {
    for (const failure of [new NmiError('NMI gateway responded HTTP 503', undefined, 503), new Error('ECONNRESET')]) {
      const { deps, calls } = harness({
        addVault: async () => {
          throw failure
        },
      })
      const result = await saveCardOnFile(deps, INPUT)
      expect(result.status).toBe(502)
      expect((result.body as { error: string }).error).toMatch(/unavailable/i)
      expect(calls.upsert).toEqual([])
    }
  })

  test('validate throws: 502, existing row untouched, the orphaned new vault record is removed', async () => {
    const { deps, calls } = harness({
      existing: EXISTING_VERIFIED,
      validate: async () => {
        throw new Error('ETIMEDOUT')
      },
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(502)
    expect(calls.upsert).toEqual([])
    expect(calls.deleteVault).toEqual(['vault-new'])
  })

  test('validate declines: 402 with the gateway message, existing row untouched, new vault removed', async () => {
    const { deps, calls } = harness({
      existing: EXISTING_VERIFIED,
      validate: async () => ({ ok: false, message: 'DECLINE REFID:987' }),
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(402)
    expect(result.body).toEqual({ error: 'DECLINE' })
    // The bidder keeps their verified card: no write, and the OLD vault is kept.
    expect(calls.upsert).toEqual([])
    expect(calls.deleteVault).toEqual(['vault-new'])
  })

  test('validate ok via the $1.00 fallback whose void failed: the auth id is stored', async () => {
    const { deps, calls } = harness({
      validate: async () => ({ ok: true, message: 'SUCCESS', transactionId: 'auth-1', unvoidedAuthTransactionId: 'auth-1' }),
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(200)
    expect(calls.upsert[0].unvoidedAuthTransactionId).toBe('auth-1')
  })

  test('a prior unvoided auth id is kept when the new verification produced none', async () => {
    const { deps, calls } = harness({
      existing: { ...EXISTING_VERIFIED, unvoidedAuthTransactionId: 'auth-old' },
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(200)
    expect(calls.upsert[0].unvoidedAuthTransactionId).toBe('auth-old')
  })

  test('successful replace: the previous vault record is deleted, best effort', async () => {
    const { deps, calls } = harness({ existing: EXISTING_VERIFIED })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(200)
    expect(calls.upsert).toHaveLength(1)
    expect(calls.deleteVault).toEqual(['vault-old'])
  })

  test('re-vaulting to the same vault id does not delete it', async () => {
    const { deps, calls } = harness({ existing: { ...EXISTING_VERIFIED, customerVaultId: 'vault-new' } })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(200)
    expect(calls.deleteVault).toEqual([])
  })

  test('a failing vault delete never changes the outcome', async () => {
    const { deps, calls } = harness({
      existing: EXISTING_VERIFIED,
      deleteVault: async () => {
        throw new Error('gateway down')
      },
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(200)
    expect(calls.upsert).toHaveLength(1)
  })

  test('no deleteVault dependency is fine', async () => {
    const { deps } = harness({ existing: EXISTING_VERIFIED, deleteVault: undefined })
    const result = await saveCardOnFile(deps, INPUT)
    expect(result.status).toBe(200)
  })

  test('upsert throws: 500, and the verified-but-unstored vault record is removed', async () => {
    const { deps, calls } = harness({
      existing: EXISTING_VERIFIED,
      upsert: async () => {
        throw new Error('relation "bidder_payment_methods" does not exist')
      },
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(500)
    expect((result.body as { error: string }).error).toMatch(/could not save/i)
    // The old card is still on file, so only the new vault is cleaned up.
    expect(calls.deleteVault).toEqual(['vault-new'])
  })

  test('replace with a declined card keeps the existing verified row and its vault', async () => {
    const { deps, calls } = harness({
      existing: EXISTING_VERIFIED,
      addVault: async () => ({ ...NEW_VAULT, last4: '0002' }),
      validate: async () => ({ ok: false, message: 'Insufficient funds' }),
    })
    const result = await saveCardOnFile(deps, INPUT)

    expect(result.status).toBe(402)
    expect(result.body).toEqual({ error: 'Insufficient funds' })
    expect(calls.upsert).toEqual([])
    expect(calls.deleteVault).not.toContain('vault-old')
  })
})
