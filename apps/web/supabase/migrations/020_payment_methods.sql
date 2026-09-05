-- 020: bidder card on file (NMI Customer Vault reference)
--
-- On the card-on-file model a bidder registers one card before bidding and is
-- charged hammer + buyer's premium only when they win. The card number never
-- reaches ITA: Collect.js tokenizes it in the browser, POST /api/payments/methods
-- exchanges the token for an NMI Customer Vault id (`addCustomerVault`), asks the
-- gateway to verify the card (`validateCard`), and stores the result here. The
-- bid gate (lib/payments/bid-gate.ts) requires a row with verified_at set.
--
-- Security model
--   * The table holds `customer_vault_id`, which is enough to charge the card
--     through our gateway key. Signed-in users therefore get NO direct access to
--     that column: table privileges are revoked from anon/authenticated and only
--     the display columns are re-granted, and even those are read through the
--     `bidder_payment_methods_public` view (security_invoker, so this table's
--     owner-only RLS policy still applies to the view).
--   * There are no INSERT / UPDATE / DELETE policies for authenticated. Every
--     write goes through the service-role client in the API route.
--
-- Idempotent: safe to re-run. Run after 019c.

CREATE TABLE IF NOT EXISTS public.bidder_payment_methods (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  provider                      TEXT        NOT NULL DEFAULT 'nmi',
  customer_vault_id             TEXT        NOT NULL,
  card_brand                    TEXT,
  last4                         TEXT,
  exp_month                     INT,
  exp_year                      INT,
  verified_at                   TIMESTAMPTZ,
  unvoided_auth_transaction_id  TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bidder_payment_methods_provider_check   CHECK (length(provider) > 0),
  CONSTRAINT bidder_payment_methods_vault_check      CHECK (length(customer_vault_id) > 0),
  CONSTRAINT bidder_payment_methods_last4_check      CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  CONSTRAINT bidder_payment_methods_exp_month_check  CHECK (exp_month IS NULL OR exp_month BETWEEN 1 AND 12),
  CONSTRAINT bidder_payment_methods_exp_year_check   CHECK (exp_year IS NULL OR exp_year BETWEEN 2000 AND 2100)
);

COMMENT ON TABLE public.bidder_payment_methods IS
  'One card on file per bidder, stored as an NMI Customer Vault reference. Written only by the service role (POST/DELETE /api/payments/methods). Read by users only through bidder_payment_methods_public.';
COMMENT ON COLUMN public.bidder_payment_methods.customer_vault_id IS
  'NMI Customer Vault id. Sufficient to charge the card with our gateway key; never exposed to clients.';
COMMENT ON COLUMN public.bidder_payment_methods.verified_at IS
  'When the gateway confirmed the card is chargeable (validate, or $1.00 auth + void). NULL = declined or not yet verified; bidding requires it.';
COMMENT ON COLUMN public.bidder_payment_methods.unvoided_auth_transaction_id IS
  'Set when the $1.00 verification auth was approved but its void failed. The hold drops off on its own; kept so support can void it on request.';

-- updated_at: same trigger function every other table uses (001 / 005).
DROP TRIGGER IF EXISTS update_bidder_payment_methods_updated_at ON public.bidder_payment_methods;
CREATE TRIGGER update_bidder_payment_methods_updated_at
  BEFORE UPDATE ON public.bidder_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row level security: owner may SELECT their own row (through the view, see
-- the grants below). No write policies: writes are service-role only.
ALTER TABLE public.bidder_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bidder_payment_methods_owner_select ON public.bidder_payment_methods;
CREATE POLICY bidder_payment_methods_owner_select
  ON public.bidder_payment_methods
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Privileges. Supabase's default privileges grant ALL to anon and authenticated
-- on new tables; take that back, then re-grant only the display columns to
-- authenticated (required for the security_invoker view to read them).
REVOKE ALL ON public.bidder_payment_methods FROM anon, authenticated;
GRANT SELECT (user_id, card_brand, last4, exp_month, exp_year, verified_at)
  ON public.bidder_payment_methods TO authenticated;
GRANT ALL ON public.bidder_payment_methods TO service_role;

-- Public view: what the browser may know about a card. Never the vault id.
CREATE OR REPLACE VIEW public.bidder_payment_methods_public
  WITH (security_invoker = true)
AS
  SELECT user_id, card_brand, last4, exp_month, exp_year, verified_at
    FROM public.bidder_payment_methods;

COMMENT ON VIEW public.bidder_payment_methods_public IS
  'Display columns of bidder_payment_methods. security_invoker: the owner-only RLS policy on the table applies, so each user sees only their own row.';

REVOKE ALL ON public.bidder_payment_methods_public FROM anon;
GRANT SELECT ON public.bidder_payment_methods_public TO authenticated, service_role;
