-- 014_notification_delivery.sql
-- Delivery tracking for the notification pipeline (2026-08-12 rewrite).
-- The delivery routes mark each notification when its email/push has been
-- sent; NULL means "not yet delivered" and is retried on the next batch run.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_email_unsent
  ON public.notifications (created_at)
  WHERE email_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_push_unsent
  ON public.notifications (created_at)
  WHERE push_sent_at IS NULL;

-- Email domain (imaginethisauction.com) verified in Resend 2026-08-12 —
-- email delivery can go live. Push stays off until VAPID keys are configured.
UPDATE public.feature_flags SET is_enabled = true WHERE flag_name = 'email_notifications';
