import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminRpc, createAdminClient } from '@/lib/supabase/admin'
import { CommunityError, context, failure, noStore, readBody, requireSameOrigin, screen, takeRate } from '@/lib/community/server'

const id = z.string().uuid()
const schema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('ask'), lot_id: id, body: z.string().trim().min(1).max(2000), photo_request: z.boolean().default(false) }),
  z.object({ operation: z.literal('answer'), id, body: z.string().trim().min(1).max(4000), media_id: id.nullable().default(null) }),
  z.object({ operation: z.literal('pin'), id, active: z.boolean() }),
  z.object({ operation: z.literal('hide-question'), id }),
  z.object({ operation: z.literal('chat'), auction_id: id, body: z.string().trim().min(1).max(1000) }),
  z.object({ operation: z.literal('room-settings'), auction_id: id, slow_seconds: z.number().int().min(5).max(300), locked: z.boolean() }),
  z.object({ operation: z.literal('hide-message'), id }),
  z.object({ operation: z.literal('report'), id, type: z.enum(['question','message']), reason: z.string().trim().min(10).max(2000) }),
  z.object({ operation: z.literal('review'), id, type: z.enum(['question','message']), approve: z.boolean(), report_id: id.nullable().default(null), reason: z.string().trim().min(5).max(1000) }),
])

export async function GET(req: NextRequest) {
  try {
    const { db: client, user } = await context()
    const db: SupabaseClient = client
    const mode = req.nextUrl.searchParams.get('mode') ?? 'questions'
    if (mode === 'inbox') {
      if (!user) throw new CommunityError('Sign in to view questions.',401)
      const { data: houses, error: houseError } = await db.from('auctioneers').select('id').eq('user_id',user.id).eq('is_approved',true)
      if (houseError) throw new Error('Could not load your houses')
      const { data: rows, error } = await db.from('community_questions').select('id,body,photo_request,lot_id,created_at,lots!inner(title,auctions!inner(auctioneer_id))').in('lots.auctions.auctioneer_id',(houses??[]).map(h=>h.id)).eq('moderation_status','approved').is('answered_at',null).order('created_at').limit(100)
      if(error)throw new Error('Could not load unanswered questions')
      return noStore({questions:rows})
    }
    if (mode === 'moderation') {
      const { data: actor } = user ? await db.from('users').select('role').eq('id', user.id).single() : { data: null }
      if (actor?.role !== 'admin') throw new CommunityError('Admin access required.', 403)
      const admin: SupabaseClient = createAdminClient()
      const results = await Promise.all([
        admin.from('community_questions').select('*').eq('moderation_status','pending').order('created_at').limit(100),
        admin.from('community_room_messages').select('*').eq('moderation_status','pending').order('created_at').limit(100),
        admin.from('community_discussion_reports').select('*,question:community_questions(body),message:community_room_messages(body)').eq('reviewed',false).order('created_at').limit(100),
      ])
      if (results.some(r => r.error)) throw new Error('Could not load discussion moderation')
      return noStore({ questions: results[0].data, messages: results[1].data, reports: results[2].data })
    }
    if (mode === 'photo') {
      const questionId = id.parse(req.nextUrl.searchParams.get('id'))
      const { data: question } = await db.from('community_questions').select('media_id,moderation_status').eq('id',questionId).maybeSingle()
      if (!question?.media_id || question.moderation_status !== 'approved') throw new CommunityError('Photo unavailable.',404)
      const admin: SupabaseClient = createAdminClient()
      const { data: media } = await admin.from('community_media').select('path,content_type').eq('id',question.media_id).eq('moderation_status','approved').single()
      if (!media) throw new CommunityError('Photo unavailable.',404)
      const { data: file, error } = await admin.storage.from('community-media').download(media.path)
      if (error || !file) throw new CommunityError('Photo unavailable.',404)
      return new Response(file,{ headers:{'Content-Type':media.content_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'} })
    }
    let auctionId = req.nextUrl.searchParams.get('auction_id')
    const lotId = mode === 'questions' ? id.parse(req.nextUrl.searchParams.get('lot_id')) : null
    if (lotId) {
      const { data: lot } = await db.from('lots').select('auction_id').eq('id',lotId).maybeSingle()
      auctionId = lot?.auction_id
    }
    id.parse(auctionId)
    const { data: visible } = await db.rpc('community_view_auction',{ subject: auctionId })
    if (!visible) throw new CommunityError('Auction unavailable.',404)
    const [{ data: auction }, { data: canManage }, { data: actor }] = await Promise.all([
      db.from('auctions').select('id,title,status,starts_at,ends_at,auctioneer_id').eq('id',auctionId).single(),
      db.rpc('community_manage_auction',{ subject: auctionId }),
      user ? db.from('users').select('role').eq('id',user.id).single() : Promise.resolve({data:null}),
    ])
    const table = mode === 'questions' ? 'community_questions' : 'community_room_messages'
    let query = db.from(table).select('*').eq(lotId ? 'lot_id' : 'auction_id',lotId ?? auctionId).neq('moderation_status','hidden')
    if (lotId) query = query.order('pinned',{ascending:false})
    const { data: rows, error } = await query.order('created_at',{ascending:false}).limit(100)
    if (error) throw new Error('Could not load the discussion')
    const authorIds = [...new Set((rows ?? []).map(r => lotId ? r.asker_id : r.author_id))]
    const { data: profiles } = await db.from('community_profiles').select('user_id,handle,display_name').in('user_id',authorIds)
    const admin: SupabaseClient = createAdminClient()
    const [{data: staff},{data: house},{data: mutes}] = await Promise.all([
      admin.from('house_members').select('user_id').eq('auctioneer_id',auction?.auctioneer_id).in('user_id',authorIds),
      db.from('auctioneers').select('user_id').eq('id',auction?.auctioneer_id).maybeSingle(),
      user ? db.from('community_mutes').select('target_id').eq('user_id',user.id) : Promise.resolve({data:[]}),
    ])
    const { data: settings } = await db.from('community_room_settings').select('*').eq('auction_id',auctionId).maybeSingle()
    return noStore({ rows:(rows ?? []).filter(r=>!mutes?.some(m=>m.target_id===(lotId?r.asker_id:r.author_id))).map(r => ({...r,is_house_staff:house?.user_id===(lotId?r.asker_id:r.author_id)||staff?.some(s=>s.user_id===(lotId?r.asker_id:r.author_id)),profile:profiles?.find(p => p.user_id === (lotId ? r.asker_id : r.author_id)) ?? null})), auction, settings:settings ?? {slow_seconds:5,locked:false}, canManage:!!canManage || actor?.role === 'admin', userId:user?.id ?? null })
  } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req)
    const { user } = await context(true)
    const values = schema.parse(await readBody(req))
    await takeRate(user!.id,'discussion:'+values.operation,values.operation === 'ask' ? 5 : 20,60)
    if (values.operation === 'review') {
      const result = await adminRpc('community_review_discussion',{actor:user!.id,kind:values.type,subject:values.id,approve:values.approve,report_id:values.report_id,reason:values.reason})
      if (result.error) throw new CommunityError('Could not review this discussion.',403)
      return noStore(result.data)
    }
    const moderation_status = 'body' in values ? await screen(values.body) : 'approved'
    if (values.operation === 'answer' && moderation_status !== 'approved') throw new CommunityError('The answer needs review. Please revise it or try again later.',422)
    const { data, error } = await adminRpc('community_discuss',{actor:user!.id,operation:values.operation,payload:{...values,moderation_status}})
    if (error) {
      if (/Slow mode|Chat opens|paused chat|access required|unavailable|Photo unavailable/i.test(error.message)) throw new CommunityError(error.message,403)
      throw new Error('Discussion transaction failed')
    }
    return noStore(data)
  } catch (error) { return failure(error) }
}
