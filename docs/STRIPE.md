# Stripe Integration (Deprecated)

Stripe has been fully removed from the ImagineThisAuction payment stack. Card purchases now flow through the generic `payment_events` table with PaymentCloud (or another configured provider) supplying settlement.

Please refer to [PAYMENTCLOUD.md](./PAYMENTCLOUD.md) for the active configuration guide and onboarding checklist.
