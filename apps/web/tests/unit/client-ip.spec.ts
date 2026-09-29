import { expect, test } from '@playwright/test'

import { clientIpFromHeaders, isIpLiteral } from '../../lib/payments/client-ip'

/**
 * The IP sent to the gateway decides whose transactions PaymentCloud's per-IP
 * fraud threshold counts, so a wrong answer here either denies honest bidders
 * (our server's address on every charge) or hands an attacker-controlled string
 * to NMI. Both are exercised below.
 */

function headers(values: Record<string, string>): Headers {
  return new Headers(values)
}

test.describe('clientIpFromHeaders', () => {
  test('takes the first entry of x-forwarded-for: the client, not the proxies', () => {
    const h = headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })
    expect(clientIpFromHeaders(h)).toBe('203.0.113.7')
  })

  test('falls back to x-real-ip when there is no forwarded chain', () => {
    expect(clientIpFromHeaders(headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4')
  })

  test('handles IPv6, brackets, ports, and the IPv4-mapped form', () => {
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '[2001:db8::1]:443' }))).toBe('2001:db8::1')
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '203.0.113.7:51000' }))).toBe('203.0.113.7')
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '::ffff:203.0.113.7' }))).toBe('203.0.113.7')
  })

  test('skips junk and keeps looking rather than forwarding it to the gateway', () => {
    // The header is attacker-controlled; NMI rejects the whole transaction on a
    // malformed ipaddress, so a bad first hop must not take the charge down.
    const h = headers({ 'x-forwarded-for': 'unknown, not-an-ip, 203.0.113.7' })
    expect(clientIpFromHeaders(h)).toBe('203.0.113.7')
  })

  test('is undefined when nothing usable is present, so the field is simply omitted', () => {
    expect(clientIpFromHeaders(headers({}))).toBeUndefined()
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '' }))).toBeUndefined()
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '999.1.1.1' }))).toBeUndefined()
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': "1.1.1.1'; DROP TABLE" }))).toBeUndefined()
  })
})

test.describe('isIpLiteral', () => {
  test('accepts the boundaries of IPv4 and rejects what is outside them', () => {
    expect(isIpLiteral('0.0.0.0')).toBe(true)
    expect(isIpLiteral('255.255.255.255')).toBe(true)
    expect(isIpLiteral('256.0.0.1')).toBe(false)
    expect(isIpLiteral('1.2.3')).toBe(false)
    expect(isIpLiteral('1.2.3.4.5')).toBe(false)
  })
})
