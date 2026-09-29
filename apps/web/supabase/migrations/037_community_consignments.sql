begin;
create table public.community_locations (
 subject_id uuid primary key, owner_id uuid not null references users(id) on delete cascade,
 latitude numeric not null check(latitude between -90 and 90), longitude numeric not null check(longitude between -180 and 180), updated_at timestamptz not null default now()
);
create table public.community_consignments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references users(id) on delete cascade,
 title text not null check(length(title) between 3 and 120), description text not null check(length(description) between 10 and 4000),
 category text not null, city text not null, region text not null, quantity integer not null check(quantity between 1 and 100000), timeframe text not null,
 visibility text not null check(visibility in ('all','local')), radius_miles integer not null default 25 check(radius_miles between 1 and 500),
 status text not null default 'open' check(status in ('open','matched','withdrawn','completed')),
 moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','hidden')),
 created_at timestamptz not null default now()
);
create table public.community_consignment_media (
 request_id uuid references community_consignments(id) on delete cascade,media_id uuid references community_media(id) on delete cascade,primary key(request_id,media_id)
);
create table public.community_consignment_offers (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references community_consignments(id) on delete cascade,
 house_id uuid not null references auctioneers(id) on delete cascade, kind text not null check(kind in ('claim','quote')),
 commission_percent numeric check(commission_percent between 0 and 100), pickup_offer boolean not null default false, sale_date date,
 message text not null check(length(message) between 5 and 2000), status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn')),
 created_at timestamptz not null default now(), unique(request_id,house_id)
);
create unique index one_pending_consignment_claim on community_consignment_offers(request_id) where kind='claim' and status='pending';
create table public.community_consignment_intakes (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references community_consignments(id) on delete cascade,
 offer_id uuid not null unique references community_consignment_offers(id),status text not null default 'planned' check(status in ('planned','received','catalogued','completed')),
 created_at timestamptz not null default now()
);
create table public.community_consignment_ratings (
 intake_id uuid references community_consignment_intakes(id) on delete cascade,author_id uuid references users(id) on delete cascade,
 stars integer not null check(stars between 1 and 5),body text not null check(length(body)<=1000),created_at timestamptz not null default now(),primary key(intake_id,author_id)
);
create table public.community_consignment_reports (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references community_consignments(id) on delete cascade,
 reporter_id uuid not null references users(id) on delete cascade,reason text not null check(length(reason) between 10 and 2000),reviewed boolean not null default false,created_at timestamptz not null default now()
);
create function public.community_distance(a numeric,b numeric,c numeric,d numeric) returns double precision language sql immutable as $$
 select 3958.8*2*asin(sqrt(least(1.0,power(sin(radians((c-a)::double precision)/2),2)+cos(radians(a::double precision))*cos(radians(c::double precision))*power(sin(radians((d-b)::double precision)/2),2))))
$$;
create function public.community_consignment_visible(viewer uuid,subject uuid) returns boolean language sql stable security definer set search_path=public as $$
 select community_enabled() and exists(select 1 from community_consignments r where r.id=subject and community_active(r.owner_id) and not community_blocked(viewer,r.owner_id) and (
 r.owner_id=viewer or community_is_admin(viewer) or (r.moderation_status='approved' and exists(select 1 from auctioneers h where h.is_approved and community_manages(viewer,h.id) and (
 exists(select 1 from community_consignment_offers o where o.request_id=r.id and o.house_id=h.id and o.status='accepted') or (r.status='open' and (r.visibility='all' or exists(select 1 from community_locations origin join community_locations dest on dest.subject_id=h.id where origin.subject_id=r.owner_id and community_distance(origin.latitude,origin.longitude,dest.latitude,dest.longitude)<=r.radius_miles)))
 )))))
$$;
create function public.community_view_consignment(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select community_consignment_visible(auth.uid(),subject) $$;
create function public.community_manage_house(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select community_manages(auth.uid(),subject) $$;
revoke all on function public.community_manage_house(uuid) from public;
grant execute on function public.community_manage_house(uuid) to authenticated,service_role;
revoke all on function public.community_consignment_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.community_consignment_visible(uuid,uuid) to service_role;
revoke all on function public.community_view_consignment(uuid) from public;
grant execute on function public.community_view_consignment(uuid) to authenticated,service_role;
do $$ declare t text; begin foreach t in array array['community_locations','community_consignments','community_consignment_media','community_consignment_offers','community_consignment_intakes','community_consignment_ratings','community_consignment_reports'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
grant select on community_consignments,community_consignment_media,community_consignment_offers,community_consignment_intakes,community_consignment_ratings to authenticated;
create policy consignment_read on community_consignments for select using(community_view_consignment(id));
create policy consignment_media_read on community_consignment_media for select using(community_view_consignment(request_id));
create policy consignment_offer_read on community_consignment_offers for select using(community_view_consignment(request_id) and (community_manage_house(house_id) or exists(select 1 from community_consignments where id=request_id and owner_id=auth.uid()) or community_admin()));
create policy consignment_intake_read on community_consignment_intakes for select using(community_view_consignment(request_id));
create policy consignment_rating_read on community_consignment_ratings for select using(exists(select 1 from community_consignment_intakes i where i.id=intake_id and community_view_consignment(i.request_id)));

create function public.community_consign(actor uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare ident uuid; subject uuid; house_uuid uuid; r community_consignments; o community_consignment_offers; i community_consignment_intakes; media_uuid uuid; begin
 if not community_enabled() or not community_active(actor) or not exists(select 1 from users where id=actor) then raise exception 'Community access restricted' using errcode='42501'; end if;
 if operation='location' then
  subject:=(payload->>'subject_id')::uuid;
  if subject<>actor and not community_manages(actor,subject) then raise exception 'Location access required'; end if;
  insert into community_locations(subject_id,owner_id,latitude,longitude) values(subject,actor,round((payload->>'latitude')::numeric,2),round((payload->>'longitude')::numeric,2)) on conflict(subject_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,updated_at=now();return '{"saved":true}';
 elsif operation='create' then
  if payload->>'visibility'='local' and not exists(select 1 from community_locations where subject_id=actor) then raise exception 'Set your approximate location before choosing local houses'; end if;
  insert into community_consignments(owner_id,title,description,category,city,region,quantity,timeframe,visibility,radius_miles,moderation_status) values(actor,payload->>'title',payload->>'description',payload->>'category',payload->>'city',payload->>'region',(payload->>'quantity')::integer,payload->>'timeframe',payload->>'visibility',(payload->>'radius_miles')::integer,case when payload->>'moderation_status'='approved' then 'approved' else 'pending' end) returning id into ident;
  if jsonb_array_length(payload->'media_ids')>10 then raise exception 'Choose up to ten photos'; end if;
  for media_uuid in select value::uuid from jsonb_array_elements_text(payload->'media_ids') loop
   if not exists(select 1 from community_media where id=media_uuid and owner_id=actor and moderation_status='approved' and post_id is null) then raise exception 'Photo unavailable'; end if;
   insert into community_consignment_media(request_id,media_id) values(ident,media_uuid);
  end loop;
  return jsonb_build_object('id',ident);
 end if;
 subject:=(payload->>'id')::uuid;
 if operation in ('accept','withdraw-offer') then
  select * into o from community_consignment_offers where id=subject;
  subject:=o.request_id;
 elsif operation in ('intake','rate') then
  select * into i from community_consignment_intakes where id=subject;
  select * into o from community_consignment_offers where id=i.offer_id;
  subject:=i.request_id;
 end if;
 select * into r from community_consignments where id=subject for update;
 if r.id is null or not community_consignment_visible(actor,r.id) then raise exception 'Consignment unavailable' using errcode='42501'; end if;
 if operation='offer' then
  house_uuid:=(payload->>'house_id')::uuid;
  if r.status<>'open' or r.moderation_status<>'approved' or r.owner_id=actor or not community_manages(actor,house_uuid) then raise exception 'An approved house can offer on an open request'; end if;
  if r.visibility='local' and not exists(select 1 from community_locations origin join community_locations dest on dest.subject_id=house_uuid where origin.subject_id=r.owner_id and community_distance(origin.latitude,origin.longitude,dest.latitude,dest.longitude)<=r.radius_miles) then raise exception 'This house is outside the requested radius'; end if;
  if payload->>'moderation_status'<>'approved' then raise exception 'Offer needs moderation approval'; end if;
  insert into community_consignment_offers(request_id,house_id,kind,commission_percent,pickup_offer,sale_date,message) values(r.id,house_uuid,payload->>'kind',(payload->>'commission_percent')::numeric,(payload->>'pickup_offer')::boolean,(payload->>'sale_date')::date,payload->>'message') returning id into ident;
  perform community_notify(actor,r.owner_id,'replies',ident,'An auction house responded to your consignment. /consign/'||r.id::text);
 elsif operation='accept' then
  if r.owner_id<>actor or r.status<>'open' or o.status<>'pending' then raise exception 'Only the consignor can accept a pending offer on an open request'; end if;
  if not exists(select 1 from auctioneers where id=o.house_id and is_approved and community_active(user_id) and not community_blocked(actor,user_id)) then raise exception 'House unavailable'; end if;
  update community_consignments set status='matched' where id=r.id;
  update community_consignment_offers set status=case when id=o.id then 'accepted' else 'declined' end where request_id=r.id and status='pending';
  insert into community_consignment_intakes(request_id,offer_id) values(r.id,o.id) returning id into ident;
  perform community_notify(actor,(select user_id from auctioneers where id=o.house_id),'replies',ident,'Your consignment offer was accepted. /consign/'||r.id::text);
 elsif operation='withdraw' then
  if r.owner_id<>actor or r.status<>'open' then raise exception 'Only an open request can be withdrawn by its owner'; end if;
  update community_consignments set status='withdrawn' where id=r.id;update community_consignment_offers set status='declined' where request_id=r.id and status='pending';ident:=r.id;
 elsif operation='withdraw-offer' then
  if not community_manages(actor,o.house_id) or o.status<>'pending' then raise exception 'Only a pending house offer can be withdrawn'; end if;
  update community_consignment_offers set status='withdrawn' where id=o.id;ident:=o.id;
 elsif operation='intake' then
  if not community_manages(actor,o.house_id) or r.status not in ('matched','completed') then raise exception 'Intake access required'; end if;
  if (case payload->>'status' when 'planned' then 0 when 'received' then 1 when 'catalogued' then 2 when 'completed' then 3 else -1 end) <> (case i.status when 'planned' then 0 when 'received' then 1 when 'catalogued' then 2 else 3 end)+1 then raise exception 'Advance the intake one step at a time'; end if;
  update community_consignment_intakes set status=payload->>'status' where id=i.id;
  if payload->>'status'='completed' then update community_consignments set status='completed' where id=r.id; end if;ident:=i.id;
 elsif operation='rate' then
  if i.status<>'completed' or (r.owner_id<>actor and not community_manages(actor,o.house_id)) then raise exception 'Complete the intake before rating'; end if;
  if payload->>'moderation_status'<>'approved' then raise exception 'Rating needs moderation approval'; end if;
  insert into community_consignment_ratings(intake_id,author_id,stars,body) values(i.id,actor,(payload->>'stars')::integer,payload->>'body');ident:=i.id;
 elsif operation='review' then
  if not community_is_admin(actor) then raise exception 'Admin access required'; end if;
  update community_consignments set moderation_status=case when (payload->>'approve')::boolean then 'approved' else 'hidden' end where id=r.id;
  update community_consignment_reports set reviewed=true where request_id=r.id;
  insert into community_moderation_actions(moderator_id,action,reason) values(actor,'consignment-review',r.id::text||': '||(payload->>'reason'));ident:=r.id;
 elsif operation='report' then
  insert into community_consignment_reports(request_id,reporter_id,reason) values(r.id,actor,payload->>'reason') returning id into ident;
 else raise exception 'Invalid consignment operation'; end if;
 return jsonb_build_object('id',ident);
end $$;
revoke all on function public.community_consign(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.community_consign(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
