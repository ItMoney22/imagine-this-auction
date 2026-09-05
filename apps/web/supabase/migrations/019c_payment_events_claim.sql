-- 019c: atomic claim column for NMI webhook processing
--
-- /api/webhooks/nmi stores every verified event in payment_events and then
-- claims the row with a single conditional UPDATE before dispatching it, so two
-- concurrent deliveries of the same event_id cannot both run handlers. A claim
-- older than two minutes is treated as abandoned and may be taken over.
-- See docs/PAYMENTS.md, "Storage, claim, and idempotency".
--
-- Additive and idempotent; no existing rows are modified.

ALTER TABLE public.payment_events
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.payment_events.processing_started_at IS
    'Set while a webhook delivery is being handled; NULL when idle. Claims older than 2 minutes are considered abandoned and may be re-claimed.';
