-- Close legacy RPC access exposed by the original bootstrap migrations.
-- This preserves the current application schema; the launch payment replacement remains separate.
begin;
do $guard$ declare f record; definition text; body_start integer; condition_sql text; begin
 for f in select p.oid,p.proname,p.proargnames,p.pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('place_bid','process_auction_end','release_escrow_on_shipping') loop
   definition:=pg_get_functiondef(f.oid);
   if f.proname='place_bid' and f.pronargs=5 then
     -- Its default arguments collide with the newer three-argument function.
     execute format('drop function %s',f.oid::regprocedure);
     continue;
   end if;
   if position('-- ITA caller guard' in definition)=0 then
     condition_sql:=case f.proname
       when 'place_bid' then 'auth.uid() IS NOT NULL AND auth.uid() = p_user_id'
       when 'process_auction_end' then 'public.is_auctioneer_for_auction(auction_uuid)'
       when 'release_escrow_on_shipping' then 'EXISTS (SELECT 1 FROM public.invoices i JOIN public.lots l ON l.id=i.lot_id WHERE i.id=invoice_uuid AND public.is_auctioneer_for_auction(l.auction_id))'
     end;
     body_start:=position('BEGIN' in definition);
     if body_start=0 then raise exception 'Cannot locate RPC body: %',f.proname; end if;
     definition:=overlay(definition placing E'BEGIN\n-- ITA caller guard\nIF NOT public.is_admin_or_service_role() AND NOT COALESCE(('||condition_sql||E'),false) THEN RAISE EXCEPTION ''Caller is not authorized'' USING ERRCODE=''42501''; END IF;\n' from body_start for 5);
     execute definition;
   end if;
   execute format('alter function %s set search_path = public, pg_temp',f.oid::regprocedure);
   execute format('revoke all on function %s from public,anon',f.oid::regprocedure);
   execute format('grant execute on function %s to authenticated,service_role',f.oid::regprocedure);
 end loop;
 -- These mutation and administrative functions are called only from trusted server code.
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('create_admin_user','add_wallet_credits','ai_check_rate_limit','ai_begin_action','ai_settle_action','ai_void_action','ai_refund_action','refresh_bidder_stats','send_watchlist_ending_alerts','get_financial_summary','detect_suspicious_users') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);
   execute format('grant execute on function %s to service_role',f.oid::regprocedure);
   execute format('alter function %s set search_path = public, pg_temp',f.oid::regprocedure);
 end loop;
 -- Read helpers should observe the caller's table policies when used directly.
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('get_wallet_balance','get_user_active_bids','ai_available_credits','search_lots') loop
   execute format('alter function %s security invoker',f.oid::regprocedure);
   execute format('alter function %s set search_path = public, pg_temp',f.oid::regprocedure);
 end loop;
end $guard$;
-- Anonymous visitors cannot insert bids directly or invoke a bid on somebody else's identity.
revoke insert,update,delete on public.bids from anon;
-- Materialized analytics are refreshed by a trusted job, never by arbitrary visitors.
revoke all on public.bidder_stats from anon,authenticated;
grant select on public.bidder_stats to anon,authenticated;
notify pgrst,'reload schema';
commit;
