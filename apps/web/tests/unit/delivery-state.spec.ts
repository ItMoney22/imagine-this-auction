import { expect, test } from '@playwright/test'

import {
  canTransition,
  CUSTOMER_STATUS_LABEL,
  DELIVERY_STATUSES,
  EVENT_LABEL,
  EXCEPTION_REASONS,
  isTerminal,
  LOCATION_ACTIVE_STATUSES,
  TERMINAL_STATUSES,
} from '../../lib/delivery/state'
import {
  generateTrackingNumber,
  generateTrackingToken,
  isValidTrackingNumber,
} from '../../lib/delivery/tracking'

test.describe('delivery status machine', () => {
  test('happy path: created → delivered', () => {
    expect(canTransition('created', 'offered')).toBe(true)
    expect(canTransition('offered', 'claimed')).toBe(true)
    expect(canTransition('claimed', 'arrived')).toBe(true)
    expect(canTransition('arrived', 'picked_up')).toBe(true)
    expect(canTransition('picked_up', 'out_for_delivery')).toBe(true)
    expect(canTransition('out_for_delivery', 'delivered')).toBe(true)
  })

  test('driver can scan-pickup straight from claimed (no arrive step)', () => {
    expect(canTransition('claimed', 'picked_up')).toBe(true)
  })

  test('cannot go out for delivery before pickup scan', () => {
    expect(canTransition('claimed', 'out_for_delivery')).toBe(false)
    expect(canTransition('arrived', 'out_for_delivery')).toBe(false)
    expect(canTransition('offered', 'out_for_delivery')).toBe(false)
  })

  test('cannot deliver without being out for delivery', () => {
    expect(canTransition('picked_up', 'delivered')).toBe(false)
    expect(canTransition('claimed', 'delivered')).toBe(false)
    expect(canTransition('created', 'delivered')).toBe(false)
  })

  test('terminal statuses accept no further transitions (except failed → returned)', () => {
    for (const from of TERMINAL_STATUSES) {
      for (const to of DELIVERY_STATUSES) {
        const allowed = from === 'failed' && to === 'returned'
        expect(canTransition(from, to), `${from} → ${to}`).toBe(allowed)
      }
    }
  })

  test('exceptions can be resolved every documented way', () => {
    expect(canTransition('exception', 'returned')).toBe(true)
    expect(canTransition('exception', 'cancelled')).toBe(true)
    expect(canTransition('exception', 'offered')).toBe(true)
    expect(canTransition('exception', 'out_for_delivery')).toBe(true)
    expect(canTransition('exception', 'delivered')).toBe(false)
  })

  test('reassignment path: claimed/arrived can go back to offered', () => {
    expect(canTransition('claimed', 'offered')).toBe(true)
    expect(canTransition('arrived', 'offered')).toBe(true)
    // But not after the driver has the package
    expect(canTransition('picked_up', 'offered')).toBe(false)
    expect(canTransition('out_for_delivery', 'offered')).toBe(false)
  })

  test('location pings only during active custody statuses', () => {
    expect(LOCATION_ACTIVE_STATUSES).toEqual(['claimed', 'arrived', 'picked_up', 'out_for_delivery'])
    for (const status of TERMINAL_STATUSES) {
      expect(LOCATION_ACTIVE_STATUSES).not.toContain(status)
    }
    expect(LOCATION_ACTIVE_STATUSES).not.toContain('offered')
  })

  test('isTerminal matches TERMINAL_STATUSES', () => {
    for (const status of DELIVERY_STATUSES) {
      expect(isTerminal(status)).toBe(TERMINAL_STATUSES.includes(status))
    }
  })

  test('every status has customer and event labels', () => {
    for (const status of DELIVERY_STATUSES) {
      expect(CUSTOMER_STATUS_LABEL[status], `customer label for ${status}`).toBeTruthy()
      expect(EVENT_LABEL[status], `event label for ${status}`).toBeTruthy()
    }
  })

  test('all spec-required exception reasons exist', () => {
    for (const reason of ['customer_unavailable', 'unsafe_location', 'damaged_item', 'wrong_address', 'vehicle_issue']) {
      expect(EXCEPTION_REASONS).toContain(reason)
    }
  })
})

test.describe('tracking numbers', () => {
  test('format is ITA- plus 10 unambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      const tn = generateTrackingNumber()
      expect(isValidTrackingNumber(tn), tn).toBe(true)
      // The generated suffix avoids ambiguous characters (prefix "ITA-" aside)
      expect(tn.slice(4)).not.toMatch(/[01OIL]/)
    }
  })

  test('validator rejects junk', () => {
    expect(isValidTrackingNumber('ITA-SHORT')).toBe(false)
    expect(isValidTrackingNumber('ABC-7KQ2M9XW4T')).toBe(false)
    expect(isValidTrackingNumber('')).toBe(false)
    expect(isValidTrackingNumber("ITA-'; DROP--")).toBe(false)
  })

  test('tracking tokens are long and unique', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const token = generateTrackingToken()
      expect(token).toMatch(/^[0-9a-f]{48}$/)
      expect(seen.has(token)).toBe(false)
      seen.add(token)
    }
  })
})
