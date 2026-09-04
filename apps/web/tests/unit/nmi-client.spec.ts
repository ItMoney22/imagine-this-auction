import { createHmac } from 'crypto'

import { expect, test } from '@playwright/test'

import {
  addCustomerVault,
  centsToAmount,
  NMI_SANDBOX_SECURITY_KEY,
  NmiError,
  parseResponse,
  refund,
  resolveNmiSecurityKey,
  sale,
  validateCard,
  verifyNmiSignature,
  voidTransaction,
  type NmiFetch,
} from '../../lib/payments/nmi'
import { createNmiHandlerRegistry, dispatchNmiEvent, registerNmiHandler } from '../../lib/payments/nmi-handlers'
import { NmiWebhookEventSchema, type NmiWebhookEvent } from '../../lib/payments/nmi-types'

/**
 * Records every request the client makes and answers from a queue of
 * URL-encoded bodies, exactly as NMI's Direct Post API responds.
 */
function fakeFetch(...bodies: string[]) {
  const calls: { url: string; fields: URLSearchParams; contentType: string | undefined }[] = []
  const queue = [...bodies]

  const fetchImpl: NmiFetch = async (url, init) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    calls.push({
      url,
      fields: new URLSearchParams(String(init.body)),
      contentType: headers['Content-Type'] ?? headers['content-type'],
    })
    const body = queue.shift()
    if (body === undefined) throw new Error('fakeFetch: no response queued')
    return { ok: true, status: 200, text: async () => body }
  }

  return { fetchImpl, calls }
}

const APPROVED_SALE =
  'response=1&responsetext=SUCCESS&authcode=123456&transactionid=9876543210&avsresponse=Y&cvvresponse=M&orderid=inv_1&type=sale&response_code=100'
const DECLINED_SALE =
  'response=2&responsetext=DECLINE&authcode=&transactionid=9876543211&avsresponse=N&cvvresponse=N&orderid=inv_2&type=sale&response_code=200'
const ERROR_SALE =
  'response=3&responsetext=Invalid+Customer+Vault+Id+REFID%3A123&authcode=&transactionid=0&avsresponse=&cvvresponse=&orderid=&type=sale&response_code=300'

const CLIENT = { securityKey: 'test-key', apiUrl: 'https://gateway.test/api/transact.php' }

test.describe('parseResponse', () => {
  test('parses an approved sale', () => {
    const r = parseResponse(APPROVED_SALE)
    expect(r.response).toBe(1)
    expect(r.responsetext).toBe('SUCCESS')
    expect(r.authcode).toBe('123456')
    expect(r.transactionid).toBe('9876543210')
    expect(r.avsresponse).toBe('Y')
    expect(r.cvvresponse).toBe('M')
    expect(r.orderid).toBe('inv_1')
    expect(r.type).toBe('sale')
    expect(r.response_code).toBe(100)
    expect(r.customer_vault_id).toBeUndefined()
  })

  test('parses a decline', () => {
    const r = parseResponse(DECLINED_SALE)
    expect(r.response).toBe(2)
    expect(r.responsetext).toBe('DECLINE')
    expect(r.response_code).toBe(200)
  })

  test('parses a gateway error and decodes the message', () => {
    const r = parseResponse(ERROR_SALE)
    expect(r.response).toBe(3)
    expect(r.responsetext).toBe('Invalid Customer Vault Id REFID:123')
    expect(r.response_code).toBe(300)
    expect(r.transactionid).toBe('0')
  })

  test('keeps vault ids and unknown keys', () => {
    const r = parseResponse(
      'response=1&responsetext=Customer+Added&customer_vault_id=1234567890&cc_type=visa&response_code=100'
    )
    expect(r.customer_vault_id).toBe('1234567890')
    expect(r.raw.cc_type).toBe('visa')
  })

  test('treats a body with an unrecognised response flag as an error', () => {
    const r = parseResponse('responsetext=garbage')
    expect(r.response).toBe(3)
    expect(r.response_code).toBe(0)
  })
})

test.describe('centsToAmount', () => {
  test('formats with two decimals using integer math', () => {
    expect(centsToAmount(0)).toBe('0.00')
    expect(centsToAmount(5)).toBe('0.05')
    expect(centsToAmount(1234)).toBe('12.34')
    expect(centsToAmount(100000)).toBe('1000.00')
  })

  test('does not drift on values that break floating point', () => {
    // 1005 / 100 is 10.049999... in binary floating point
    expect(centsToAmount(1005)).toBe('10.05')
    expect(centsToAmount(2999)).toBe('29.99')
  })

  test('rejects fractional or negative cents', () => {
    expect(() => centsToAmount(12.5)).toThrow()
    expect(() => centsToAmount(-1)).toThrow()
    expect(() => centsToAmount(Number.NaN)).toThrow()
  })
})

test.describe('security key resolution', () => {
  test('uses the configured key when present', () => {
    expect(resolveNmiSecurityKey({ NMI_SECURITY_KEY: 'live-key', NODE_ENV: 'production' })).toBe('live-key')
  })

  test('falls back to the public sandbox key outside production', () => {
    expect(resolveNmiSecurityKey({ NODE_ENV: 'development' })).toBe(NMI_SANDBOX_SECURITY_KEY)
    expect(resolveNmiSecurityKey({})).toBe(NMI_SANDBOX_SECURITY_KEY)
  })

  test('never falls back in production', () => {
    expect(() => resolveNmiSecurityKey({ NODE_ENV: 'production' })).toThrow(/NMI_SECURITY_KEY/)
    expect(() => resolveNmiSecurityKey({ NODE_ENV: 'production', NMI_SECURITY_KEY: '   ' })).toThrow(
      /NMI_SECURITY_KEY/
    )
  })
})

test.describe('sale', () => {
  test('posts a form-encoded sale routed to the given processor', async () => {
    const { fetchImpl, calls } = fakeFetch(APPROVED_SALE)

    const result = await sale(
      {
        customerVaultId: 'vault_42',
        amountCents: 12345,
        processorId: 'auctioneer_mid_7',
        orderId: 'inv_1',
        orderDescription: 'Lot 12: Vintage lamp',
        taxCents: 100,
        shippingCents: 250,
        ipAddress: '203.0.113.9',
        merchantDefinedFields: ['invoice:inv_1', 'auction:auc_9'],
      },
      { ...CLIENT, fetchImpl }
    )

    expect(result.response).toBe(1)
    expect(result.transactionid).toBe('9876543210')

    expect(calls).toHaveLength(1)
    const { url, fields, contentType } = calls[0]
    expect(url).toBe(CLIENT.apiUrl)
    expect(contentType).toBe('application/x-www-form-urlencoded')
    expect(fields.get('security_key')).toBe('test-key')
    expect(fields.get('type')).toBe('sale')
    expect(fields.get('customer_vault_id')).toBe('vault_42')
    expect(fields.get('amount')).toBe('123.45')
    expect(fields.get('processor_id')).toBe('auctioneer_mid_7')
    expect(fields.get('orderid')).toBe('inv_1')
    expect(fields.get('order_description')).toBe('Lot 12: Vintage lamp')
    expect(fields.get('tax')).toBe('1.00')
    expect(fields.get('shipping')).toBe('2.50')
    expect(fields.get('ipaddress')).toBe('203.0.113.9')
    expect(fields.get('merchant_defined_field_1')).toBe('invoice:inv_1')
    expect(fields.get('merchant_defined_field_2')).toBe('auction:auc_9')
  })

  test('omits processor_id when none is given so the gateway default MID is used', async () => {
    const { fetchImpl, calls } = fakeFetch(APPROVED_SALE)
    await sale({ customerVaultId: 'vault_42', amountCents: 500, orderId: 'inv_3' }, { ...CLIENT, fetchImpl })
    expect(calls[0].fields.has('processor_id')).toBe(false)
    expect(calls[0].fields.has('tax')).toBe(false)
  })

  test('returns a decline rather than throwing so callers can record the reason', async () => {
    const { fetchImpl } = fakeFetch(DECLINED_SALE)
    const result = await sale(
      { customerVaultId: 'vault_42', amountCents: 500, orderId: 'inv_3' },
      { ...CLIENT, fetchImpl }
    )
    expect(result.response).toBe(2)
    expect(result.responsetext).toBe('DECLINE')
  })

  test('throws when the gateway is unreachable', async () => {
    const fetchImpl: NmiFetch = async () => ({ ok: false, status: 502, text: async () => 'Bad Gateway' })
    await expect(
      sale({ customerVaultId: 'vault_42', amountCents: 500, orderId: 'inv_3' }, { ...CLIENT, fetchImpl })
    ).rejects.toBeInstanceOf(NmiError)
  })

  test('refuses a zero or negative amount before touching the network', async () => {
    const { fetchImpl, calls } = fakeFetch(APPROVED_SALE)
    await expect(
      sale({ customerVaultId: 'vault_42', amountCents: 0, orderId: 'inv_3' }, { ...CLIENT, fetchImpl })
    ).rejects.toThrow(RangeError)
    expect(calls).toHaveLength(0)
  })
})

test.describe('refund and void', () => {
  test('refund sends the transaction id and optional partial amount', async () => {
    const { fetchImpl, calls } = fakeFetch(APPROVED_SALE, APPROVED_SALE)
    await refund({ transactionId: '9876543210', amountCents: 1500 }, { ...CLIENT, fetchImpl })
    await refund({ transactionId: '9876543210' }, { ...CLIENT, fetchImpl })

    expect(calls[0].fields.get('type')).toBe('refund')
    expect(calls[0].fields.get('transactionid')).toBe('9876543210')
    expect(calls[0].fields.get('amount')).toBe('15.00')
    expect(calls[1].fields.has('amount')).toBe(false)
  })

  test('void sends type=void with the transaction id', async () => {
    const { fetchImpl, calls } = fakeFetch(APPROVED_SALE)
    await voidTransaction({ transactionId: '9876543210' }, { ...CLIENT, fetchImpl })
    expect(calls[0].fields.get('type')).toBe('void')
    expect(calls[0].fields.get('transactionid')).toBe('9876543210')
  })
})

test.describe('addCustomerVault', () => {
  test('adds a customer from a Collect.js token and maps the vault id and card details', async () => {
    const { fetchImpl, calls } = fakeFetch(
      'response=1&responsetext=Customer+Added&authcode=&transactionid=0&avsresponse=&cvvresponse=&orderid=&type=&response_code=100&customer_vault_id=1497262939&cc_number=4xxxxxxxxxxx1111&cc_exp=1027&cc_type=visa'
    )

    const result = await addCustomerVault(
      {
        paymentToken: '00000000-000000-000000-000000000000',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      },
      { ...CLIENT, fetchImpl }
    )

    expect(result.customerVaultId).toBe('1497262939')
    expect(result.last4).toBe('1111')
    expect(result.brand).toBe('visa')
    expect(result.expMonth).toBe(10)
    expect(result.expYear).toBe(2027)

    const { fields } = calls[0]
    expect(fields.get('customer_vault')).toBe('add_customer')
    expect(fields.get('payment_token')).toBe('00000000-000000-000000-000000000000')
    expect(fields.get('first_name')).toBe('Ada')
    expect(fields.get('last_name')).toBe('Lovelace')
    expect(fields.get('email')).toBe('ada@example.com')
    expect(fields.get('security_key')).toBe('test-key')
  })

  test('leaves card details undefined when the gateway omits them', async () => {
    const { fetchImpl } = fakeFetch('response=1&responsetext=Customer+Added&response_code=100&customer_vault_id=555')
    const result = await addCustomerVault(
      { paymentToken: 'tok', firstName: 'A', lastName: 'B', email: 'a@b.c' },
      { ...CLIENT, fetchImpl }
    )
    expect(result.customerVaultId).toBe('555')
    expect(result.last4).toBeUndefined()
    expect(result.brand).toBeUndefined()
    expect(result.expMonth).toBeUndefined()
    expect(result.expYear).toBeUndefined()
  })

  test('throws an NmiError carrying the gateway message when the add fails', async () => {
    const { fetchImpl } = fakeFetch('response=3&responsetext=Invalid+payment+token&response_code=300')
    await expect(
      addCustomerVault(
        { paymentToken: 'bad', firstName: 'A', lastName: 'B', email: 'a@b.c' },
        { ...CLIENT, fetchImpl }
      )
    ).rejects.toThrow(/Invalid payment token/)
  })
})

test.describe('validateCard', () => {
  test('uses type=validate when the processor supports it', async () => {
    const { fetchImpl, calls } = fakeFetch(
      'response=1&responsetext=SUCCESS&authcode=&transactionid=111&avsresponse=Y&cvvresponse=M&type=validate&response_code=100'
    )
    const result = await validateCard({ customerVaultId: 'vault_1', processorId: 'mid_1' }, { ...CLIENT, fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.transactionId).toBe('111')
    expect(result.avsresponse).toBe('Y')
    expect(result.cvvresponse).toBe('M')
    expect(calls).toHaveLength(1)
    expect(calls[0].fields.get('type')).toBe('validate')
    expect(calls[0].fields.get('customer_vault_id')).toBe('vault_1')
    expect(calls[0].fields.get('processor_id')).toBe('mid_1')
  })

  test('falls back to a $1.00 auth immediately voided when validate is unsupported', async () => {
    const { fetchImpl, calls } = fakeFetch(
      'response=3&responsetext=Transaction+type+not+supported&transactionid=0&type=validate&response_code=300',
      'response=1&responsetext=SUCCESS&authcode=A1&transactionid=222&avsresponse=Y&cvvresponse=M&type=auth&response_code=100',
      'response=1&responsetext=Transaction+Void+Successful&transactionid=222&type=void&response_code=100'
    )
    const result = await validateCard({ customerVaultId: 'vault_1' }, { ...CLIENT, fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.transactionId).toBe('222')
    expect(calls.map((c) => c.fields.get('type'))).toEqual(['validate', 'auth', 'void'])
    expect(calls[1].fields.get('amount')).toBe('1.00')
    expect(calls[1].fields.get('customer_vault_id')).toBe('vault_1')
    expect(calls[2].fields.get('transactionid')).toBe('222')
  })

  test('reports a declined card without falling back', async () => {
    const { fetchImpl, calls } = fakeFetch(
      'response=2&responsetext=DECLINE&transactionid=333&avsresponse=N&cvvresponse=N&type=validate&response_code=200'
    )
    const result = await validateCard({ customerVaultId: 'vault_1' }, { ...CLIENT, fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('DECLINE')
    expect(calls).toHaveLength(1)
  })
})

test.describe('verifyNmiSignature', () => {
  const key = 'whsec_test_key'
  const body = '{"event_id":"evt_1","event_type":"transaction.sale.success","event_body":{}}'
  const now = 1_757_000_000 // seconds

  function sign(nonce: string, payload = body, signingKey = key) {
    return createHmac('sha256', signingKey).update(`${nonce}.${payload}`).digest('hex')
  }

  test('accepts a valid signature with a fresh timestamp', () => {
    const t = String(now - 10)
    const result = verifyNmiSignature(`t=${t},s=${sign(t)}`, body, key, { nowSeconds: now })
    expect(result.ok).toBe(true)
  })

  test('accepts the header with a space after the comma', () => {
    const t = String(now)
    expect(verifyNmiSignature(`t=${t}, s=${sign(t)}`, body, key, { nowSeconds: now }).ok).toBe(true)
  })

  test('rejects a signature made with a different key', () => {
    const t = String(now)
    const result = verifyNmiSignature(`t=${t},s=${sign(t, body, 'other-key')}`, body, key, { nowSeconds: now })
    expect(result.ok).toBe(false)
  })

  test('rejects when the body was tampered with', () => {
    const t = String(now)
    const result = verifyNmiSignature(`t=${t},s=${sign(t)}`, body.replace('evt_1', 'evt_2'), key, {
      nowSeconds: now,
    })
    expect(result.ok).toBe(false)
  })

  test('rejects a signature of the wrong length without throwing', () => {
    const t = String(now)
    expect(verifyNmiSignature(`t=${t},s=abc123`, body, key, { nowSeconds: now }).ok).toBe(false)
    expect(verifyNmiSignature(`t=${t},s=`, body, key, { nowSeconds: now }).ok).toBe(false)
  })

  test('rejects a timestamp more than five minutes old or in the future', () => {
    const stale = String(now - 6 * 60)
    const future = String(now + 6 * 60)
    expect(verifyNmiSignature(`t=${stale},s=${sign(stale)}`, body, key, { nowSeconds: now }).ok).toBe(false)
    expect(verifyNmiSignature(`t=${future},s=${sign(future)}`, body, key, { nowSeconds: now }).ok).toBe(false)
  })

  test('accepts a timestamp just inside the window', () => {
    const t = String(now - 4 * 60)
    expect(verifyNmiSignature(`t=${t},s=${sign(t)}`, body, key, { nowSeconds: now }).ok).toBe(true)
  })

  test('accepts a non-numeric nonce when the HMAC matches', () => {
    // NMI documents `t` as a nonce; freshness is only enforced when it is clearly a timestamp.
    const nonce = 'a1b2c3d4'
    expect(verifyNmiSignature(`t=${nonce},s=${sign(nonce)}`, body, key, { nowSeconds: now }).ok).toBe(true)
  })

  test('rejects a missing or malformed header', () => {
    expect(verifyNmiSignature(null, body, key, { nowSeconds: now }).ok).toBe(false)
    expect(verifyNmiSignature('', body, key, { nowSeconds: now }).ok).toBe(false)
    expect(verifyNmiSignature('s=abc', body, key, { nowSeconds: now }).ok).toBe(false)
    expect(verifyNmiSignature('t=123', body, key, { nowSeconds: now }).ok).toBe(false)
  })

  test('rejects when the signing key is empty', () => {
    const t = String(now)
    expect(verifyNmiSignature(`t=${t},s=${sign(t, body, '')}`, body, '', { nowSeconds: now }).ok).toBe(false)
  })
})

test.describe('webhook event schema', () => {
  test('accepts a sale event and keeps fields it does not model', () => {
    const parsed = NmiWebhookEventSchema.safeParse({
      event_id: 'evt_1',
      event_type: 'transaction.sale.success',
      event_body: {
        transaction_id: '123',
        condition: 'pendingsettlement',
        order_id: 'inv_1',
        processor_id: 'mid_7',
        action: { amount: '12.34', response_text: 'SUCCESS', action_type: 'sale' },
        merchant_defined_fields: [{ id: 1, value: 'invoice:inv_1' }],
        card: { cc_type: 'visa' },
      },
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.event_body.action?.amount).toBe('12.34')
    expect((parsed.data.event_body as Record<string, unknown>).processor_id).toBe('mid_7')
    expect((parsed.data.event_body as Record<string, unknown>).card).toEqual({ cc_type: 'visa' })
  })

  test('accepts a settlement event with no transaction fields', () => {
    const parsed = NmiWebhookEventSchema.safeParse({
      event_id: 'evt_2',
      event_type: 'settlement.batch.complete',
      event_body: { batch_id: '99' },
    })
    expect(parsed.success).toBe(true)
  })

  test('rejects a payload without an event id, type, or body', () => {
    expect(NmiWebhookEventSchema.safeParse({ event_type: 'x', event_body: {} }).success).toBe(false)
    expect(NmiWebhookEventSchema.safeParse({ event_id: 'x', event_body: {} }).success).toBe(false)
    expect(NmiWebhookEventSchema.safeParse({ event_id: 'x', event_type: 'y' }).success).toBe(false)
  })
})

test.describe('handler registry', () => {
  function event(type: string): NmiWebhookEvent {
    return { event_id: `evt_${type}`, event_type: type, event_body: {} }
  }

  test('dispatches to the handler registered for the exact event type', async () => {
    const seen: string[] = []
    const registry = createNmiHandlerRegistry(() => {
      seen.push('default')
    })
    registry.register('transaction.sale.success', (e) => {
      seen.push(`sale:${e.event_id}`)
    })

    const result = await registry.dispatch(event('transaction.sale.success'))

    expect(result).toEqual({ handled: true, handlerKey: 'transaction.sale.success' })
    expect(seen).toEqual(['sale:evt_transaction.sale.success'])
  })

  test('routes by dotted prefix so a chargeback handler catches every chargeback event', async () => {
    const seen: string[] = []
    const registry = createNmiHandlerRegistry(() => {
      seen.push('default')
    })
    registry.register('chargeback', (e) => {
      seen.push(e.event_type)
    })
    registry.register('transaction.refund', () => {
      seen.push('refund-prefix')
    })
    registry.register('transaction.refund.success', () => {
      seen.push('refund-exact')
    })

    await registry.dispatch(event('chargeback.received'))
    await registry.dispatch(event('transaction.refund.success'))
    await registry.dispatch(event('transaction.refund.failure'))
    // A prefix only matches on a dot boundary: "chargebacks.foo" is not "chargeback.*"
    await registry.dispatch(event('chargebacks.foo'))

    expect(seen).toEqual(['chargeback.received', 'refund-exact', 'refund-prefix', 'default'])
  })

  test('falls back to the default handler for unregistered types', async () => {
    const fallback: NmiWebhookEvent[] = []
    const registry = createNmiHandlerRegistry((e) => {
      fallback.push(e)
    })

    const result = await registry.dispatch(event('settlement.batch.complete'))

    expect(result).toEqual({ handled: false })
    expect(fallback).toHaveLength(1)
    expect(fallback[0].event_type).toBe('settlement.batch.complete')
  })

  test('propagates handler errors so the webhook route can return 500 for a retry', async () => {
    const registry = createNmiHandlerRegistry(() => {})
    registry.register('transaction.void.success', () => {
      throw new Error('db down')
    })
    await expect(registry.dispatch(event('transaction.void.success'))).rejects.toThrow('db down')
  })

  test('the module-level registry wires registerNmiHandler to dispatchNmiEvent', async () => {
    let called = false
    registerNmiHandler('transaction.sale.failure', () => {
      called = true
    })
    const result = await dispatchNmiEvent(event('transaction.sale.failure'))
    expect(called).toBe(true)
    expect(result.handled).toBe(true)
  })
})
