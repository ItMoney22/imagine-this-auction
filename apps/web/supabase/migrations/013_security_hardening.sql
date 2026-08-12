-- 013_security_hardening.sql
-- Fixes critical RLS gaps found in the 2026-08-12 launch-readiness sweep.
-- Verified against the live database (project qdiodkevkacgbfvplafm) before writing.
--
-- Context: all legitimate writes to these tables happen through SECURITY DEFINER
-- functions (place_bid, add_wallet_credits, process_auction_end,
-- release_escrow_on_shipping) or the service-role client, both of which are
-- unaffected by these policies. The policies below only close the door on
-- ordinary authenticated users writing directly.

-- 1. wallet_ledger: "WITH CHECK (true)" let ANY authenticated user insert
--    arbitrary ledger rows — i.e. mint themselves credits.
DROP POLICY IF EXISTS "System can insert wallet transactions" ON public.wallet_ledger;
CREATE POLICY "Admins insert wallet transactions" ON public.wallet_ledger
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- 2. invoices: same hole — any user could forge invoices.
DROP POLICY IF EXISTS "System can create invoices" ON public.invoices;
CREATE POLICY "Admins create invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- 3. audit_log: any user could forge audit entries.
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_log;
CREATE POLICY "Admins create audit logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin'::user_role);

-- 4. watchlists: public SELECT (true) exposed every user's watchlist
--    (user_id + lot_id pairs). The only public consumer was the aggregate
--    count endpoint, which now uses the service-role client instead
--    (app/api/watchlist/[lotId]/count/route.ts).
DROP POLICY IF EXISTS "Public read watchlist counts" ON public.watchlists;

-- 5. watchlist_alerts_sent: RLS was never enabled — default grants made it
--    readable/writable by any authenticated user. The nightly alert function
--    is SECURITY DEFINER, so enabling RLS with no policies (deny-all) is safe.
ALTER TABLE public.watchlist_alerts_sent ENABLE ROW LEVEL SECURITY;

-- 6. Views run with owner privileges by default (RLS bypass): any
--    authenticated user could read platform financials and other users'
--    emails/risk scores. security_invoker makes them respect the caller's RLS;
--    the admin API routes use the service role, so they keep working.
ALTER VIEW public.financial_aggregates SET (security_invoker = true);
ALTER VIEW public.suspicious_users_view SET (security_invoker = true);
