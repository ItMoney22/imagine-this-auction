/**
 * Wallet-display types only. The PaymentCloud webhook schema that lived here
 * was removed with the PaymentCloud stub (see docs/PAYMENTS.md for the NMI
 * integration in lib/payments/nmi*.ts). This file is deleted together with
 * the wallet components that still import it (Task 4d).
 */

export type CardPaymentResponse = {
  success: boolean
  status: 'pending' | 'redirect'
  paymentReference?: string
  redirectUrl?: string
  error?: string
  requiresProviderSetup?: boolean
}

export interface WalletTransaction {
  id: string
  type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
  amount_itc: number
  created_at: string
  ref_table?: string | null
  ref_id?: string | null
  description?: string | null
}

export interface WalletBalance {
  balance: number
  transactions: WalletTransaction[]
}
