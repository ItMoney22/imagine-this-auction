import { z } from 'zod'

export const SUPPORTED_PROVIDERS = ['paymentcloud', 'nowpayments', 'hybrid-escrow'] as const

export type PaymentProvider = (typeof SUPPORTED_PROVIDERS)[number]

export const PAYMENT_PROVIDER: PaymentProvider = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER as PaymentProvider) || 'paymentcloud'

export const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  paymentcloud: 'PaymentCloud',
  'nowpayments': 'NOWPayments',
  'hybrid-escrow': 'Hybrid Escrow',
}

// Credit pack configurations reused across providers
export const CREDIT_PACKS = {
  pack_100: {
    name: '100 ITC Credits',
    amount: 100,
    price: 999, // cents
    description: 'Perfect for new bidders',
  },
  pack_275: {
    name: '275 ITC Credits',
    amount: 275,
    price: 2499,
    description: 'Popular choice - 10% bonus!'
  },
  pack_600: {
    name: '600 ITC Credits',
    amount: 600,
    price: 4999,
    description: 'Best value - 20% bonus!'
  },
  pack_1300: {
    name: '1300 ITC Credits',
    amount: 1300,
    price: 9999,
    description: 'Maximum savings - 30% bonus!'
  }
} as const

export type CreditPackId = keyof typeof CREDIT_PACKS

export function getCreditPack(packId: string): typeof CREDIT_PACKS[CreditPackId] | null {
  if (packId in CREDIT_PACKS) {
    return CREDIT_PACKS[packId as CreditPackId]
  }
  return null
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export const CardPaymentRequestSchema = z.object({
  packId: z.enum(Object.keys(CREDIT_PACKS) as [CreditPackId, ...CreditPackId[]]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})
