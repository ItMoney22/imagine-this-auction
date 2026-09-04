import { expect, test } from '@playwright/test'

import {
  computeWalletBalance,
  WALLET_TRANSACTION_SIGN,
  walletEntryDelta,
  walletEntryLabel,
} from '../../lib/wallet/balance'

test.describe('wallet balance', () => {
  test('credits add and debits subtract', () => {
    expect(walletEntryDelta({ transaction_type: 'purchase', amount: 1000 })).toBe(1000)
    expect(walletEntryDelta({ transaction_type: 'bid_hold', amount: 250 })).toBe(-250)
  })

  test('AI spend reduces the balance', () => {
    // Regression guard: the old per-page switch statements ignored unknown
    // types, which would have made AI spending invisible in the balance.
    expect(walletEntryDelta({ transaction_type: 'ai_spend', amount: 10 })).toBe(-10)
  })

  test('AI refunds restore the balance', () => {
    expect(walletEntryDelta({ transaction_type: 'ai_refund', amount: 10 })).toBe(10)
  })

  test('a spend followed by its refund nets to zero', () => {
    const balance = computeWalletBalance([
      { transaction_type: 'purchase', amount: 500 },
      { transaction_type: 'ai_spend', amount: 25 },
      { transaction_type: 'ai_refund', amount: 25 },
    ])

    expect(balance).toBe(500)
  })

  test('a full ledger sums correctly across every type', () => {
    const balance = computeWalletBalance([
      { transaction_type: 'purchase', amount: 1000 },
      { transaction_type: 'bid_hold', amount: 200 },
      { transaction_type: 'bid_refund', amount: 200 },
      { transaction_type: 'escrow_hold', amount: 300 },
      { transaction_type: 'escrow_release', amount: 300 },
      { transaction_type: 'ai_spend', amount: 15 },
      { transaction_type: 'payout', amount: 100 },
    ])

    expect(balance).toBe(885)
  })

  test('every declared transaction type has a sign and a label', () => {
    for (const type of Object.keys(WALLET_TRANSACTION_SIGN)) {
      expect(Math.abs(WALLET_TRANSACTION_SIGN[type as never])).toBe(1)
      expect(walletEntryLabel(type)).not.toBe('')
    }
  })

  test('an unknown type contributes nothing rather than corrupting the total', () => {
    expect(walletEntryDelta({ transaction_type: 'not_a_real_type', amount: 999 })).toBe(0)
  })

  test('an empty or missing ledger is zero', () => {
    expect(computeWalletBalance([])).toBe(0)
    expect(computeWalletBalance(null)).toBe(0)
    expect(computeWalletBalance(undefined)).toBe(0)
  })
})
