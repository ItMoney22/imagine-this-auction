begin;
create or replace function public.community_set_image(actor uuid,subject_type text,subject uuid,slot text,media_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare image_path text; begin
 if not public.community_enabled() or not public.community_active(actor) then raise exception 'Community access restricted' using errcode='42501'; end if;
 if subject_type='user' then
  if subject<>actor or slot not in ('avatar','banner') or not exists(select 1 from community_profiles where user_id=actor) then raise exception 'Profile access required' using errcode='42501'; end if;
 elsif subject_type='house' then
  if slot<>'banner' or not public.community_manages(actor,subject) then raise exception 'House access required' using errcode='42501'; end if;
 else raise exception 'Invalid image target' using errcode='22023'; end if;
 if media_id is not null then
  select path into image_path from community_media where id=media_id and owner_id=actor and moderation_status='approved' and post_id is null for update;
  if image_path is null then raise exception 'Photos must belong to you and pass moderation' using errcode='22023'; end if;
 end if;
 if subject_type='house' then update community_houses set banner_path=image_path where id=subject;
 elsif slot='avatar' then update community_profiles set avatar_path=image_path,updated_at=now() where user_id=actor;
 else update community_profiles set banner_path=image_path,updated_at=now() where user_id=actor; end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.community_set_image(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.community_set_image(uuid,text,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
