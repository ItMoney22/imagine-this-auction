-- ITA community foundation, enabled only after application QA. Target lyijpsppmbgjcvzaxhzn.

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='029_database_rebuild_access.sql' and sha256<>'ef6ae8fd5ef324b8307030bfc7938db69a46a139a728c6b243b29db7b799d290') then raise exception 'Migration checksum mismatch: 029_database_rebuild_access.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='029_database_rebuild_access.sql') then
execute $migration$
-- Close legacy RPC access exposed by the original bootstrap migrations.
-- This preserves the current application schema; the launch payment replacement remains separate.

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

$migration$;
insert into ita_internal.migrations(name,sha256) values('029_database_rebuild_access.sql','ef6ae8fd5ef324b8307030bfc7938db69a46a139a728c6b243b29db7b799d290');
end if; end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='030_community_foundation.sql' and sha256<>'c1a8b91ea09203cb239169f6fc37f4b57259e29b60d26057339ef8546d7e105e') then raise exception 'Migration checksum mismatch: 030_community_foundation.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='030_community_foundation.sql') then
execute $migration$
-- Community phase 1. Apply manually AFTER launch migrations 019-026.
-- Public content is read through RLS. All writes go through validated server routes.

insert into public.feature_flags(flag_name,is_enabled,description) values ('community_v1',false,'Community profiles, feed and social features') on conflict(flag_name) do nothing;
alter table public.users add column if not exists handle text;
alter table public.auctioneers add column if not exists slug text;
create unique index if not exists users_handle_unique on public.users(lower(handle)) where handle is not null;
create unique index if not exists auctioneers_slug_unique on public.auctioneers(lower(slug)) where slug is not null;

create table public.community_profiles (
 user_id uuid primary key references public.users(id) on delete cascade,
 handle text not null unique check(handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'), display_name text not null check(length(display_name) between 1 and 80),
 bio text not null default '' check(length(bio)<=500), city text not null default '', region text not null default '',
 interests text[] not null default '{}', visibility text not null default 'public' check(visibility in ('public','followers','private')),
 show_location boolean not null default false, dm_policy text not null default 'mutual' check(dm_policy in ('mutual','open','closed')),
 avatar_path text, banner_path text, reputation_tier text not null default 'New' check(reputation_tier in ('New','Trusted','Established','Whale')),
 handle_changed_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.community_houses (
 id uuid primary key references public.auctioneers(id) on delete cascade,
 owner_id uuid not null references public.users(id) on delete cascade,
 slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9_]{2,29}$'), company_name text not null,
 about text not null default '', city text not null default '', region text not null default '',
 categories text[] not null default '{}', service_radius_miles integer not null default 25 check(service_radius_miles between 1 and 500),
 banner_path text, logo_url text, is_approved boolean not null default false, auto_posts boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.house_members (
 auctioneer_id uuid not null references public.auctioneers(id) on delete cascade, user_id uuid not null references public.users(id) on delete cascade,
 role text not null check(role in ('owner','staff')), primary key(auctioneer_id,user_id)
);
create table public.community_tags(id uuid primary key default gen_random_uuid(), name text not null unique check(name ~ '^[a-z0-9][a-z0-9-]{1,39}$'));
create table public.community_follows (
 follower_id uuid not null references public.users(id) on delete cascade,
 target_type text not null check(target_type in ('user','house','tag','auction')), target_id uuid not null,
 created_at timestamptz not null default now(), primary key(follower_id,target_type,target_id)
);
create index community_follow_target on public.community_follows(target_type,target_id,follower_id);
create table public.community_blocks (
 user_id uuid not null references public.users(id) on delete cascade, target_id uuid not null references public.users(id) on delete cascade,
 primary key(user_id,target_id), check(user_id<>target_id)
);
create table public.community_mutes (
 user_id uuid not null references public.users(id) on delete cascade, target_id uuid not null references public.users(id) on delete cascade,
 primary key(user_id,target_id), check(user_id<>target_id)
);
create table public.community_restrictions (
 user_id uuid primary key references public.users(id) on delete cascade, until_at timestamptz, reason text not null, created_at timestamptz not null default now()
);
create table public.community_posts (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.users(id) on delete cascade,
 house_id uuid references public.community_houses(id) on delete cascade,
 body text not null check(length(body) between 1 and 4000), visibility text not null default 'public' check(visibility in ('public','followers')),
 moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','hidden')),
 lot_id uuid references public.lots(id) on delete set null, auction_id uuid references public.auctions(id) on delete set null,
 scheduled_at timestamptz, published_at timestamptz, created_at timestamptz not null default now(),
 auto_key text unique, check(published_at is null or moderation_status='approved')
);
create index community_posts_feed on public.community_posts(published_at desc,id) where moderation_status='approved';
create index community_posts_author on public.community_posts(author_id,created_at desc);
create index community_posts_house on public.community_posts(house_id,published_at desc);
create table public.community_media (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users(id) on delete cascade,
 post_id uuid references public.community_posts(id) on delete cascade, path text not null unique,
 content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 10485760), alt_text text not null default '' check(length(alt_text)<=200),
 moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','hidden')), created_at timestamptz not null default now()
);
create index community_media_post on public.community_media(post_id);
create table public.community_comments (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.community_posts(id) on delete cascade,
 author_id uuid not null references public.users(id) on delete cascade, parent_id uuid references public.community_comments(id) on delete cascade,
 body text not null check(length(body) between 1 and 2000), moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','hidden')),
 created_at timestamptz not null default now()
);
create index community_comments_post on public.community_comments(post_id,created_at);
create table public.community_reactions (
 post_id uuid not null references public.community_posts(id) on delete cascade, user_id uuid not null references public.users(id) on delete cascade,
 kind text not null check(kind in ('like','love','celebrate','wow','laugh','want')), primary key(post_id,user_id)
);
create table public.community_taggings(post_id uuid references public.community_posts(id) on delete cascade,tag_id uuid references public.community_tags(id) on delete cascade,primary key(post_id,tag_id));
create table public.community_mentions(post_id uuid references public.community_posts(id) on delete cascade,user_id uuid references public.users(id) on delete cascade,primary key(post_id,user_id));
create table public.community_feed_items (
 user_id uuid not null references public.users(id) on delete cascade, post_id uuid not null references public.community_posts(id) on delete cascade,
 reason text not null default 'follow', created_at timestamptz not null default now(), primary key(user_id,post_id)
);
create index community_feed_user on public.community_feed_items(user_id,created_at desc);
create table public.community_notification_preferences (
 user_id uuid not null references public.users(id) on delete cascade, category text not null check(category in ('posts','follows','replies','mentions','reactions','auctions')),
 frequency text not null default 'instant' check(frequency in ('instant','daily','weekly','off')), primary key(user_id,category)
);
create table public.community_notification_events (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.users(id) on delete cascade,
 actor_id uuid references public.users(id) on delete cascade, category text not null, subject_id uuid not null,
 notification_id uuid references public.notifications(id) on delete cascade,
 digest_at timestamptz, digested_at timestamptz, created_at timestamptz not null default now(),
 unique(recipient_id,actor_id,category,subject_id)
);
create table public.community_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.users(id) on delete cascade,
 subject_type text not null check(subject_type in ('user','post','comment')), subject_id uuid not null,
 reason text not null check(length(reason) between 10 and 2000), status text not null default 'open' check(status in ('open','resolved')),
 created_at timestamptz not null default now()
);
create table public.community_moderation_actions (
 id uuid primary key default gen_random_uuid(), moderator_id uuid references public.users(id) on delete set null,
 report_id uuid references public.community_reports(id) on delete set null, action text not null,
 reason text not null, created_at timestamptz not null default now()
);
create table public.community_rate_limits(user_id uuid references public.users(id) on delete cascade,action text,window_at timestamptz not null,hits integer not null,primary key(user_id,action));

create function public.community_enabled() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select is_enabled from public.feature_flags where flag_name='community_v1'),false)
$$;
create function public.community_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.community_blocks where (user_id=a and target_id=b) or (user_id=b and target_id=a))
$$;
create function public.community_active(a uuid) returns boolean language sql stable security definer set search_path=public as $$
 select not exists(select 1 from public.community_restrictions where user_id=a and (until_at is null or until_at>now()))
$$;
create function public.community_is_admin(a uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.users where id=a and role='admin') $$;
create function public.community_manages(a uuid,h uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.auctioneers where id=h and user_id=a and is_approved) or exists(select 1 from public.house_members m join public.auctioneers house on house.id=m.auctioneer_id where m.auctioneer_id=h and m.user_id=a and house.is_approved)
$$;
create function public.community_profile_visible(viewer uuid,subject uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.community_enabled() and not public.community_blocked(viewer,subject) and public.community_active(subject) and exists(
 select 1 from public.community_profiles p where p.user_id=subject and (subject=viewer or p.visibility='public' or (p.visibility='followers' and exists(select 1 from public.community_follows f where f.follower_id=viewer and f.target_type='user' and f.target_id=subject))))
$$;
create function public.community_post_visible(viewer uuid,subject uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.community_enabled() and exists(select 1 from public.community_posts p where p.id=subject
 and not public.community_blocked(viewer,p.author_id) and public.community_active(p.author_id)
 and (p.house_id is null or exists(select 1 from public.community_houses h where h.id=p.house_id and h.is_approved and not public.community_blocked(viewer,h.owner_id)))
 and (p.author_id=viewer or (p.moderation_status='approved' and p.published_at<=now()
 and (p.house_id is not null or public.community_profile_visible(viewer,p.author_id))
 and (p.visibility='public' or exists(select 1 from public.community_follows f where f.follower_id=viewer and ((f.target_type='user' and f.target_id=p.author_id) or (f.target_type='house' and f.target_id=p.house_id)))))))
$$;

-- Only expose session-bound helpers. Arbitrary viewer IDs would expose private follow/block relationships through RPC.
create function public.community_view_profile(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.community_profile_visible(auth.uid(),subject) $$;
create function public.community_view_post(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.community_post_visible(auth.uid(),subject) $$;
create function public.community_view_person(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.community_active(subject) and not public.community_blocked(auth.uid(),subject) $$;
create function public.community_admin() returns boolean language sql stable security definer set search_path=public as $$ select public.community_is_admin(auth.uid()) $$;
revoke all on function public.community_view_profile(uuid),public.community_view_post(uuid),public.community_view_person(uuid),public.community_admin() from public;

do $$ declare t text; begin
 foreach t in array array['community_profiles','community_houses','house_members','community_tags','community_follows','community_blocks','community_mutes','community_restrictions','community_posts','community_media','community_comments','community_reactions','community_taggings','community_mentions','community_feed_items','community_notification_preferences','community_notification_events','community_reports','community_moderation_actions','community_rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.community_profiles,public.community_houses,public.community_posts,public.community_media,public.community_comments,public.community_reactions,public.community_tags,public.community_taggings to anon;
create policy profiles_read on public.community_profiles for select using(public.community_view_profile(user_id));
create policy houses_read on public.community_houses for select using(public.community_enabled() and is_approved and public.community_view_person(owner_id));
create policy members_read on public.house_members for select using(public.community_enabled() and user_id=auth.uid());
create policy tags_read on public.community_tags for select using(public.community_enabled());
create policy follows_read on public.community_follows for select using(public.community_enabled() and follower_id=auth.uid());
create policy blocks_read on public.community_blocks for select using(public.community_enabled() and user_id=auth.uid());
create policy mutes_read on public.community_mutes for select using(public.community_enabled() and user_id=auth.uid());
create policy restrictions_read on public.community_restrictions for select using(public.community_admin());
create policy posts_read on public.community_posts for select using(public.community_view_post(id));
create policy media_read on public.community_media for select using(public.community_enabled() and (owner_id=auth.uid() or (moderation_status='approved' and public.community_view_post(post_id))));
create policy comments_read on public.community_comments for select using(public.community_view_post(post_id) and public.community_view_person(author_id) and (moderation_status='approved' or author_id=auth.uid()));
create policy reactions_read on public.community_reactions for select using(public.community_view_post(post_id) and public.community_view_person(user_id));
create policy taggings_read on public.community_taggings for select using(public.community_view_post(post_id));
create policy mentions_read on public.community_mentions for select using(user_id=auth.uid() and public.community_view_post(post_id));
create policy feed_read on public.community_feed_items for select using(user_id=auth.uid() and public.community_view_post(post_id));
create policy preferences_read on public.community_notification_preferences for select using(user_id=auth.uid() and public.community_enabled());
create policy notification_events_read on public.community_notification_events for select using(recipient_id=auth.uid() and public.community_enabled() and public.community_view_person(actor_id));
create policy reports_read on public.community_reports for select using(public.community_enabled() and (reporter_id=auth.uid() or public.community_admin()));
create policy moderation_read on public.community_moderation_actions for select using(public.community_enabled() and public.community_admin());

-- The bucket stays private: hiding a post or blocking an author must revoke future reads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('community-media','community-media',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy community_storage_read on storage.objects for select using(bucket_id='community-media' and public.community_enabled() and exists(select 1 from public.community_media m where m.path=name and (m.owner_id=auth.uid() or (m.moderation_status='approved' and public.community_view_post(m.post_id)))));

-- Atomic fixed-window limits persist across requests, workers and restarts.
create function public.community_take_rate(actor uuid,action_name text,max_hits integer,window_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$
declare used integer; begin
 if not public.community_enabled() or not public.community_active(actor) then return false; end if;
 insert into public.community_rate_limits(user_id,action,window_at,hits) values(actor,action_name,now(),1)
 on conflict(user_id,action) do update set
 hits=case when community_rate_limits.window_at<=now()-make_interval(secs=>window_seconds) then 1 else community_rate_limits.hits+1 end,
 window_at=case when community_rate_limits.window_at<=now()-make_interval(secs=>window_seconds) then now() else community_rate_limits.window_at end returning hits into used;
 return used<=max_hits;
end $$;

create function public.community_notify(actor uuid,recipient uuid,category_name text,subject uuid,message_text text) returns void language plpgsql security definer set search_path=public as $$
declare frequency text; event_id uuid; note_id uuid; due timestamptz; begin
 if recipient=actor or public.community_blocked(actor,recipient) or not public.community_active(recipient) then return; end if;
 select p.frequency into frequency from public.community_notification_preferences p where p.user_id=recipient and p.category=category_name;
 frequency:=coalesce(frequency,'instant');
 due:=case frequency when 'daily' then date_trunc('day',now())+interval '1 day' when 'weekly' then date_trunc('week',now())+interval '1 week' end;
 insert into public.community_notification_events(recipient_id,actor_id,category,subject_id,digest_at) values(recipient,actor,category_name,subject,due)
 on conflict(recipient_id,actor_id,category,subject_id) do nothing returning id into event_id;
 if event_id is null then return; end if;
 insert into public.notifications(user_id,title,message,type,email_sent_at,push_sent_at)
 values(recipient,'Community update',message_text,'community_'||category_name,case when frequency<>'instant' then now() end,case when frequency<>'instant' then now() end) returning id into note_id;
 update public.community_notification_events set notification_id=note_id where id=event_id;
end $$;

create function public.community_publish(post_uuid uuid) returns void language plpgsql security definer set search_path=public as $$
declare p public.community_posts; recipients bigint; r record; begin
 select * into p from public.community_posts where id=post_uuid for update;
 if p.id is null or p.moderation_status<>'approved' or p.published_at is not null or coalesce(p.scheduled_at,now())>now() or not public.community_active(p.author_id) then return; end if;
 update public.community_posts set published_at=now() where id=p.id;
 select count(*) into recipients from public.community_follows f where (f.target_type='user' and f.target_id=p.author_id) or (f.target_type='house' and f.target_id=p.house_id);
 if recipients<=5000 then
 insert into public.community_feed_items(user_id,post_id) select distinct f.follower_id,p.id from public.community_follows f
 where ((f.target_type='user' and f.target_id=p.author_id) or (f.target_type='house' and f.target_id=p.house_id)) and public.community_post_visible(f.follower_id,p.id) on conflict do nothing;
 end if;
 for r in select distinct f.follower_id from public.community_follows f where ((f.target_type='user' and f.target_id=p.author_id) or (f.target_type='house' and f.target_id=p.house_id)) and public.community_post_visible(f.follower_id,p.id) loop
 perform public.community_notify(p.author_id,r.follower_id,'posts',p.id,'Someone you follow published a post. Visit Community to read it.');
 end loop;
 for r in select user_id from public.community_mentions where post_id=p.id loop
 if public.community_post_visible(r.user_id,p.id) then perform public.community_notify(p.author_id,r.user_id,'mentions',p.id,'You were mentioned in a community post.'); end if;
 end loop;
end $$;

-- Keep company identity and approval authoritative in the auctioneer record.
create function public.community_sync_house() returns trigger language plpgsql security definer set search_path=public as $$ begin
 update public.community_houses set company_name=new.company_name,owner_id=new.user_id,city=new.city,region=new.state,logo_url=new.logo_url,is_approved=new.is_approved where id=new.id;
 return new;
end $$;
create trigger community_house_identity after update on public.auctioneers for each row execute function public.community_sync_house();
create function public.community_protect_handles() returns trigger language plpgsql set search_path=public as $$ begin
 if auth.role() is distinct from 'service_role' and current_user not in ('postgres','supabase_admin') then
 if (tg_table_name='users' and to_jsonb(new)->'handle' is distinct from to_jsonb(old)->'handle') or (tg_table_name='auctioneers' and to_jsonb(new)->'slug' is distinct from to_jsonb(old)->'slug') then raise exception 'Use community profile settings' using errcode='42501'; end if;
 end if; return new;
end $$;
create trigger community_handle_guard before update on public.users for each row execute function public.community_protect_handles();
create trigger community_slug_guard before update on public.auctioneers for each row execute function public.community_protect_handles();

do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'community_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['community_reactions','community_feed_items'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop; end if;
end $$;
grant execute on function public.community_enabled(),public.community_view_profile(uuid),public.community_view_post(uuid),public.community_view_person(uuid),public.community_admin() to anon,authenticated,service_role;

$migration$;
insert into ita_internal.migrations(name,sha256) values('030_community_foundation.sql','c1a8b91ea09203cb239169f6fc37f4b57259e29b60d26057339ef8546d7e105e');
end if; end $checkpoint$;
commit;

begin;
do $checkpoint$ begin
if exists(select 1 from ita_internal.migrations where name='031_community_commands.sql' and sha256<>'8d0fc9e6a5609096e8c76a8d80321c754b64f153930065a6cc182dd5985334cb') then raise exception 'Migration checksum mismatch: 031_community_commands.sql'; end if;
if not exists(select 1 from ita_internal.migrations where name='031_community_commands.sql') then
execute $migration$
-- Server-only community transactions. Manual application after 030.

create function public.community_command(actor uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare ident uuid; subject uuid; owner_uuid uuid; house_uuid uuid; result jsonb; old_profile public.community_profiles; p public.community_posts; c public.community_comments; r public.community_reports; word text; approval text; begin
 if not public.community_enabled() then raise exception 'Community is not available' using errcode='42501'; end if;
 if not exists(select 1 from public.users where id=actor) or not public.community_active(actor) then raise exception 'Community access restricted' using errcode='42501'; end if;
 approval:=case when payload->>'moderation_status'='approved' then 'approved' else 'pending' end;
 if operation='profile' then
 select * into old_profile from public.community_profiles where user_id=actor for update;
 if old_profile.handle is distinct from payload->>'handle' and old_profile.handle_changed_at>now()-interval '30 days' then raise exception 'Handles can change once every 30 days' using errcode='22023'; end if;
 if payload->>'handle'=any(array['admin','administrator','api','auth','auctioneer','auctions','community','consign','dashboard','explore','feed','groups','help','imaginethisauction','ita','live','login','lots','messages','moderator','notifications','org','settings','signup','staff','support','system']) then raise exception 'Reserved handle' using errcode='22023'; end if;
 if coalesce(payload->>'avatar_path','')<>'' or coalesce(payload->>'banner_path','')<>'' then raise exception 'Profile image uploads are not enabled yet' using errcode='22023'; end if;
 insert into public.community_profiles(user_id,handle,display_name,bio,city,region,interests,visibility,show_location,dm_policy)
 values(actor,payload->>'handle',payload->>'display_name',payload->>'bio',case when (payload->>'show_location')::boolean then payload->>'city' else '' end,case when (payload->>'show_location')::boolean then payload->>'region' else '' end,array(select jsonb_array_elements_text(payload->'interests')),payload->>'visibility',(payload->>'show_location')::boolean,payload->>'dm_policy')
 on conflict(user_id) do update set handle=excluded.handle,display_name=excluded.display_name,bio=excluded.bio,city=excluded.city,region=excluded.region,interests=excluded.interests,visibility=excluded.visibility,show_location=excluded.show_location,dm_policy=excluded.dm_policy,updated_at=now(),handle_changed_at=case when community_profiles.handle<>excluded.handle then now() else community_profiles.handle_changed_at end;
 update public.users set handle=payload->>'handle' where id=actor;
 return jsonb_build_object('handle',payload->>'handle');
 elsif operation='house' then
 house_uuid:=(payload->>'id')::uuid;
 if not public.community_manages(actor,house_uuid) then raise exception 'House access required' using errcode='42501'; end if;
 if exists(select 1 from public.community_houses where id=house_uuid and slug<>payload->>'slug') then raise exception 'Contact support to change a house address' using errcode='22023'; end if;
 insert into public.community_houses(id,owner_id,slug,company_name,city,region,logo_url,is_approved,about,categories,service_radius_miles,auto_posts)
 select id,user_id,payload->>'slug',company_name,city,state,logo_url,is_approved,payload->>'about',array(select jsonb_array_elements_text(payload->'categories')),(payload->>'service_radius_miles')::integer,(payload->>'auto_posts')::boolean from public.auctioneers where id=house_uuid
 on conflict(id) do update set about=excluded.about,categories=excluded.categories,service_radius_miles=excluded.service_radius_miles,auto_posts=excluded.auto_posts;
 update public.auctioneers set slug=payload->>'slug' where id=house_uuid;
 insert into public.house_members(auctioneer_id,user_id,role) select id,user_id,'owner' from public.auctioneers where id=house_uuid on conflict do nothing;
 return jsonb_build_object('slug',payload->>'slug');
 elsif operation='follow' then
 subject:=(payload->>'target_id')::uuid;
 if not (payload->>'following')::boolean then delete from public.community_follows where follower_id=actor and target_type=payload->>'target_type' and target_id=subject; return '{"following":false}'; end if;
 if payload->>'target_type'='user' then
 if subject=actor or not public.community_profile_visible(actor,subject) then raise exception 'Profile unavailable' using errcode='42501'; end if; owner_uuid:=subject;
 elsif payload->>'target_type'='house' then
 select owner_id into owner_uuid from public.community_houses where id=subject and is_approved;
 if owner_uuid is null or public.community_blocked(actor,owner_uuid) then raise exception 'House unavailable' using errcode='42501'; end if;
 elsif payload->>'target_type'='tag' then
 if not exists(select 1 from public.community_tags where id=subject) then raise exception 'Tag unavailable' using errcode='22023'; end if;
 elsif payload->>'target_type'='auction' then
 if not exists(select 1 from public.auctions where id=subject and status in ('scheduled','live')) then raise exception 'Auction unavailable' using errcode='22023'; end if;
 else raise exception 'Invalid follow target' using errcode='22023'; end if;
 insert into public.community_follows(follower_id,target_type,target_id) values(actor,payload->>'target_type',subject) on conflict do nothing;
 if owner_uuid is not null then perform public.community_notify(actor,owner_uuid,'follows',actor,'You have a new community follower.'); end if;
 return '{"following":true}';
 elsif operation='post' then
 if not exists(select 1 from public.community_profiles where user_id=actor) then raise exception 'Create your community profile first' using errcode='22023'; end if;
 house_uuid:=(payload->>'house_id')::uuid;
 if house_uuid is not null and not public.community_manages(actor,house_uuid) then raise exception 'House access required' using errcode='42501'; end if;
 if payload->>'scheduled_at' is not null and ((payload->>'scheduled_at')::timestamptz<now() or (payload->>'scheduled_at')::timestamptz>now()+interval '1 year') then raise exception 'Choose a future time within one year' using errcode='22023'; end if;
 if payload->>'lot_id' is not null and not exists(select 1 from public.lots l join public.auctions a on a.id=l.auction_id where l.id=(payload->>'lot_id')::uuid and a.status in ('scheduled','live','ended','completed') and (house_uuid is null or a.auctioneer_id=house_uuid)) then raise exception 'Lot unavailable' using errcode='22023'; end if;
 if payload->>'auction_id' is not null and not exists(select 1 from public.auctions where id=(payload->>'auction_id')::uuid and status in ('scheduled','live','ended','completed') and (house_uuid is null or auctioneer_id=house_uuid)) then raise exception 'Auction unavailable' using errcode='22023'; end if;
 -- Lock each upload before claiming it; concurrent posts cannot share an attachment.
 perform 1 from public.community_media where id in (select value::uuid from jsonb_array_elements_text(payload->'media_ids')) order by id for update;
 if jsonb_array_length(payload->'media_ids')>10 or (select count(*) from public.community_media where owner_id=actor and post_id is null and moderation_status='approved' and id in(select value::uuid from jsonb_array_elements_text(payload->'media_ids')))<>jsonb_array_length(payload->'media_ids') then raise exception 'Photos must belong to you and pass moderation' using errcode='22023'; end if;
 insert into public.community_posts(author_id,house_id,body,visibility,moderation_status,lot_id,auction_id,scheduled_at)
 values(actor,house_uuid,payload->>'body',payload->>'visibility',approval,(payload->>'lot_id')::uuid,(payload->>'auction_id')::uuid,(payload->>'scheduled_at')::timestamptz) returning id into ident;
 update public.community_media set post_id=ident where id in(select value::uuid from jsonb_array_elements_text(payload->'media_ids'));
 for word in select jsonb_array_elements_text(payload->'tags') loop
 insert into public.community_tags(name) values(word) on conflict do nothing;
 insert into public.community_taggings(post_id,tag_id) select ident,id from public.community_tags where name=word on conflict do nothing;
 end loop;
 insert into public.community_mentions(post_id,user_id) select ident,user_id from public.community_profiles where handle in(select jsonb_array_elements_text(payload->'mentions')) and not public.community_blocked(actor,user_id) on conflict do nothing;
 perform public.community_publish(ident);
 return jsonb_build_object('id',ident,'moderation_status',approval);
 elsif operation='delete-post' then
 ident:=(payload->>'id')::uuid;
 if not exists(select 1 from public.community_posts where id=ident and (author_id=actor or public.community_manages(actor,house_id))) then raise exception 'Post access required' using errcode='42501'; end if;
 update public.community_posts set moderation_status='hidden',published_at=null where id=ident;
 return '{"hidden":true}';
 elsif operation='comment' then
 ident:=(payload->>'post_id')::uuid;
 if not public.community_post_visible(actor,ident) or not exists(select 1 from public.community_posts where id=ident and published_at<=now() and moderation_status='approved') then raise exception 'Post unavailable' using errcode='42501'; end if;
 if payload->>'parent_id' is not null and not exists(select 1 from public.community_comments where id=(payload->>'parent_id')::uuid and post_id=ident and parent_id is null and moderation_status='approved' and not public.community_blocked(actor,author_id)) then raise exception 'Reply to a visible top-level comment' using errcode='22023'; end if;
 insert into public.community_comments(post_id,author_id,parent_id,body,moderation_status) values(ident,actor,(payload->>'parent_id')::uuid,payload->>'body',approval) returning id into subject;
 if approval='approved' then
 select author_id into owner_uuid from public.community_posts where id=ident;
 perform public.community_notify(actor,owner_uuid,'replies',subject,'Someone commented on your community post.');
 if payload->>'parent_id' is not null then select author_id into owner_uuid from public.community_comments where id=(payload->>'parent_id')::uuid; perform public.community_notify(actor,owner_uuid,'replies',subject,'Someone replied to your comment.'); end if;
 end if;
 return jsonb_build_object('id',subject,'moderation_status',approval);
 elsif operation='reaction' then
 ident:=(payload->>'post_id')::uuid;
 if not public.community_post_visible(actor,ident) then raise exception 'Post unavailable' using errcode='42501'; end if;
 if (payload->>'active')::boolean then
 insert into public.community_reactions(post_id,user_id,kind) values(ident,actor,payload->>'kind') on conflict(post_id,user_id) do update set kind=excluded.kind;
 select author_id into owner_uuid from public.community_posts where id=ident;
 perform public.community_notify(actor,owner_uuid,'reactions',ident,'Someone reacted to your community post.');
 else delete from public.community_reactions where post_id=ident and user_id=actor; end if;
 return '{"saved":true}';
 elsif operation in ('block','mute') then
 subject:=(payload->>'target_id')::uuid;
 if subject=actor then raise exception 'Choose another member' using errcode='22023'; end if;
 if operation='block' then
 if (payload->>'active')::boolean then
 insert into public.community_blocks(user_id,target_id) values(actor,subject) on conflict do nothing;
 delete from public.community_follows where (follower_id=actor and ((target_type='user' and target_id=subject) or (target_type='house' and target_id in(select id from public.community_houses where owner_id=subject)))) or (follower_id=subject and ((target_type='user' and target_id=actor) or (target_type='house' and target_id in(select id from public.community_houses where owner_id=actor))));
 update public.notifications set email_sent_at=coalesce(email_sent_at,now()),push_sent_at=coalesce(push_sent_at,now()) where id in(select notification_id from public.community_notification_events where (actor_id=actor and recipient_id=subject) or (actor_id=subject and recipient_id=actor));
 update public.community_notification_events set digested_at=now() where (actor_id=actor and recipient_id=subject) or (actor_id=subject and recipient_id=actor);
 else delete from public.community_blocks where user_id=actor and target_id=subject; end if;
 else
 if (payload->>'active')::boolean then insert into public.community_mutes(user_id,target_id) values(actor,subject) on conflict do nothing; else delete from public.community_mutes where user_id=actor and target_id=subject; end if;
 end if; return '{"saved":true}';
 elsif operation='preference' then
 insert into public.community_notification_preferences(user_id,category,frequency) values(actor,payload->>'category',payload->>'frequency') on conflict(user_id,category) do update set frequency=excluded.frequency;
 return '{"saved":true}';
 elsif operation='report' then
 subject:=(payload->>'subject_id')::uuid;
 if payload->>'subject_type'='post' and not public.community_post_visible(actor,subject) then raise exception 'Post unavailable' using errcode='42501'; end if;
 if payload->>'subject_type'='user' and not public.community_profile_visible(actor,subject) then raise exception 'Profile unavailable' using errcode='42501'; end if;
 if payload->>'subject_type'='comment' and not exists(select 1 from public.community_comments where id=subject and public.community_post_visible(actor,post_id) and moderation_status='approved' and not public.community_blocked(actor,author_id)) then raise exception 'Comment unavailable' using errcode='42501'; end if;
 insert into public.community_reports(reporter_id,subject_type,subject_id,reason) values(actor,payload->>'subject_type',subject,payload->>'reason') returning id into ident;
 return jsonb_build_object('id',ident);
 elsif operation='moderate' then
 if not public.community_is_admin(actor) then raise exception 'Admin access required' using errcode='42501'; end if;
 select * into r from public.community_reports where id=(payload->>'report_id')::uuid for update;
 if r.id is null then raise exception 'Report unavailable' using errcode='22023'; end if;
 if r.subject_type='post' then select author_id into owner_uuid from public.community_posts where id=r.subject_id;
 elsif r.subject_type='comment' then select author_id into owner_uuid from public.community_comments where id=r.subject_id; else owner_uuid:=r.subject_id; end if;
 if payload->>'action'='hide' then
 if r.subject_type='post' then update public.community_posts set moderation_status='hidden',published_at=null where id=r.subject_id;
 elsif r.subject_type='comment' then update public.community_comments set moderation_status='hidden' where id=r.subject_id; else raise exception 'Choose suspend for a profile' using errcode='22023'; end if;
 elsif payload->>'action' in ('suspend','ban') then
 if public.community_is_admin(owner_uuid) then raise exception 'Admin accounts require separate review' using errcode='42501'; end if;
 insert into public.community_restrictions(user_id,until_at,reason) values(owner_uuid,case when payload->>'action'='suspend' then now()+interval '7 days' end,payload->>'reason') on conflict(user_id) do update set until_at=excluded.until_at,reason=excluded.reason;
 elsif payload->>'action'='restore' then
 if r.subject_type='post' then update public.community_posts set moderation_status='approved' where id=r.subject_id; perform public.community_publish(r.subject_id);
 elsif r.subject_type='comment' then update public.community_comments set moderation_status='approved' where id=r.subject_id; else delete from public.community_restrictions where user_id=owner_uuid; end if;
 elsif payload->>'action'='warn' then perform public.community_notify(actor,owner_uuid,'replies',r.id,'A moderator has asked you to review the community rules.');
 elsif payload->>'action'<>'dismiss' then raise exception 'Invalid action' using errcode='22023'; end if;
 insert into public.community_moderation_actions(moderator_id,report_id,action,reason) values(actor,r.id,payload->>'action',payload->>'reason');
 update public.community_reports set status='resolved' where id=r.id;
 return '{"saved":true}';
 end if;
 raise exception 'Unknown community operation' using errcode='22023';
end $$;
revoke all on function public.community_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.community_command(uuid,text,jsonb) to service_role;

create function public.community_maintenance() returns jsonb language plpgsql security definer set search_path=public as $$
declare p record; r record; n integer:=0; begin
 if not public.community_enabled() then return '{"enabled":false}'; end if;
 for p in select id from public.community_posts where published_at is null and moderation_status='approved' and scheduled_at<=now() order by scheduled_at limit 100 for update skip locked loop perform public.community_publish(p.id); n:=n+1; end loop;
 for r in select recipient_id,count(*) as total from public.community_notification_events where digest_at<=now() and digested_at is null and not public.community_blocked(actor_id,recipient_id) group by recipient_id limit 100 loop
 -- Serialize each recipient so overlapping cron runs cannot send duplicate digests.
 perform pg_advisory_xact_lock(hashtextextended(r.recipient_id::text,31));
 with due as (update public.community_notification_events set digested_at=now() where recipient_id=r.recipient_id and digest_at<=now() and digested_at is null and not public.community_blocked(actor_id,recipient_id) returning id)
 insert into public.notifications(user_id,title,message,type) select r.recipient_id,'Your community digest',count(*)::text||' new community updates are waiting in your notification center.','community_digest' from due having count(*)>0;
 end loop;
 delete from public.community_rate_limits where window_at<now()-interval '7 days';
 return jsonb_build_object('published',n);
end $$;
revoke all on function public.community_maintenance() from public,anon,authenticated;
grant execute on function public.community_maintenance() to service_role;

create function public.community_review_pending(actor uuid,subject uuid,subject_type text,approve boolean,explanation text) returns jsonb language plpgsql security definer set search_path=public as $$
declare author_uuid uuid; parent_uuid uuid; begin
 if not public.community_enabled() or not public.community_is_admin(actor) then raise exception 'Admin access required' using errcode='42501'; end if;
 if length(explanation)<5 or length(explanation)>1000 then raise exception 'Explain the review decision' using errcode='22023'; end if;
 if subject_type='post' then
 update public.community_posts set moderation_status=case when approve then 'approved' else 'hidden' end where id=subject and moderation_status='pending' returning author_id into author_uuid;
 if author_uuid is null then raise exception 'Pending post unavailable'; end if;
 if approve then perform public.community_publish(subject); end if;
 elsif subject_type='comment' then
 update public.community_comments set moderation_status=case when approve then 'approved' else 'hidden' end where id=subject and moderation_status='pending' returning author_id,post_id into author_uuid,parent_uuid;
 if author_uuid is null then raise exception 'Pending comment unavailable'; end if;
 if approve then perform public.community_notify(author_uuid,(select author_id from public.community_posts where id=parent_uuid),'replies',subject,'Someone commented on your community post.'); end if;
 else raise exception 'Invalid review subject'; end if;
 insert into public.community_moderation_actions(moderator_id,action,reason) values(actor,case when approve then 'approve' else 'hide' end,subject_type||' '||subject::text||': '||explanation);
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.community_review_pending(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.community_review_pending(uuid,uuid,text,boolean,text) to service_role;

$migration$;
insert into ita_internal.migrations(name,sha256) values('031_community_commands.sql','8d0fc9e6a5609096e8c76a8d80321c754b64f153930065a6cc182dd5985334cb');
end if; end $checkpoint$;
commit;
notify pgrst,'reload schema';
select (select count(*) from ita_internal.migrations) as applied_migrations,(select count(*) from pg_tables where schemaname='public') as public_tables,(select count(*) from pg_tables where schemaname='public' and not rowsecurity) as tables_without_rls,(select is_enabled from public.feature_flags where flag_name='community_v1') as community_enabled;
