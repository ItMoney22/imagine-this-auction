# PaymentCloud Integration Guide (Placeholder)

Payment processing now routes through a provider-agnostic `payment_events` table with PaymentCloud as the default card processor. Until underwriting completes, the API routes operate in "pending" mode and store payment intent metadata without calling PaymentCloud.

## Credentials Needed

| Variable | Purpose | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_PAYMENT_PROVIDER` | Front-end label toggle | Default is `paymentcloud` |
| `PAYMENTCLOUD_API_KEY` | Server-to-server API authentication | Leave unset until onboarding completes |
| `PAYMENTCLOUD_WEBHOOK_SECRET` | Validates incoming webhooks (`x-paymentcloud-signature`) | Optional in local development |

## API Surface

### `POST /api/payments/card/create`
Creates a pending card charge record. Once the real API key is present, extend this handler to forward the request to PaymentCloud and return their redirect URL or approval token.

### `POST /api/webhooks/paymentcloud`
Idempotently ingests PaymentCloud webhook notifications.
- Logs events to `payment_events`
- On `sale.approved`, calls `add_wallet_credits(user_uuid, credit_amount, provider_event_id, description)`

### `POST /api/payments/reconcile/daily`
Placeholder endpoint for the daily settlement job. Returns HTTP 202 until the live integration is ready.

## Database Changes

- `stripe_events` renamed to `payment_events`
- Added columns: `provider`, `provider_event_id`, `payload`
- `add_wallet_credits` updated to store provider metadata inside `wallet_ledger` records

## Next Steps Once API Keys Are Available

1. Update `/api/payments/card/create` to call the PaymentCloud charge API
2. Enforce webhook signature validation using the provided signing secret
3. Swap placeholder reconciliation logic with the production settlement workflow
4. Remove the `requiresProviderSetup` flag in the front-end and trigger real redirects

## Testing

Playwright coverage exercises:
- Wallet purchase flow (pending state + error handling)
- Webhook signature enforcement
- Daily reconciliation placeholder endpoint

Run the suite with:
```bash
cd apps/web
npx playwright test paymentcloud-credit-purchase.spec.ts
```

## Human Follow-up Checklist

- [ ] Merchant underwriting approved by PaymentCloud
- [ ] Production API credentials stored in deployment secrets
- [ ] Webhook endpoint registered inside the PaymentCloud dashboard (`/api/webhooks/paymentcloud`)
- [ ] Daily reconciliation window and reporting requirements confirmed with PaymentCloud rep
