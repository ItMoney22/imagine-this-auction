/**
 * Single definition of how a wallet_ledger row moves the ITC balance.
 *
 * This used to be re-implemented as a switch in every page that showed a
 * balance, and each copy silently ignored transaction types it didn't know
 * about. Adding 'ai_spend'/'ai_refund' for AI Quick Listing made that a real
 * bug: AI spending would not have reduced the balance a bidder sees.
 */

export type WalletTransactionType =
  | 'purchase'
  | 'bid_hold'
  | 'bid_refund'
  | 'escrow_hold'
  | 'escrow_release'
  | 'payout'
  | 'ai_spend'
  | 'ai_refund'

/** +1 adds to the balance, -1 subtracts. `amount` is always a positive magnitude. */
export const WALLET_TRANSACTION_SIGN: Record<WalletTransactionType, 1 | -1> = {
  purchase: 1,
  bid_refund: 1,
  escrow_release: 1,
  ai_refund: 1,
  bid_hold: -1,
  escrow_hold: -1,
  payout: -1,
  ai_spend: -1,
}

export const WALLET_TRANSACTION_LABEL: Record<WalletTransactionType, string> = {
  purchase: 'Credit purchase',
  bid_refund: 'Bid refund',
  escrow_release: 'Escrow release',
  ai_refund: 'AI credit refund',
  bid_hold: 'Bid placed',
  escrow_hold: 'Escrow hold',
  payout: 'Payout',
  ai_spend: 'AI action',
}

export interface WalletEntry {
  transaction_type: string
  amount: number
}

export function walletEntryDelta(entry: WalletEntry): number {
  const sign = WALLET_TRANSACTION_SIGN[entry.transaction_type as WalletTransactionType]

  if (sign === undefined) {
    // An unrecognised type must not silently vanish from the balance.
    console.warn(`[wallet] unknown transaction_type: ${entry.transaction_type}`)
    return 0
  }

  return sign * entry.amount
}

export function computeWalletBalance(entries: WalletEntry[] | null | undefined): number {
  return (entries ?? []).reduce((balance, entry) => balance + walletEntryDelta(entry), 0)
}

export function walletEntryLabel(transactionType: string, fallback = ''): string {
  return WALLET_TRANSACTION_LABEL[transactionType as WalletTransactionType] ?? fallback
}
