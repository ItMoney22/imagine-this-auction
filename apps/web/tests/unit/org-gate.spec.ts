import { expect, test } from '@playwright/test'

import { canAccessOrg, pendingVariantFor } from '../../lib/auth/org-gate'

test.describe('org access gate', () => {
  test('approved auctioneer may enter /org', () => {
    expect(canAccessOrg({ role: 'auctioneer', is_approved: true })).toBe(true)
  })

  test('unapproved auctioneer is kept out (goes to /org/pending)', () => {
    expect(canAccessOrg({ role: 'auctioneer', is_approved: false })).toBe(false)
  })

  test('auctioneer with unknown approval state is kept out', () => {
    expect(canAccessOrg({ role: 'auctioneer', is_approved: null })).toBe(false)
    expect(canAccessOrg({ role: 'auctioneer', is_approved: undefined })).toBe(false)
  })

  test('bidders never enter /org, approved or not', () => {
    expect(canAccessOrg({ role: 'bidder', is_approved: true })).toBe(false)
    expect(canAccessOrg({ role: 'bidder', is_approved: false })).toBe(false)
  })

  test('drivers never enter /org', () => {
    expect(canAccessOrg({ role: 'driver', is_approved: true })).toBe(false)
  })

  test('admins do not enter /org (the existing layout sends them to /dashboard)', () => {
    expect(canAccessOrg({ role: 'admin', is_approved: true })).toBe(false)
  })

  test('missing role is kept out', () => {
    expect(canAccessOrg({ role: null, is_approved: true })).toBe(false)
    expect(canAccessOrg({ role: undefined, is_approved: true })).toBe(false)
  })

  test('role comparison is exact (no case folding, no whitespace tolerance)', () => {
    expect(canAccessOrg({ role: 'Auctioneer', is_approved: true })).toBe(false)
    expect(canAccessOrg({ role: ' auctioneer', is_approved: true })).toBe(false)
  })
})

test.describe('pending notice variant', () => {
  test('a rejected license shows the rejected notice', () => {
    expect(pendingVariantFor('rejected')).toBe('rejected')
  })

  test('pending, approved, missing, or unknown statuses show the pending notice', () => {
    expect(pendingVariantFor('pending')).toBe('pending')
    expect(pendingVariantFor('approved')).toBe('pending')
    expect(pendingVariantFor(null)).toBe('pending')
    expect(pendingVariantFor(undefined)).toBe('pending')
    expect(pendingVariantFor('REJECTED')).toBe('pending')
  })
})
