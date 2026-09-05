import { createHmac, timingSafeEqual } from 'crypto'

import type {
  AddCustomerVaultOptions,
  AddCustomerVaultResult,
  NmiClientOptions,
  NmiFetch,
  NmiResponse,
  NmiResponseFlag,
  RefundOptions,
  SaleOptions,
  ValidateCardOptions,
  ValidateCardResult,
  VoidOptions,
} from './nmi-types'

export type {
  AddCustomerVaultOptions,
  AddCustomerVaultResult,
  NmiClientOptions,
  NmiFetch,
  NmiResponse,
  NmiResponseFlag,
  NmiWebhookEvent,
  RefundOptions,
  SaleOptions,
  ValidateCardOptions,
  ValidateCardResult,
  VoidOptions,
} from './nmi-types'

/**
 * NMI Direct Post client (gateway provisioned through PaymentCloud).
 *
 * Server-only: it holds the private security key. Browser code tokenizes
 * cards with Collect.js and `NEXT_PUBLIC_NMI_TOKENIZATION_KEY`; only the
 * resulting token ever reaches these functions.
 *
 * Every call POSTs `application/x-www-form-urlencoded` to `NMI_API_URL` and
 * parses the URL-encoded reply. Network access goes through an injectable
 * `fetchImpl` so tests capture the exact form fields sent.
 */

/** NMI's public sandbox gateway key. Used only outside production when NMI_SECURITY_KEY is unset. */
export const NMI_SANDBOX_SECURITY_KEY = '6457Thfj624V5r7WUwc5v6a68Zsd6YEm'
export const DEFAULT_NMI_API_URL = 'https://secure.nmi.com/api/transact.php'

/** How far a numeric webhook nonce may drift from the server clock. */
export const NMI_WEBHOOK_TOLERANCE_SECONDS = 5 * 60

/** NMI accepts merchant_defined_field_1 through _20. */
export const NMI_MAX_MERCHANT_DEFINED_FIELDS = 20

export class NmiError extends Error {
  constructor(
    message: string,
    readonly response?: NmiResponse,
    readonly httpStatus?: number
  ) {
    super(message)
    this.name = 'NmiError'
  }
}

type Env = Record<string, string | undefined>

let sandboxNoticeLogged = false

export function resolveNmiSecurityKey(env: Env = process.env): string {
  const configured = env.NMI_SECURITY_KEY?.trim()
  if (configured) return configured

  if (env.NODE_ENV === 'production') {
    throw new Error('NMI_SECURITY_KEY is not set. Refusing to fall back to the NMI sandbox key in production.')
  }

  if (!sandboxNoticeLogged) {
    sandboxNoticeLogged = true
    console.warn('[nmi] NMI_SECURITY_KEY is not set; using the public NMI sandbox gateway key.')
  }
  return NMI_SANDBOX_SECURITY_KEY
}

export function resolveNmiApiUrl(env: Env = process.env): string {
  return env.NMI_API_URL?.trim() || DEFAULT_NMI_API_URL
}

/** `1234` -> `"12.34"` with integer math, so no binary floating-point drift. */
export function centsToAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`Amount must be a non-negative integer number of cents, got ${cents}`)
  }
  const dollars = Math.floor(cents / 100)
  const remainder = cents % 100
  return `${dollars}.${String(remainder).padStart(2, '0')}`
}

/** Parse a Direct Post reply (`response=1&responsetext=SUCCESS&...`). */
export function parseResponse(body: string): NmiResponse {
  const raw: Record<string, string> = {}
  new URLSearchParams(body.trim()).forEach((value, key) => {
    raw[key] = value
  })

  const flag = Number(raw.response)
  const response: NmiResponseFlag = flag === 1 || flag === 2 ? flag : 3
  const code = Number.parseInt(raw.response_code ?? '', 10)

  return {
    response,
    responsetext: raw.responsetext ?? '',
    authcode: raw.authcode ?? '',
    transactionid: raw.transactionid ?? '',
    avsresponse: raw.avsresponse ?? '',
    cvvresponse: raw.cvvresponse ?? '',
    orderid: raw.orderid ?? '',
    type: raw.type ?? '',
    response_code: Number.isFinite(code) ? code : 0,
    customer_vault_id: raw.customer_vault_id || undefined,
    raw,
  }
}

export function isApproved(response: NmiResponse): boolean {
  return response.response === 1
}

const defaultFetch: NmiFetch = (url, init) => fetch(url, init)

type FormFields = Record<string, string | undefined>

async function postTransaction(fields: FormFields, options: NmiClientOptions = {}): Promise<NmiResponse> {
  const securityKey = options.securityKey ?? resolveNmiSecurityKey()
  const apiUrl = options.apiUrl ?? resolveNmiApiUrl()
  const fetchImpl = options.fetchImpl ?? defaultFetch

  const params = new URLSearchParams()
  params.set('security_key', securityKey)
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') params.set(key, value)
  }

  const res = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const text = await res.text()

  if (!res.ok) {
    throw new NmiError(`NMI gateway responded HTTP ${res.status}`, undefined, res.status)
  }
  return parseResponse(text)
}

function parseCardDetails(raw: Record<string, string>): Pick<AddCustomerVaultResult, 'last4' | 'brand' | 'expMonth' | 'expYear'> {
  const details: Pick<AddCustomerVaultResult, 'last4' | 'brand' | 'expMonth' | 'expYear'> = {}

  const masked = raw.cc_number ?? ''
  const tail = masked.slice(-4)
  if (/^\d{4}$/.test(tail)) details.last4 = tail

  const brand = raw.cc_type?.trim().toLowerCase()
  if (brand) details.brand = brand

  // cc_exp is MMYY (occasionally MMYYYY)
  const exp = raw.cc_exp?.trim() ?? ''
  if (/^\d{4}$/.test(exp) || /^\d{6}$/.test(exp)) {
    const month = Number(exp.slice(0, 2))
    const yearPart = exp.slice(2)
    const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart)
    if (month >= 1 && month <= 12) {
      details.expMonth = month
      details.expYear = year
    }
  }

  return details
}

/**
 * Store a Collect.js token as a Customer Vault record. The vault id is the
 * only thing ITA persists about the card; NMI keeps the PAN.
 */
export async function addCustomerVault(
  options: AddCustomerVaultOptions,
  client?: NmiClientOptions
): Promise<AddCustomerVaultResult> {
  const response = await postTransaction(
    {
      customer_vault: 'add_customer',
      payment_token: options.paymentToken,
      first_name: options.firstName,
      last_name: options.lastName,
      email: options.email,
    },
    client
  )

  if (!isApproved(response) || !response.customer_vault_id) {
    throw new NmiError(
      `NMI customer vault add failed: ${response.responsetext || 'no customer_vault_id in response'}`,
      response
    )
  }

  return {
    customerVaultId: response.customer_vault_id,
    ...parseCardDetails(response.raw),
    response,
  }
}

export interface DeleteCustomerVaultOptions {
  customerVaultId: string
}

/**
 * Remove a Customer Vault record (`customer_vault=delete_customer`), so the
 * gateway does not keep a chargeable record that nothing in ITA references
 * any more (a bidder removed or replaced their card, or a new card failed
 * verification). Declines are returned, not thrown, so callers can log and
 * carry on; a network failure still throws. Callers treat this as best
 * effort: the bidder's request must never fail because cleanup did.
 */
export async function deleteCustomerVault(
  options: DeleteCustomerVaultOptions,
  client?: NmiClientOptions
): Promise<NmiResponse> {
  return postTransaction(
    { customer_vault: 'delete_customer', customer_vault_id: options.customerVaultId },
    client
  )
}

/**
 * A 3xx "gateway rejected" reply to `validate` is read as "this processor
 * does not support validate". Trade-off: a 3xx can also mean a genuine
 * gateway-side rejection (bad vault id, disabled account), in which case the
 * fallback costs one extra `auth` call that returns the same rejection, so
 * the caller still sees `ok: false` with the gateway's message. Matching on
 * `responsetext` instead would be brittle across processors, so the broad
 * check is deliberate.
 */
function isValidateUnsupported(response: NmiResponse): boolean {
  return response.response === 3 && response.response_code >= 300 && response.response_code < 400
}

function validateResult(ok: boolean, response: NmiResponse): ValidateCardResult {
  return {
    ok,
    transactionId: response.transactionid || undefined,
    avsresponse: response.avsresponse || undefined,
    cvvresponse: response.cvvresponse || undefined,
    message: response.responsetext,
  }
}

/**
 * Confirm a vaulted card is chargeable. Uses `type=validate` (a zero-dollar
 * verification); when the processor does not support it, falls back to a
 * $1.00 auth that is voided immediately.
 */
export async function validateCard(options: ValidateCardOptions, client?: NmiClientOptions): Promise<ValidateCardResult> {
  const validate = await postTransaction(
    { type: 'validate', customer_vault_id: options.customerVaultId, processor_id: options.processorId },
    client
  )
  if (isApproved(validate)) return validateResult(true, validate)
  if (!isValidateUnsupported(validate)) return validateResult(false, validate)

  const auth = await postTransaction(
    {
      type: 'auth',
      amount: '1.00',
      customer_vault_id: options.customerVaultId,
      processor_id: options.processorId,
      order_description: 'Card verification',
    },
    client
  )
  if (!isApproved(auth)) return validateResult(false, auth)

  // The card is proven good at this point. A failed void must not turn that
  // into an error; it only leaves a $1.00 hold that drops off on its own.
  let unvoidedAuthTransactionId: string | undefined
  try {
    const voided = await postTransaction({ type: 'void', transactionid: auth.transactionid }, client)
    if (!isApproved(voided)) unvoidedAuthTransactionId = auth.transactionid
  } catch {
    unvoidedAuthTransactionId = auth.transactionid
  }
  if (unvoidedAuthTransactionId) {
    console.warn('[nmi] could not void the $1.00 verification auth; the hold drops off on its own', {
      transactionId: unvoidedAuthTransactionId,
    })
  }

  return { ...validateResult(true, auth), unvoidedAuthTransactionId }
}

/**
 * Charge a vaulted card. `processorId` routes the charge to a specific
 * merchant account under the shared gateway (NMI "Load Balancing" /
 * Multiple MIDs); omit it to use the gateway default.
 */
export async function sale(options: SaleOptions, client?: NmiClientOptions): Promise<NmiResponse> {
  if (options.amountCents <= 0) {
    throw new RangeError(`Sale amount must be positive, got ${options.amountCents} cents`)
  }
  const mdfCount = options.merchantDefinedFields?.length ?? 0
  if (mdfCount > NMI_MAX_MERCHANT_DEFINED_FIELDS) {
    throw new RangeError(`NMI accepts at most ${NMI_MAX_MERCHANT_DEFINED_FIELDS} merchant-defined fields, got ${mdfCount}`)
  }

  const fields: FormFields = {
    type: 'sale',
    customer_vault_id: options.customerVaultId,
    amount: centsToAmount(options.amountCents),
    processor_id: options.processorId,
    orderid: options.orderId,
    order_description: options.orderDescription,
    tax: options.taxCents === undefined ? undefined : centsToAmount(options.taxCents),
    shipping: options.shippingCents === undefined ? undefined : centsToAmount(options.shippingCents),
    ipaddress: options.ipAddress,
  }
  options.merchantDefinedFields?.forEach((value, index) => {
    fields[`merchant_defined_field_${index + 1}`] = value
  })

  return postTransaction(fields, client)
}

/**
 * Refund a settled sale, in full (no amount) or in part. A zero amount is
 * refused rather than sent: NMI reads `amount=0.00` as a full refund.
 */
export async function refund(options: RefundOptions, client?: NmiClientOptions): Promise<NmiResponse> {
  if (options.amountCents !== undefined && options.amountCents <= 0) {
    throw new RangeError(
      `Partial refund amount must be positive, got ${options.amountCents} cents; omit amountCents for a full refund`
    )
  }

  return postTransaction(
    {
      type: 'refund',
      transactionid: options.transactionId,
      amount: options.amountCents === undefined ? undefined : centsToAmount(options.amountCents),
    },
    client
  )
}

/** Void an unsettled sale or auth. */
export async function voidTransaction(options: VoidOptions, client?: NmiClientOptions): Promise<NmiResponse> {
  return postTransaction({ type: 'void', transactionid: options.transactionId }, client)
}

export type NmiSignatureCheck = { ok: true } | { ok: false; reason: string }

function parseSignatureHeaderParts(header: string): Record<string, string> {
  const parts: Record<string, string> = {}
  for (const segment of header.split(',')) {
    const eq = segment.indexOf('=')
    if (eq === -1) continue
    parts[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim()
  }
  return parts
}

function parseSignatureHeader(header: string): { t: string; s: string } | null {
  const parts = parseSignatureHeaderParts(header)
  if (!parts.t || !parts.s) return null
  return { t: parts.t, s: parts.s }
}

/**
 * Shape of the `t` nonce for rejection logs, e.g. `numeric(10)` or
 * `alphanumeric(32)`. Never includes the value, so a log line cannot help
 * anyone replay a signature.
 */
export function describeSignatureNonce(header: string | null | undefined): string {
  const t = header ? parseSignatureHeaderParts(header).t : undefined
  if (!t) return 'missing'
  if (/^\d+$/.test(t)) return `numeric(${t.length})`
  if (/^[A-Za-z0-9]+$/.test(t)) return `alphanumeric(${t.length})`
  return `other(${t.length})`
}

/**
 * Verify NMI's `Webhook-Signature: t=<nonce>,s=<hex>` header:
 * `s === HMAC-SHA256(signingKey, `${t}.${rawBody}`)`.
 *
 * `rawBody` must be the exact bytes received (read with `request.text()`),
 * never a re-serialised JSON object.
 *
 * NMI documents `t` as a nonce. When it is purely numeric it is treated as a
 * unix timestamp (seconds, or milliseconds when 13+ digits) and rejected if
 * more than five minutes from `nowSeconds`; a non-numeric nonce is accepted
 * on the HMAC alone.
 */
export function verifyNmiSignature(
  header: string | null | undefined,
  rawBody: string,
  signingKey: string,
  options: { nowSeconds?: number; toleranceSeconds?: number } = {}
): NmiSignatureCheck {
  if (!signingKey) return { ok: false, reason: 'webhook signing key not configured' }
  if (!header) return { ok: false, reason: 'missing Webhook-Signature header' }

  const parsed = parseSignatureHeader(header)
  if (!parsed) return { ok: false, reason: 'malformed Webhook-Signature header' }
  const { t, s } = parsed

  if (/^\d+$/.test(t)) {
    const seconds = t.length >= 13 ? Math.floor(Number(t) / 1000) : Number(t)
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
    const tolerance = options.toleranceSeconds ?? NMI_WEBHOOK_TOLERANCE_SECONDS
    if (Math.abs(now - seconds) > tolerance) return { ok: false, reason: 'timestamp outside tolerance' }
  }

  const expected = Buffer.from(createHmac('sha256', signingKey).update(`${t}.${rawBody}`).digest('hex'), 'utf8')
  const received = Buffer.from(s.toLowerCase(), 'utf8')
  if (expected.length !== received.length) return { ok: false, reason: 'signature length mismatch' }
  if (!timingSafeEqual(expected, received)) return { ok: false, reason: 'signature mismatch' }

  return { ok: true }
}
