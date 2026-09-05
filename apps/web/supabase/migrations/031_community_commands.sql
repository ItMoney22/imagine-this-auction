-- Server-only community transactions. Manual application after 030.
begin;
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
commit;
