import { z } from 'zod'
export type CardPaymentResponse = {
  success: boolean
  status: 'pending' | 'redirect'
  paymentReference?: string
  redirectUrl?: string
  error?: string
  requiresProviderSetup?: boolean
}

export const PAYMENTCLOUD_PACK_IDS = ['pack_100', 'pack_275', 'pack_600', 'pack_1300'] as const

export const PaymentCloudWebhookSchema = z.object({
  eventId: z.string(),
  type: z.enum(['sale.approved', 'sale.declined', 'sale.pending', 'refund.processed']).default('sale.approved'),
  occurredAt: z.string().datetime().optional(),
  payload: z.object({
    userId: z.string().uuid('userId must be a valid UUID'),
    packId: z.enum(PAYMENTCLOUD_PACK_IDS),
    amountUsdCents: z.number().int().positive(),
    creditAmount: z.number().int().positive(),
    description: z.string().default('ITC Credit Purchase'),
  }),
})

export type PaymentCloudWebhookEvent = z.infer<typeof PaymentCloudWebhookSchema>

export interface WalletTransaction {
  id: string
  type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release'
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
