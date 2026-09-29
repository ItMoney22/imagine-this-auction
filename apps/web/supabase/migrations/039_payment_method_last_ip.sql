-- 039: remember the IP a bidder saved their card from.
--
-- PaymentCloud's risk team set the NMI fraud filter "Daily Attempted
-- Transaction Count for IP" to 5 per day, Deny (Vanessa Evertz, 2026-09-11).
-- ITA charges cards server-side, so without an explicit `ipaddress` on the
-- gateway call every bidder's charge looks like it came from the same handful
-- of Vercel addresses and the sixth transaction of the day is denied for
-- everyone. David's call (2026-09-12) was to leave the filter as risk set it
-- and send the bidder's own IP instead, which is what the threshold is meant
-- to count.
--
-- Captured when the card is saved and verified (POST /api/payments/methods),
-- replayed by lib/payments/invoice-charge.ts on the winning charge. Written by
-- the service role only; not in bidder_payment_methods_public, so it never
-- reaches a browser.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.bidder_payment_methods
  ADD COLUMN IF NOT EXISTS last_ip TEXT;

COMMENT ON COLUMN public.bidder_payment_methods.last_ip IS
  'IP the bidder last saved/verified this card from. Sent as the NMI `ipaddress` field on later charges so per-IP fraud thresholds count the bidder, not our server. Service-role only; never exposed to clients.';

-- The public view is column-listed, so it does not pick this up. Assert that,
-- because leaking a bidder IP to other bidders would be a privacy bug.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bidder_payment_methods_public'
      AND column_name = 'last_ip'
  ) THEN
    RAISE EXCEPTION 'bidder_payment_methods_public must not expose last_ip';
  END IF;
END
$$;
