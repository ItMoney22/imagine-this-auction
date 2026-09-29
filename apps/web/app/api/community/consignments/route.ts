import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, adminRpc } from '@/lib/supabase/admin'
import { context, CommunityError, noStore, failure, requireSameOrigin, readBody, takeRate, screen } from '@/lib/community/server'

const id=z.string().uuid()
const schema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('location'),subject_id:id,latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}),
 z.object({operation:z.literal('create'),title:z.string().trim().min(3).max(120),description:z.string().trim().min(10).max(4000),category:z.string().trim().min(1).max(40),city:z.string().trim().min(1).max(80),region:z.string().trim().min(1).max(80),quantity:z.number().int().min(1).max(100000),timeframe:z.string().trim().min(1).max(200),visibility:z.enum(['all','local']),radius_miles:z.number().int().min(1).max(500),media_ids:z.array(id).max(10)}),
 z.object({operation:z.literal('offer'),id,house_id:id,kind:z.enum(['claim','quote']),commission_percent:z.number().min(0).max(100).nullable(),pickup_offer:z.boolean(),sale_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),message:z.string().trim().min(5).max(2000)}),
 z.object({operation:z.literal('accept'),id}),z.object({operation:z.literal('withdraw'),id}),z.object({operation:z.literal('withdraw-offer'),id}),
 z.object({operation:z.literal('intake'),id,status:z.enum(['received','catalogued','completed'])}),
 z.object({operation:z.literal('rate'),id,stars:z.number().int().min(1).max(5),body:z.string().trim().max(1000)}),
 z.object({operation:z.literal('review'),id,approve:z.boolean(),reason:z.string().trim().min(5).max(1000)}),
 z.object({operation:z.literal('report'),id,reason:z.string().trim().min(10).max(2000)}),
])
export async function GET(req:NextRequest){try{
 const {db:client,user}=await context(true);const db:SupabaseClient=client;const params=req.nextUrl.searchParams
 if(params.get('mode')==='moderation'){
  const {data:actor}=await db.from('users').select('role').eq('id',user!.id).single();if(actor?.role!=='admin')throw new CommunityError('Admin access required.',403)
  const admin:SupabaseClient=createAdminClient();const [pending,reports]=await Promise.all([admin.from('community_consignments').select('*').eq('moderation_status','pending').order('created_at').limit(100),admin.from('community_consignment_reports').select('*,request:community_consignments(title,description)').eq('reviewed',false).order('created_at').limit(100)])
  if(pending.error||reports.error)throw new Error('Could not load consignment moderation');return noStore({pending:pending.data,reports:reports.data})
 }
 if(params.get('mode')==='media'){
  const requestId=id.parse(params.get('id')),mediaId=id.parse(params.get('media_id'))
  const {data:link}=await db.from('community_consignment_media').select('media_id').eq('request_id',requestId).eq('media_id',mediaId).maybeSingle()
  if(!link)throw new CommunityError('Photo unavailable.',404)
  const admin:SupabaseClient=createAdminClient();const {data:media}=await admin.from('community_media').select('path,content_type').eq('id',mediaId).eq('moderation_status','approved').maybeSingle()
  if(!media)throw new CommunityError('Photo unavailable.',404)
  const {data:file,error}=await admin.storage.from('community-media').download(media.path);if(error||!file)throw new CommunityError('Photo unavailable.',404)
  return new Response(file,{headers:{'Content-Type':media.content_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
 }
 let query=db.from('community_consignments').select('*').order('created_at',{ascending:false}).limit(60)
 if(params.has('id'))query=query.eq('id',id.parse(params.get('id')))
 else if(params.get('mode')==='mine')query=query.eq('owner_id',user!.id)
 else query=query.neq('status','withdrawn')
 const {data:requests,error}=await query;if(error)throw new Error('Could not load consignments')
 const ids=(requests??[]).map(r=>r.id)
 const [offers,intakes,media,houses]=await Promise.all([
  db.from('community_consignment_offers').select('*,house:auctioneers(company_name)').in('request_id',ids).order('created_at'),
  db.from('community_consignment_intakes').select('*').in('request_id',ids),
  db.from('community_consignment_media').select('*').in('request_id',ids),
  db.from('auctioneers').select('id,company_name').eq('user_id',user!.id).eq('is_approved',true),
 ])
 if([offers,intakes,media,houses].some(r=>r.error))throw new Error('Could not load consignment details')
 return noStore({requests:(requests??[]).map(r=>({...r,offers:offers.data?.filter(o=>o.request_id===r.id),intake:intakes.data?.find(i=>i.request_id===r.id)??null,media:media.data?.filter(m=>m.request_id===r.id)})),houses:houses.data,userId:user!.id})
}catch(error){return failure(error)}}

export async function POST(req:NextRequest){try{
 requireSameOrigin(req);const {user}=await context(true);const values=schema.parse(await readBody(req))
 await takeRate(user!.id,'consignment:'+values.operation,values.operation==='create'?5:20,3600)
 let moderation_status='approved'
 if(values.operation==='create')moderation_status=await screen(values.title+'\n'+values.description)
 if(values.operation==='offer'){
  if(values.kind==='quote'&&values.commission_percent===null)throw new CommunityError('Include the commission percentage with a quote.')
  if(values.sale_date&&values.sale_date<new Date().toISOString().slice(0,10))throw new CommunityError('Choose a future expected sale date.')
  moderation_status=await screen(values.message)
 }
 if(values.operation==='rate')moderation_status=await screen(values.body||'Completed consignment rating')
 if(values.operation!=='create'&&moderation_status!=='approved')throw new CommunityError('This text needs review. Please revise it or try again later.',422)
 const {data,error}=await adminRpc('community_consign',{actor:user!.id,operation:values.operation,payload:{...values,moderation_status}})
 if(error){if(/unique|duplicate/i.test(error.message))throw new CommunityError('An offer or claim already exists. Refresh to see its current status.',409);throw new CommunityError(/required|unavailable|Only|before|outside|step|approved house|Complete/.test(error.message)?error.message:'Could not save this consignment action.',400)}
 return noStore({...(data as Record<string,unknown>),moderation_status})
}catch(error){return failure(error)}}
