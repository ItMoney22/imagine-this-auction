begin;
create table public.community_conversations (
 id uuid primary key default gen_random_uuid(),person_a uuid not null references users(id) on delete cascade,person_b uuid not null references users(id) on delete cascade,
 house_id uuid references auctioneers(id) on delete cascade,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(person_a<person_b),unique(person_a,person_b)
);
create table public.community_conversation_members (
 conversation_id uuid references community_conversations(id) on delete cascade,user_id uuid references users(id) on delete cascade,last_read_at timestamptz not null default now(),primary key(conversation_id,user_id)
);
create table public.community_messages (
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references community_conversations(id) on delete cascade,
 author_id uuid not null references users(id) on delete cascade,body text not null check(length(body) between 1 and 4000),
 moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','hidden')),created_at timestamptz not null default now()
);
create index community_messages_recent on community_messages(conversation_id,created_at desc);
create table public.community_message_media(message_id uuid references community_messages(id) on delete cascade,media_id uuid references community_media(id) on delete cascade,primary key(message_id,media_id));
create table public.community_message_reports (
 id uuid primary key default gen_random_uuid(),message_id uuid not null references community_messages(id) on delete cascade,
 reporter_id uuid not null references users(id) on delete cascade,reason text not null check(length(reason) between 5 and 2000),reviewed boolean not null default false,created_at timestamptz not null default now()
);
create function public.community_conversation_visible(viewer uuid,subject uuid) returns boolean language sql stable security definer set search_path=public as $$
 select community_enabled() and exists(select 1 from community_conversations c where c.id=subject and viewer in(c.person_a,c.person_b) and community_active(c.person_a) and community_active(c.person_b) and not community_blocked(c.person_a,c.person_b))
$$;
create function public.community_view_conversation(subject uuid) returns boolean language sql stable security definer set search_path=public as $$ select community_conversation_visible(auth.uid(),subject) $$;
create function public.community_message_allowed(sender uuid,recipient uuid,house uuid) returns boolean language sql stable security definer set search_path=public as $$
 select sender<>recipient and community_active(sender) and community_active(recipient) and not community_blocked(sender,recipient)
 and exists(select 1 from community_profiles p where p.user_id=recipient and p.dm_policy<>'closed' and (
 p.dm_policy='open' or (house is not null and (community_manages(sender,house) or community_manages(recipient,house))) or
 (exists(select 1 from community_follows where follower_id=sender and target_type='user' and target_id=recipient) and exists(select 1 from community_follows where follower_id=recipient and target_type='user' and target_id=sender))
 ))
$$;
revoke all on function public.community_conversation_visible(uuid,uuid),public.community_message_allowed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.community_conversation_visible(uuid,uuid),public.community_message_allowed(uuid,uuid,uuid) to service_role;
revoke all on function public.community_view_conversation(uuid) from public;
grant execute on function public.community_view_conversation(uuid) to authenticated,service_role;
alter table community_conversations enable row level security;
alter table community_conversation_members enable row level security;
alter table community_messages enable row level security;
alter table community_message_media enable row level security;
alter table community_message_reports enable row level security;
revoke all on community_conversations,community_conversation_members,community_messages,community_message_media,community_message_reports from anon,authenticated;
grant select on community_conversations,community_conversation_members,community_messages,community_message_media to authenticated;
grant all on community_conversations,community_conversation_members,community_messages,community_message_media,community_message_reports to service_role;
create policy conversations_read on community_conversations for select using(community_view_conversation(id));
create policy conversation_members_read on community_conversation_members for select using(community_view_conversation(conversation_id));
create policy messages_read on community_messages for select using(community_view_conversation(conversation_id) and (moderation_status='approved' or author_id=auth.uid()));
create policy message_media_read on community_message_media for select using(exists(select 1 from community_messages where id=message_id));
create function public.community_message(actor uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare c community_conversations;m community_messages;recipient uuid;house_uuid uuid;ident uuid;media_uuid uuid;approval text;begin
 if not community_enabled() or not community_active(actor) then raise exception 'Community access restricted' using errcode='42501'; end if;
 if operation='start' then
  recipient:=(payload->>'recipient_id')::uuid;house_uuid:=(payload->>'house_id')::uuid;
  if house_uuid is not null and not (community_manages(actor,house_uuid) or community_manages(recipient,house_uuid)) then raise exception 'House unavailable'; end if;
  if not community_message_allowed(actor,recipient,house_uuid) then raise exception 'This member accepts messages only according to their privacy settings'; end if;
  insert into community_conversations(person_a,person_b,house_id) values(least(actor,recipient),greatest(actor,recipient),house_uuid) on conflict(person_a,person_b) do update set updated_at=community_conversations.updated_at returning * into c;
  insert into community_conversation_members(conversation_id,user_id) values(c.id,actor),(c.id,recipient) on conflict do nothing;
  return jsonb_build_object('id',c.id);
 end if;
 if operation in ('hide','report') then
  select * into m from community_messages where id=(payload->>'id')::uuid;
  select * into c from community_conversations where id=m.conversation_id;
 else select * into c from community_conversations where id=(payload->>'id')::uuid; end if;
 if c.id is null or not community_conversation_visible(actor,c.id) then raise exception 'Conversation unavailable' using errcode='42501'; end if;
 recipient:=case when c.person_a=actor then c.person_b else c.person_a end;
 if operation='send' then
  if not community_message_allowed(actor,recipient,c.house_id) then raise exception 'This member is not accepting messages from you'; end if;
  approval:=case when payload->>'moderation_status'='approved' then 'approved' else 'pending' end;
  insert into community_messages(conversation_id,author_id,body,moderation_status) values(c.id,actor,payload->>'body',approval) returning id into ident;
  if jsonb_array_length(payload->'media_ids')>4 then raise exception 'Choose up to four photos'; end if;
  for media_uuid in select value::uuid from jsonb_array_elements_text(payload->'media_ids') loop
   if not exists(select 1 from community_media where id=media_uuid and owner_id=actor and moderation_status='approved' and post_id is null) then raise exception 'Photo unavailable'; end if;
   insert into community_message_media(message_id,media_id) values(ident,media_uuid);
  end loop;
  update community_conversations set updated_at=now() where id=c.id;
  if approval='approved' then perform community_notify(actor,recipient,'replies',ident,'You have a new private message. /messages/'||c.id::text); end if;
 elsif operation='read' then
  update community_conversation_members set last_read_at=now() where conversation_id=c.id and user_id=actor;ident:=c.id;
 elsif operation='hide' then
  if m.author_id<>actor then raise exception 'Only the sender can remove a message'; end if;
  update community_messages set moderation_status='hidden' where id=m.id;ident:=m.id;
 elsif operation='report' then
  if m.moderation_status<>'approved' and m.author_id<>actor then raise exception 'Message unavailable'; end if;
  insert into community_message_reports(message_id,reporter_id,reason) values(m.id,actor,payload->>'reason') returning id into ident;
 else raise exception 'Invalid message operation'; end if;
 return jsonb_build_object('id',ident,'moderation_status',approval);
end $$;
revoke all on function public.community_message(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.community_message(uuid,text,jsonb) to service_role;
create function public.community_review_message(actor uuid,report_id uuid,approve boolean,reason text) returns jsonb language plpgsql security definer set search_path=public as $$
declare subject uuid;m community_messages;c community_conversations;begin
 if not community_enabled() or not community_is_admin(actor) then raise exception 'Admin access required'; end if;
 if length(reason) not between 5 and 1000 then raise exception 'Explain the decision'; end if;
 select message_id into subject from community_message_reports where id=report_id and not reviewed for update;
 if subject is null then raise exception 'Open report unavailable'; end if;
 select * into m from community_messages where id=subject for update;
 select * into c from community_conversations where id=m.conversation_id;
 update community_messages set moderation_status=case when approve then 'approved' else 'hidden' end where id=subject;
 update community_message_reports set reviewed=true where id=report_id;
 insert into community_moderation_actions(moderator_id,action,reason) values(actor,'message-review',subject::text||': '||reason);
 if approve and m.moderation_status='pending' then perform community_notify(m.author_id,case when m.author_id=c.person_a then c.person_b else c.person_a end,'replies',subject,'You have a new private message. /messages/'||c.id::text); end if;
 return '{"saved":true}';end $$;
revoke all on function public.community_review_message(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.community_review_message(uuid,uuid,boolean,text) to service_role;
alter publication supabase_realtime add table community_messages,community_conversation_members,community_conversations;
notify pgrst,'reload schema';
commit;
