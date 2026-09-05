import { z } from 'zod'

/**
 * Types for the NMI gateway (provisioned through PaymentCloud).
 *
 * One gateway, many merchant accounts: every auctioneer has their own
 * merchant account (`processor_id`) under the shared gateway, bidders keep one
 * card in the gateway-level Customer Vault, and ITA's own `processor_id`
 * takes platform fees and delivery charges.
 */

/** NMI Direct Post `response` flag: 1 approved, 2 declined, 3 error. */
export type NmiResponseFlag = 1 | 2 | 3

/** A parsed Direct Post (`transact.php`) response. */
export interface NmiResponse {
  response: NmiResponseFlag
  responsetext: string
  authcode: string
  transactionid: string
  avsresponse: string
  cvvresponse: string
  orderid: string
  type: string
  /** Numeric result code (100 approved, 2xx declined, 3xx gateway rejected, 4xx error). 0 when absent. */
  response_code: number
  customer_vault_id?: string
  /** Every key/value pair from the body, including ones not modelled above. */
  raw: Record<string, string>
}

/** Minimal fetch surface so tests can capture requests without a real network. */
export type NmiFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export interface NmiClientOptions {
  fetchImpl?: NmiFetch
  /** Overrides `NMI_SECURITY_KEY` (and the sandbox fallback). */
  securityKey?: string
  /** Overrides `NMI_API_URL`. */
  apiUrl?: string
}

export interface AddCustomerVaultOptions {
  /** Token minted in the browser by Collect.js. */
  paymentToken: string
  firstName: string
  lastName: string
  email: string
}

export interface AddCustomerVaultResult {
  customerVaultId: string
  last4?: string
  brand?: string
  expMonth?: number
  expYear?: number
  response: NmiResponse
}

export interface ValidateCardOptions {
  customerVaultId: string
  processorId?: string
}

export interface ValidateCardResult {
  ok: boolean
  transactionId?: string
  avsresponse?: string
  cvvresponse?: string
  message: string
  /**
   * Set when the $1.00 fallback auth was approved but its void failed. The
   * card is valid; the hold drops off on its own. Persist it so the auth can
   * be voided later if a bidder asks.
   */
  unvoidedAuthTransactionId?: string
}

export interface SaleOptions {
  customerVaultId: string
  amountCents: number
  /** Merchant account under the shared gateway; omitted = gateway default. */
  processorId?: string
  orderId: string
  orderDescription?: string
  taxCents?: number
  shippingCents?: number
  ipAddress?: string
  /** Sent as merchant_defined_field_1..N in order. */
  merchantDefinedFields?: string[]
}

export interface RefundOptions {
  transactionId: string
  /** Omit for a full refund. */
  amountCents?: number
}

export interface VoidOptions {
  transactionId: string
}

/**
 * Webhook payload. NMI varies `event_body` by event type (a settlement event
 * has no transaction fields), so only the envelope is required and every
 * object is loose so nothing NMI sends is dropped from `payment_events.payload`.
 */
export const NmiWebhookEventSchema = z.looseObject({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  event_body: z.looseObject({
    transaction_id: z.string().optional(),
    condition: z.string().optional(),
    order_id: z.string().optional(),
    processor_id: z.string().optional(),
    customer_vault_id: z.string().optional(),
    action: z
      .looseObject({
        amount: z.union([z.string(), z.number()]).optional(),
        action_type: z.string().optional(),
        response_text: z.string().optional(),
        response_code: z.union([z.string(), z.number()]).optional(),
        success: z.union([z.string(), z.number(), z.boolean()]).optional(),
      })
      .optional(),
    merchant_defined_fields: z.unknown().optional(),
  }),
})

export type NmiWebhookEvent = z.infer<typeof NmiWebhookEventSchema>
