import {NextRequest} from 'next/server'
import {z} from 'zod'
import type {SupabaseClient} from '@supabase/supabase-js'
import {createAdminClient,adminRpc} from '@/lib/supabase/admin'
import {context,CommunityError,noStore,failure,readBody,requireSameOrigin,takeRate,screen} from '@/lib/community/server'
const id=z.string().uuid()
const schema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('start'),recipient_id:id,house_id:id.nullable().default(null)}),
 z.object({operation:z.literal('send'),id,body:z.string().trim().min(1).max(4000),media_ids:z.array(id).max(4).default([])}),
 z.object({operation:z.literal('read'),id}),z.object({operation:z.literal('hide'),id}),
 z.object({operation:z.literal('report'),id,reason:z.string().trim().min(5).max(2000)}),
 z.object({operation:z.literal('review'),report_id:id,approve:z.boolean(),reason:z.string().trim().min(5).max(1000)}),
])
export async function GET(req:NextRequest){try{
 const {db:client,user}=await context(true);const db:SupabaseClient=client;const params=req.nextUrl.searchParams
 if(params.get('mode')==='moderation'){
  const {data:actor}=await db.from('users').select('role').eq('id',user!.id).single();if(actor?.role!=='admin')throw new CommunityError('Admin access required.',403)
  const admin:SupabaseClient=createAdminClient();const {data,error}=await admin.from('community_message_reports').select('id,reason,created_at,message:community_messages(id,body,moderation_status)').eq('reviewed',false).order('created_at').limit(100)
  if(error)throw new Error('Could not load reported messages');return noStore({reports:data})
 }
 if(params.get('mode')==='media'){
  const messageId=id.parse(params.get('message_id')),mediaId=id.parse(params.get('media_id'))
  const {data:link}=await db.from('community_message_media').select('media_id').eq('message_id',messageId).eq('media_id',mediaId).maybeSingle();if(!link)throw new CommunityError('Photo unavailable.',404)
  const admin:SupabaseClient=createAdminClient();const {data:media}=await admin.from('community_media').select('path,content_type').eq('id',mediaId).eq('moderation_status','approved').maybeSingle();if(!media)throw new CommunityError('Photo unavailable.',404)
  const {data:file,error}=await admin.storage.from('community-media').download(media.path);if(error||!file)throw new CommunityError('Photo unavailable.',404)
  return new Response(file,{headers:{'Content-Type':media.content_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
 }
 let query=db.from('community_conversations').select('*').order('updated_at',{ascending:false}).limit(50)
 if(params.has('id'))query=query.eq('id',id.parse(params.get('id')))
 const {data:conversations,error}=await query;if(error)throw new Error('Could not load conversations')
 const ids=(conversations??[]).map(c=>c.id),people=[...new Set((conversations??[]).flatMap(c=>[c.person_a,c.person_b]))]
 const [members,profiles]=await Promise.all([db.from('community_conversation_members').select('*').in('conversation_id',ids),db.from('community_profiles').select('user_id,display_name,handle').in('user_id',people)])
 if(members.error||profiles.error)throw new Error('Could not load conversation members')
 let messages:unknown[]=[];let next:string|null=null
 if(params.has('id')){
  const before=params.get('before')?.split('|')
  let q=db.from('community_messages').select('*').eq('conversation_id',id.parse(params.get('id'))).neq('moderation_status','hidden').order('created_at',{ascending:false}).order('id').limit(50)
  if(before){const at=z.string().datetime({offset:true}).parse(before[0]),key=id.parse(before[1]);q=q.or(`created_at.lt.${at},and(created_at.eq.${at},id.gt.${key})`)}
  const result=await q;if(result.error)throw new Error('Could not load messages')
  const {data:media,error:mediaError}=await db.from('community_message_media').select('*').in('message_id',(result.data??[]).map(m=>m.id));if(mediaError)throw new Error('Could not load message photos')
  messages=(result.data??[]).map(m=>({...m,media:media?.filter(p=>p.message_id===m.id)})).reverse()
  if(result.data?.length===50){const last=result.data[49];next=last.created_at+'|'+last.id}
 }
 const summaries=await Promise.all((conversations??[]).map(async c=>{
  const readAt=members.data?.find(m=>m.conversation_id===c.id&&m.user_id===user!.id)?.last_read_at??c.created_at
  const {count,error}=await db.from('community_messages').select('id',{count:'exact',head:true}).eq('conversation_id',c.id).neq('author_id',user!.id).eq('moderation_status','approved').gt('created_at',readAt)
  if(error)throw new Error('Could not load unread counts')
  return {...c,unread:count??0,other:profiles.data?.find(p=>p.user_id===(c.person_a===user!.id?c.person_b:c.person_a))??null,members:members.data?.filter(m=>m.conversation_id===c.id)}
 }))
 return noStore({conversations:summaries,messages,next,userId:user!.id})
}catch(error){return failure(error)}}
export async function POST(req:NextRequest){try{
 requireSameOrigin(req);const {user}=await context(true);const values=schema.parse(await readBody(req))
 await takeRate(user!.id,'message:'+values.operation,values.operation==='start'?10:values.operation==='read'?120:30,60)
 if(values.operation==='review'){
  const {data,error}=await adminRpc('community_review_message',{actor:user!.id,report_id:values.report_id,approve:values.approve,reason:values.reason});if(error)throw new CommunityError('Could not review this reported message.',403);return noStore(data)
 }
 const moderation_status=values.operation==='send'?await screen(values.body):'approved'
 const {data,error}=await adminRpc('community_message',{actor:user!.id,operation:values.operation,payload:{...values,moderation_status}})
 if(error)throw new CommunityError(/privacy settings|not accepting|unavailable|Only the sender/i.test(error.message)?error.message:'Could not save this message action.',403)
 return noStore(data)
}catch(error){return failure(error)}}
