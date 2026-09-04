# Payments: NMI gateway via PaymentCloud

Card payments run on one NMI gateway provisioned by PaymentCloud. This document
covers the pieces that exist today (Task 4a: client library, webhook intake) and
what the follow-on tasks add on top of them.

## The model

- **One gateway, many merchant accounts.** Every auctioneer gets their own
  merchant account (MID) under the shared gateway. NMI identifies it by a
  `processor_id`. ITA's own MID (`NMI_PLATFORM_PROCESSOR_ID`) takes platform
  fees, monthly statements, and delivery charges.
- **One card on file per bidder.** The card is tokenized in the browser with
  Collect.js (public tokenization key; the card number never touches our
  servers) and stored in the gateway-level **Customer Vault**. ITA persists only
  the `customer_vault_id` plus brand / last4 / expiry for display.
- **Charge after the win.** When an auction closes, the winning bidder's vaulted
  card is charged under the winning auctioneer's `processor_id`, so the money
  settles to that auctioneer's merchant account. NMI calls this feature
  Load Balancing / Multiple MIDs / Transaction Routing.
- **No wallet, no ITC.** The old credit-pack flow and the PaymentCloud stub that
  minted wallet credits from an unsigned webhook body are gone (Task 4d removes
  the remaining wallet UI).

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NMI_SECURITY_KEY` | server | Private API key for Direct Post (`transact.php`). Never exposed to the browser. |
| `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` | browser | Collect.js public key. Can only mint payment tokens; cannot charge. |
| `NMI_WEBHOOK_SIGNING_KEY` | server | Signing key shown in the NMI portal when the webhook endpoint is created. |
| `NMI_PLATFORM_PROCESSOR_ID` | server | ITA's own `processor_id` for platform fees and delivery charges. |
| `NMI_API_URL` | server | Defaults to `https://secure.nmi.com/api/transact.php`. |

**Sandbox fallback.** When `NODE_ENV !== 'production'` and `NMI_SECURITY_KEY` is
unset, `lib/payments/nmi.ts` uses NMI's public sandbox key
`6457Thfj624V5r7WUwc5v6a68Zsd6YEm` and logs one warning. In production a missing
key throws a clear error; there is no silent fallback. In NMI test mode, use
the test cards (Visa `4111111111111111`, any future expiry, CVV `999`); an
amount under `1.00` produces a decline and an invalid card number produces an
error. Confirm these against the sandbox before relying on them in tests.

Live keys arrive from PaymentCloud on 2026-09-07. Until then everything runs
against the sandbox.

## Files

| File | Role |
| --- | --- |
| `apps/web/lib/payments/nmi.ts` | Direct Post client and webhook signature check |
| `apps/web/lib/payments/nmi-types.ts` | Request/response types and the webhook zod schema |
| `apps/web/lib/payments/nmi-handlers.ts` | Event-type registry the webhook dispatches into |
| `apps/web/app/api/webhooks/nmi/route.ts` | `POST /api/webhooks/nmi` |
| `apps/web/tests/unit/nmi-client.spec.ts` | Unit coverage (`npm run test:unit -- nmi`) |

### Client (`lib/payments/nmi.ts`)

All functions POST `application/x-www-form-urlencoded` with `security_key` and
accept an optional `{ fetchImpl, securityKey, apiUrl }` for tests.

| Function | NMI request | Notes |
| --- | --- | --- |
| `addCustomerVault({ paymentToken, firstName, lastName, email })` | `customer_vault=add_customer`, `payment_token` | Returns `{ customerVaultId, last4?, brand?, expMonth?, expYear? }`. Throws `NmiError` if not approved. |
| `validateCard({ customerVaultId, processorId? })` | `type=validate` | If the processor rejects `validate` (3xx), falls back to `type=auth` for `1.00` followed by `type=void`. |
| `sale({ customerVaultId, amountCents, processorId?, orderId, ... })` | `type=sale`, `customer_vault_id`, `amount`, `processor_id`, `orderid`, `order_description`, `tax`, `shipping`, `ipaddress`, `merchant_defined_field_N` | Returns the parsed `NmiResponse`; declines are returned, not thrown, so callers record the reason. |
| `refund({ transactionId, amountCents? })` | `type=refund` | Omit the amount for a full refund. |
| `voidTransaction({ transactionId })` | `type=void` | For unsettled transactions. |
| `parseResponse(body)` | | URL-encoded reply -> `NmiResponse` (`response` 1 approved / 2 declined / 3 error, `response_code`, `transactionid`, AVS/CVV, `customer_vault_id`, `raw`). |
| `centsToAmount(1234)` | | `"12.34"` using integer math. |
| `verifyNmiSignature(header, rawBody, key)` | | See below. |

Amounts are always integer cents in our code and formatted once at the wire.

### Card details after `add_customer`

The `add_customer` reply reliably contains `customer_vault_id`. Whether it also
echoes `cc_number` (masked), `cc_type`, and `cc_exp` depends on the gateway
configuration, so `addCustomerVault` parses them defensively and leaves them
undefined when absent. Collect.js hands the browser the same details in its
callback (`response.card.number` masked, `response.card.type`,
`response.card.exp`); Task 4b should send those alongside the token and prefer
them when the gateway reply omits card fields.

### Collect.js flow (Task 4b)

1. Page loads `https://secure.nmi.com/token/Collect.js` with
   `data-tokenization-key=NEXT_PUBLIC_NMI_TOKENIZATION_KEY`.
2. Hosted fields collect number / expiry / CVV inside NMI iframes.
3. On submit Collect.js returns a one-time `payment_token`.
4. The browser POSTs the token to our API; the server calls `addCustomerVault`
   then `validateCard`, and stores the vault id on the bidder's payment-method
   row. The token is single-use and expires quickly.

### Charging the winner (Task 4c)

`sale({ customerVaultId, amountCents: invoice.total, processorId: auctioneer.gateway_processor_id, orderId: invoice.id })`.
The `processor_id` is what routes the funds to the auctioneer's merchant
account. Platform charges (statements, delivery) use `NMI_PLATFORM_PROCESSOR_ID`.

## Webhooks

Register `https://<site>/api/webhooks/nmi` in the NMI portal (Settings ->
Webhooks) and copy the signing key it shows into `NMI_WEBHOOK_SIGNING_KEY`.
Subscribe at least to: `transaction.sale.success`, `transaction.sale.failure`,
`transaction.refund.success`, `transaction.void.success`,
`settlement.batch.complete`, and the chargeback events if the account has them.

### Signature

NMI sends `Webhook-Signature: t=<nonce>,s=<hex>` and computes
`s = HMAC-SHA256(signingKey, nonce + "." + rawBody)`. The route reads the raw
body with `request.text()` before any JSON parsing (re-serialised JSON would not
match), compares with `crypto.timingSafeEqual` after a length guard, and
rejects with 400 on any mismatch.

NMI documents `t` as a nonce. When it is purely numeric the route treats it as a
unix timestamp (seconds; milliseconds when 13+ digits) and rejects events more
than five minutes from the server clock. A non-numeric nonce is accepted on the
HMAC alone, so a change in NMI's nonce format cannot silently drop every event.

If `NMI_WEBHOOK_SIGNING_KEY` is unset the route returns 500 and processes
nothing; there is no unsigned mode.

### Storage and idempotency

Each verified event is upserted into `payment_events` with `provider='nmi'`,
`provider_event_id=event_id`, `event_type`, and the full payload. A redelivery
of an already `processed` event returns 200 immediately. Otherwise the event is
dispatched through `lib/payments/nmi-handlers.ts` and marked processed on
success. A handler error returns 500 so NMI retries.

### Handler registry

`registerNmiHandler(eventType, fn)` routes by exact `event_type`, then by the
longest dotted prefix (`register('chargeback', fn)` receives every
`chargeback.*` event). Unregistered types hit a default that logs and returns
`{ handled: false }`. Task 4a ships only the registry; Task 4c registers
handlers that update `invoices.payment_status` on refund / void / chargeback
events and notify admins of disputes.

## What the follow-on tasks add

- **4b** – `bidder_payment_methods` table, `POST /api/payments/methods`
  (Collect.js token -> vault -> validate), the card-on-file form, and the bid
  gate that requires a verified card.
- **4c** – Auction close creates invoices and charges each winner under the
  auctioneer's `processor_id`; manual retry and refund routes; webhook handlers.
- **4d** – Removes the wallet UI and ITC; AI usage is billed in dollars on the
  auctioneer's statement.
- **5** – Monthly auctioneer statements auto-charged on
  `NMI_PLATFORM_PROCESSOR_ID`.
- **6** – Merchant application flow that ends with PaymentCloud's hosted
  application; approval stores the auctioneer's `gateway_processor_id`.

## Testing

```bash
cd apps/web
npm run test:unit -- nmi
```

The unit suite covers response parsing, amount formatting, the exact form
fields sent for each transaction type (including `processor_id` routing), the
validate -> auth/void fallback, signature acceptance / rejection / expiry, the
webhook schema, and registry dispatch. No test touches the network.

## Human checklist (Monday 2026-09-07)

- [ ] `NMI_SECURITY_KEY` from PaymentCloud stored in Vercel (production and preview).
- [ ] `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` (public key, tokenization only) stored.
- [ ] Webhook endpoint `/api/webhooks/nmi` created in the NMI portal; signing key stored as `NMI_WEBHOOK_SIGNING_KEY`.
- [ ] ITA's own `processor_id` recorded as `NMI_PLATFORM_PROCESSOR_ID`.
- [ ] Confirm with PaymentCloud that the gateway has Customer Vault and Load Balancing (multiple MIDs) enabled, and whether the processor supports `type=validate`.
- [ ] Each onboarded auctioneer's `processor_id` recorded on their `auctioneers` row (Task 4c / Task 6).
