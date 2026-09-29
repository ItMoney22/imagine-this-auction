-- 040: link every later charge back to the transaction that stored the card.
--
-- Card networks run a stored-credential framework (CIT/MIT). The transaction
-- where the cardholder is present and agrees to store the card is the
-- "initial" one; every later charge the merchant starts on its own has to
-- reference it (`initiated_by=merchant`, `stored_credential_indicator=used`,
-- `initial_transaction_id=<that id>`). The gateway documents all three fields
-- on a Customer-Vault-initiated sale.
--
-- This matters more for ITA than for a normal store: the winning charge lands
-- days after the auction with nobody at the keyboard, so it is always
-- merchant-initiated. An unlinked MIT is downgraded and declines more often,
-- and a decline here costs an auction house its money and burns one of the two
-- attempts the dunning policy allows.
--
-- Written by the service role when the card is verified
-- (POST /api/payments/methods); read by lib/payments/invoice-charge.ts.
-- Not in bidder_payment_methods_public, so it never reaches a browser.
--
-- Idempotent: safe to re-run. Run after 039.

ALTER TABLE public.bidder_payment_methods
  ADD COLUMN IF NOT EXISTS initial_transaction_id TEXT;

COMMENT ON COLUMN public.bidder_payment_methods.initial_transaction_id IS
  'Gateway transaction id of the cardholder-present verification that stored this card. Sent as NMI `initial_transaction_id` on every later merchant-initiated charge. Service-role only; never exposed to clients.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bidder_payment_methods_public'
      AND column_name = 'initial_transaction_id'
  ) THEN
    RAISE EXCEPTION 'bidder_payment_methods_public must not expose initial_transaction_id';
  END IF;
END
$$;
