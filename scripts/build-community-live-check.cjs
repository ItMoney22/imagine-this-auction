const fs=require('node:fs')
const path=require('node:path')
const dotenv=require('../apps/web/node_modules/dotenv')
const qa=dotenv.parse(fs.readFileSync(path.join(__dirname,'../apps/web/.env.qa')))
for(const key of ['ITA_QA_USER_ID','ITA_QA_LOT_ID']) if(!/^[a-f0-9-]{36}$/.test(qa[key]||'')) throw new Error('Temporary fixtures required')
const sql=`-- Transactional live community acceptance check. All fixture changes roll back.
begin;
update public.feature_flags set is_enabled=true where flag_name='community_v1';
do $qa$
declare owner_uuid uuid:='${qa.ITA_QA_USER_ID}'; lot_uuid uuid:='${qa.ITA_QA_LOT_ID}'; bidder uuid:=gen_random_uuid(); house_uuid uuid; post_uuid uuid; question_uuid uuid; result jsonb; begin
 select a.auctioneer_id into house_uuid from public.lots l join public.auctions a on a.id=l.auction_id where l.id=lot_uuid;
 if house_uuid is null then raise exception 'QA auction fixture unavailable'; end if;
 insert into auth.users(id,email) values(bidder,'ita-transaction-qa-'||bidder::text||'@example.invalid');
 insert into public.users(id,email,role,is_approved) values(bidder,'ita-transaction-qa-'||bidder::text||'@example.invalid','bidder',true);
 perform public.community_command(owner_uuid,'profile',jsonb_build_object('handle','qa_owner_'||left(owner_uuid::text,8),'display_name','QA House Owner','bio','QA fixture','city','','region','','interests','[]'::jsonb,'visibility','public','show_location',false,'dm_policy','mutual'));
 perform public.community_command(bidder,'profile',jsonb_build_object('handle','qa_bidder_'||left(bidder::text,8),'display_name','QA Collector','bio','QA fixture','city','','region','','interests','[]'::jsonb,'visibility','public','show_location',false,'dm_policy','mutual'));
 perform public.community_command(owner_uuid,'house',jsonb_build_object('id',house_uuid,'slug','qa_house_'||left(house_uuid::text,8),'about','QA fixture','categories','[]'::jsonb,'service_radius_miles',25,'auto_posts',false));
 perform public.community_command(bidder,'follow',jsonb_build_object('target_type','house','target_id',house_uuid,'following',true));
 result:=public.community_command(owner_uuid,'post',jsonb_build_object('body','QA transactional post','house_id',house_uuid,'visibility','public','moderation_status','approved','media_ids','[]'::jsonb,'tags','[]'::jsonb,'mentions','[]'::jsonb));post_uuid:=(result->>'id')::uuid;
 if not exists(select 1 from public.community_feed_items where user_id=bidder and post_id=post_uuid) then raise exception 'Follower feed entry missing'; end if;
 if not exists(select 1 from public.community_notification_events where recipient_id=bidder and category='posts' and subject_id=post_uuid) then raise exception 'Follower notification missing'; end if;
 result:=public.community_discuss(bidder,'ask',jsonb_build_object('lot_id',lot_uuid,'body','Please describe the reverse.','photo_request',true,'moderation_status','approved'));question_uuid:=(result->>'id')::uuid;
 perform public.community_discuss(owner_uuid,'answer',jsonb_build_object('id',question_uuid,'body','Light wear on the reverse.','moderation_status','approved'));
 if not exists(select 1 from public.community_questions where id=question_uuid and answered_by=owner_uuid and answered_at is not null) then raise exception 'House answer missing'; end if;
 perform set_config('request.jwt.claim.sub',bidder::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 execute 'set local role authenticated';
 if not exists(select 1 from public.community_posts where id=post_uuid) then raise exception 'Follower cannot read published post'; end if;
 if not exists(select 1 from public.community_questions where id=question_uuid and answer='Light wear on the reverse.') then raise exception 'Bidder cannot read house answer'; end if;
 if has_function_privilege('authenticated','public.community_discuss(uuid,text,jsonb)','execute') then raise exception 'Client can impersonate discussion actors'; end if;
 execute 'reset role';
 perform public.community_command(bidder,'block',jsonb_build_object('target_id',owner_uuid,'active',true));
 execute 'set local role authenticated';
 if exists(select 1 from public.community_posts where id=post_uuid) or exists(select 1 from public.community_questions where id=question_uuid) then raise exception 'Blocked content remains visible'; end if;
 execute 'reset role';
end $qa$;
rollback;
select 'PASS: live post, follower feed, notification, question, house answer, RLS, block, and rollback' as result,(select is_enabled from public.feature_flags where flag_name='community_v1') as community_enabled;
`
fs.writeFileSync(path.join(__dirname,'../docs/qa/community/live-workflow-check.sql'),sql)
console.log('Prepared rollback-only live workflow check; no credentials included.')
