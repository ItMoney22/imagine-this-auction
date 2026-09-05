begin;
create table if not exists public.community_auction_updates (
 id uuid primary key default gen_random_uuid(), auction_id uuid not null references public.auctions(id) on delete cascade,
 kind text not null check(kind in ('catalog','soon','live','closing','recap')),
 created_at timestamptz not null default now(), unique(auction_id,kind)
);
alter table public.community_auction_updates enable row level security;
revoke all on public.community_auction_updates from anon,authenticated;
grant all on public.community_auction_updates to service_role;
create or replace function public.community_auction_announcements() returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; recipient record; event_uuid uuid; post_uuid uuid; message_text text; processed integer:=0; sold_count integer; top_price integer; begin
 if not public.community_enabled() then return '{"enabled":false}'; end if;
 for item in
  select a.id,a.auctioneer_id,h.owner_id,h.auto_posts,k.kind
  from auctions a join community_houses h on h.id=a.auctioneer_id
  cross join lateral (values
   ('catalog',a.status in ('scheduled','live') and a.ends_at>now()),
   ('soon',a.status='scheduled' and a.starts_at>now() and a.starts_at<=now()+interval '15 minutes'),
   ('live',a.status='live' and a.ends_at>now()),
   ('closing',a.status in ('scheduled','live') and a.ends_at>now() and a.ends_at<=now()+interval '1 hour'),
   ('recap',a.status='ended' and a.ends_at>now()-interval '7 days')
  ) k(kind,due)
  where k.due and h.is_approved and public.community_active(h.owner_id)
  and not exists(select 1 from community_auction_updates u where u.auction_id=a.id and u.kind=k.kind)
  order by a.ends_at,a.id,k.kind limit 100
 loop
  insert into community_auction_updates(auction_id,kind) values(item.id,item.kind) on conflict do nothing returning id into event_uuid;
  if event_uuid is null then continue; end if;
  message_text:=case item.kind when 'catalog' then 'The catalog is ready. Explore the auction and find your next favorite.' when 'soon' then 'This auction starts within 15 minutes. Take a look before it begins.' when 'live' then 'This auction is live. Join in and see what catches your eye.' when 'closing' then 'This auction closes within an hour. Check the current end time on the auction page.' else 'Thanks for joining our auction.' end;
  if item.kind='recap' then
   select count(*)::integer,coalesce(max(hammer_price),0) into sold_count,top_price from lots where auction_id=item.id and is_sold;
   message_text:=format('Sale recap: %s lots sold. Top hammer price: $%s. Thanks for collecting with us!',sold_count,to_char(top_price/100.0,'FM9999999990.00'));
  end if;
  if item.auto_posts and exists(select 1 from community_profiles where user_id=item.owner_id) then
   insert into community_posts(author_id,house_id,body,auction_id,visibility,moderation_status,auto_key)
   values(item.owner_id,item.auctioneer_id,message_text,item.id,'public','approved',item.id::text||':'||item.kind)
   on conflict(auto_key) do nothing returning id into post_uuid;
   if post_uuid is not null then perform public.community_publish(post_uuid); end if;
  end if;
  for recipient in select distinct follower_id from community_follows
   where (target_type='house' and target_id=item.auctioneer_id) or (target_type='auction' and target_id=item.id)
  loop
   perform public.community_notify(item.owner_id,recipient.follower_id,'auctions',event_uuid,message_text||' /auctions/'||item.id::text);
  end loop;
  processed:=processed+1;
 end loop;
 return jsonb_build_object('auction_updates',processed);
end $$;
revoke all on function public.community_auction_announcements() from public,anon,authenticated;
grant execute on function public.community_auction_announcements() to service_role;
notify pgrst,'reload schema';
commit;
