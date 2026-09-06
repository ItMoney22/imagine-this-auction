begin;
create table public.community_questions (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null references public.lots(id) on delete cascade,
 asker_id uuid not null references public.users(id) on delete cascade, body text not null check(length(body) between 1 and 2000),
 photo_request boolean not null default false, answer text check(length(answer)<=4000), answered_by uuid references public.users(id) on delete set null,
 answered_at timestamptz, pinned boolean not null default false, media_id uuid references public.community_media(id) on delete set null,
 moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','hidden')), created_at timestamptz not null default now()
);
create index community_questions_lot on public.community_questions(lot_id,pinned desc,created_at desc);
create table public.community_room_settings (
 auction_id uuid primary key references public.auctions(id) on delete cascade,
 slow_seconds integer not null default 5 check(slow_seconds between 5 and 300), locked boolean not null default false
);
create table public.community_room_messages (
 id uuid primary key default gen_random_uuid(), auction_id uuid not null references public.auctions(id) on delete cascade,
 author_id uuid not null references public.users(id) on delete cascade, body text not null check(length(body) between 1 and 1000),
 moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','hidden')),
 created_at timestamptz not null default now()
);
create index community_room_messages_recent on public.community_room_messages(auction_id,created_at desc);
create table public.community_discussion_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.users(id) on delete cascade,
 question_id uuid references public.community_questions(id) on delete cascade,
 message_id uuid references public.community_room_messages(id) on delete cascade,
 reason text not null check(length(reason) between 10 and 2000), reviewed boolean not null default false,
 created_at timestamptz not null default now(), check(num_nonnulls(question_id,message_id)=1)
);
create function public.community_auction_visible(viewer uuid,subject uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.community_enabled() and exists(select 1 from auctions a join auctioneers h on h.id=a.auctioneer_id where a.id=subject and h.is_approved and not public.community_blocked(viewer,h.user_id) and public.community_active(h.user_id) and (a.status in ('scheduled','live','ended') or public.community_manages(viewer,h.id)))
$$;
revoke all on function public.community_auction_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.community_auction_visible(uuid,uuid) to service_role;
create function public.community_view_auction(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.community_auction_visible(auth.uid(),subject) $$;
create function public.community_manage_auction(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from auctions where id=subject and public.community_manages(auth.uid(),auctioneer_id)) $$;
revoke all on function public.community_view_auction(uuid),public.community_manage_auction(uuid) from public;
grant execute on function public.community_view_auction(uuid),public.community_manage_auction(uuid) to anon,authenticated,service_role;
alter table public.community_questions enable row level security;
alter table public.community_room_settings enable row level security;
alter table public.community_room_messages enable row level security;
alter table public.community_discussion_reports enable row level security;
revoke all on public.community_questions,public.community_room_settings,public.community_room_messages,public.community_discussion_reports from anon,authenticated;
grant select on public.community_questions,public.community_room_settings,public.community_room_messages to anon,authenticated;
grant select on public.community_discussion_reports to authenticated;
grant all on public.community_questions,public.community_room_settings,public.community_room_messages,public.community_discussion_reports to service_role;
create policy question_read on public.community_questions for select using(
 public.community_view_person(asker_id) and (answered_by is null or public.community_view_person(answered_by)) and exists(select 1 from lots where id=lot_id and public.community_view_auction(auction_id) and (moderation_status='approved' or asker_id=auth.uid() or public.community_manage_auction(auction_id) or public.community_admin()))
);
create policy room_settings_read on public.community_room_settings for select using(public.community_view_auction(auction_id));
create policy room_messages_read on public.community_room_messages for select using(public.community_view_auction(auction_id) and public.community_view_person(author_id) and (moderation_status='approved' or author_id=auth.uid() or public.community_manage_auction(auction_id) or public.community_admin()));
create policy discussion_reports_read on public.community_discussion_reports for select using(public.community_enabled() and (reporter_id=auth.uid() or public.community_admin()));

create function public.community_discuss(actor uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare auction_uuid uuid; house_uuid uuid; ident uuid; subject uuid; author_uuid uuid; media_uuid uuid; body_text text; approval text; manager boolean; slow integer; locked boolean; q community_questions; begin
 if not public.community_enabled() or not public.community_active(actor) or not exists(select 1 from users where id=actor) then raise exception 'Community access restricted' using errcode='42501'; end if;
 body_text:=trim(payload->>'body'); approval:=case when payload->>'moderation_status'='approved' then 'approved' else 'pending' end;
 if operation='ask' then
  subject:=(payload->>'lot_id')::uuid;
  select auction_id into auction_uuid from lots where id=subject;
 elsif operation in ('answer','pin','hide-question') then
  select * into q from community_questions where id=(payload->>'id')::uuid for update;
  select auction_id into auction_uuid from lots where id=q.lot_id;
 elsif operation in ('chat','room-settings') then auction_uuid:=(payload->>'auction_id')::uuid;
 elsif operation='hide-message' then
  select auction_id,author_id into auction_uuid,author_uuid from community_room_messages where id=(payload->>'id')::uuid for update;
 elsif operation='report' then
  if payload->>'type'='question' then
   select x.asker_id,l.auction_id into author_uuid,auction_uuid from community_questions x join lots l on l.id=x.lot_id where x.id=(payload->>'id')::uuid and x.moderation_status='approved';
  else select author_id,auction_id into author_uuid,auction_uuid from community_room_messages where id=(payload->>'id')::uuid and moderation_status='approved'; end if;
 else raise exception 'Invalid discussion operation' using errcode='22023'; end if;
 if auction_uuid is null or not public.community_auction_visible(actor,auction_uuid) then raise exception 'Auction unavailable' using errcode='42501'; end if;
 select auctioneer_id into house_uuid from auctions where id=auction_uuid;
 manager:=public.community_manages(actor,house_uuid) or public.community_is_admin(actor);
 if operation='ask' then
  if body_text is null or length(body_text) not between 1 and 2000 then raise exception 'Invalid question'; end if;
  insert into community_questions(lot_id,asker_id,body,photo_request,moderation_status) values(subject,actor,body_text,coalesce((payload->>'photo_request')::boolean,false),approval) returning id into ident;
 elsif operation='answer' then
  if not manager or public.community_blocked(actor,q.asker_id) or q.moderation_status<>'approved' then raise exception 'House access required' using errcode='42501'; end if;
  if approval<>'approved' or body_text is null or length(body_text) not between 1 and 4000 then raise exception 'Answer needs moderation approval'; end if;
  media_uuid:=(payload->>'media_id')::uuid;
  if media_uuid is not null and not exists(select 1 from community_media where id=media_uuid and owner_id=actor and moderation_status='approved' and post_id is null) then raise exception 'Photo unavailable'; end if;
  update community_questions set answer=body_text,answered_by=actor,answered_at=now(),media_id=media_uuid where id=q.id;
  perform public.community_notify(actor,q.asker_id,'replies',q.id,'The auction house answered your question. /lots/'||q.lot_id::text); ident:=q.id;
 elsif operation in ('pin','hide-question') then
  if not manager and not (operation='hide-question' and q.asker_id=actor) then raise exception 'House access required' using errcode='42501'; end if;
  if operation='pin' then update community_questions set pinned=(payload->>'active')::boolean where id=q.id;
  else update community_questions set moderation_status='hidden' where id=q.id; end if;
  insert into community_moderation_actions(moderator_id,action,reason) values(actor,operation,q.id::text); ident:=q.id;
 elsif operation='chat' then
  if not exists(select 1 from auctions where id=auction_uuid and (status='live' or (status='ended' and ends_at>now()-interval '24 hours'))) then raise exception 'Chat opens during the auction and closes 24 hours afterward'; end if;
  select s.slow_seconds,s.locked into slow,locked from community_room_settings s where s.auction_id=auction_uuid;
  if coalesce(locked,false) and not manager then raise exception 'The house has paused chat'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||auction_uuid::text,36));
  if exists(select 1 from community_room_messages where author_id=actor and auction_id=auction_uuid and created_at>now()-make_interval(secs=>coalesce(slow,5))) then raise exception 'Slow mode: wait before sending another message'; end if;
  if not public.community_take_rate(actor,'room:'||auction_uuid::text,1,coalesce(slow,5)) then raise exception 'Slow mode: wait before sending another message'; end if;
  if body_text is null or length(body_text) not between 1 and 1000 then raise exception 'Invalid message'; end if;
  insert into community_room_messages(auction_id,author_id,body,moderation_status) values(auction_uuid,actor,body_text,approval) returning id into ident;
 elsif operation='room-settings' then
  if not manager then raise exception 'House access required' using errcode='42501'; end if;
  insert into community_room_settings(auction_id,slow_seconds,locked) values(auction_uuid,(payload->>'slow_seconds')::integer,(payload->>'locked')::boolean)
  on conflict(auction_id) do update set slow_seconds=excluded.slow_seconds,locked=excluded.locked;
  insert into community_moderation_actions(moderator_id,action,reason) values(actor,'room-settings',auction_uuid::text); ident:=auction_uuid;
 elsif operation='hide-message' then
  if not manager and author_uuid<>actor then raise exception 'House access required' using errcode='42501'; end if;
  update community_room_messages set moderation_status='hidden' where id=(payload->>'id')::uuid;
  insert into community_moderation_actions(moderator_id,action,reason) values(actor,operation,payload->>'id'); ident:=(payload->>'id')::uuid;
 elsif operation='report' then
  if public.community_blocked(actor,author_uuid) then raise exception 'Content unavailable'; end if;
  insert into community_discussion_reports(reporter_id,question_id,message_id,reason) values(actor,case when payload->>'type'='question' then (payload->>'id')::uuid end,case when payload->>'type'='message' then (payload->>'id')::uuid end,payload->>'reason') returning id into ident;
 end if;
 return jsonb_build_object('id',ident,'moderation_status',approval);
end $$;
revoke all on function public.community_discuss(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.community_discuss(uuid,text,jsonb) to service_role;
create function public.community_review_discussion(actor uuid,kind text,subject uuid,approve boolean,report_id uuid,reason text) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.community_enabled() or not public.community_is_admin(actor) then raise exception 'Admin access required' using errcode='42501'; end if;
 if length(reason) not between 5 and 1000 then raise exception 'Explain the moderation decision'; end if;
 if report_id is not null and not exists(select 1 from community_discussion_reports r where r.id=report_id and ((kind='question' and r.question_id=subject) or (kind='message' and r.message_id=subject))) then raise exception 'Report does not match content'; end if;
 if kind='question' then update community_questions set moderation_status=case when approve then 'approved' else 'hidden' end where id=subject;
 elsif kind='message' then update community_room_messages set moderation_status=case when approve then 'approved' else 'hidden' end where id=subject;
 else raise exception 'Invalid discussion type'; end if;
 if not found then raise exception 'Content unavailable'; end if;
 update community_discussion_reports set reviewed=true where id=report_id;
 insert into community_moderation_actions(moderator_id,action,reason) values(actor,case when approve then 'approve' else 'hide' end,kind||' '||subject::text||': '||reason);
 return '{"saved":true}';
end $$;
revoke all on function public.community_review_discussion(uuid,text,uuid,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.community_review_discussion(uuid,text,uuid,boolean,uuid,text) to service_role;
alter publication supabase_realtime add table public.community_questions,public.community_room_messages,public.community_room_settings;
notify pgrst,'reload schema';
insert into ita_internal.migrations(name,sha256) values('036_community_questions_chat.sql','f2605ddab77d75fd5c4ed8a1b060a68025a535da9486306763120a00498693a4');
commit;

select count(*) as tables_without_rls from pg_tables where schemaname='public' and not rowsecurity;