-- Community phase 1. Apply manually AFTER launch migrations 019-026.
-- Public content is read through RLS. All writes go through validated server routes.
begin;
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
commit;

