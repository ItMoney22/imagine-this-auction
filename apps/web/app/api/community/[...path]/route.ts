import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { draftCommunityPost } from '@/lib/ai/draft'
import { createAdminClient, adminRpc } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { profileSchema, houseSchema, postSchema, followSchema, commentSchema, reactionSchema, reportSchema, blockSchema, preferenceSchema, moderationSchema, extractMentions, extractTags } from '@/lib/community/model'
import { CommunityError, context, noStore, failure, requireSameOrigin, readBody, takeRate, screen, command, loadFeed, hydratePosts } from '@/lib/community/server'

export const runtime = 'nodejs'
type RouteContext = { params: Promise<{ path: string[] }> }
const idSchema = z.string().uuid()

export async function GET(req: NextRequest, route: RouteContext) {
  try {
    const { path } = await route.params
    const params = req.nextUrl.searchParams
    if (path[0] === 'status') {
      const db = await createClient()
      const { data, error } = await (db as SupabaseClient).rpc('community_enabled')
      if (error) throw new CommunityError('Community is temporarily unavailable.', 503)
      return noStore({ enabled: data === true })
    }
    const { db, user } = await context()
    if (path[0] === 'identity-media') {
      const type = z.enum(['user', 'house']).parse(path[1]), id = idSchema.parse(path[2]), slot = z.enum(['avatar', 'banner']).parse(path[3])
      const result = type === 'user'
        ? await db.from('community_profiles').select('avatar_path,banner_path').eq('user_id', id).maybeSingle()
        : await db.from('community_houses').select('banner_path').eq('id', id).maybeSingle()
      if (result.error || !result.data) throw new CommunityError('Image unavailable.', 404)
      const imagePath = slot === 'banner' ? result.data.banner_path : ('avatar_path' in result.data ? result.data.avatar_path : null)
      if (typeof imagePath !== 'string') throw new CommunityError('Image unavailable.', 404)
      // RLS above authorizes the viewer on every request, including after a block.
      const admin: SupabaseClient = createAdminClient()
      const { data: file, error } = await admin.storage.from('community-media').download(imagePath)
      if (error || !file) throw new CommunityError('Image unavailable.', 404)
      return new Response(file, { headers: { 'Content-Type': file.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
    }
    if (path[0] === 'feed') return noStore(await loadFeed(db, user?.id, params))
    if (path[0] === 'me') {
      if (!user) return noStore({ user: null })
      const results = await Promise.all([
        db.from('community_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        db.from('auctioneers').select('id,company_name').eq('user_id', user.id).eq('is_approved', true),
        db.from('community_follows').select('target_type,target_id').eq('follower_id', user.id).limit(1000),
        db.from('community_notification_preferences').select('category,frequency').eq('user_id', user.id),
        db.from('users').select('role').eq('id', user.id).single(),
      ])
      if (results.some(r => r.error)) throw new Error('Could not load your community account')
      return noStore({ user: { id: user.id, role: results[4].data?.role }, profile: results[0].data, houses: results[1].data, follows: results[2].data, preferences: results[3].data })
    }
    if (path[0] === 'profiles') {
      let query = db.from('community_profiles').select('*')
      if (params.has('handle')) query = query.eq('handle', z.string().regex(/^[a-z0-9_]{3,30}$/).parse(params.get('handle')))
      else if (params.get('q')) query = query.ilike('display_name', `%${params.get('q')!.replace(/[%_]/g, '').slice(0, 80)}%`)
      const { data, error } = await query.order('created_at', { ascending: false }).limit(30)
      if (error) throw new Error('Could not load profiles')
      return noStore({ profiles: data })
    }
    if (path[0] === 'houses') {
      let query = db.from('community_houses').select('*')
      if (params.get('mine') === 'true') {
        if (!user) throw new CommunityError('Sign in to view house tools.', 401)
        query = query.eq('owner_id', user.id)
      }
      if (params.has('slug')) query = query.eq('slug', z.string().regex(/^[a-z0-9_]{3,30}$/).parse(params.get('slug')))
      if (params.get('q')) query = query.ilike('company_name', `%${params.get('q')!.replace(/[%_]/g, '').slice(0, 80)}%`)
      const { data, error } = await query.order('company_name').limit(30)
      if (error) throw new Error('Could not load houses')
      const { data: auctions, error: auctionError } = await db.from('auctions').select('id,title,auctioneer_id,starts_at,ends_at,status').in('auctioneer_id', (data ?? []).map(h => h.id)).in('status', ['live', 'scheduled']).order('starts_at').limit(40)
      if (auctionError) throw new Error('Could not load house auctions')
      return noStore({ houses: data, auctions })
    }
    if (path[0] === 'notifications') {
      if (!user) throw new CommunityError('Sign in to view notifications.', 401)
      const { data, error } = await db.from('community_notification_events').select('id,category,subject_id,created_at,notifications(id,title,message,is_read)').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error('Could not load notifications')
      return noStore({ notifications: data })
    }
    if (path[0] === 'scheduled') {
      if (!user) throw new CommunityError('Sign in to view your posts.', 401)
      const { data, error } = await db.from('community_posts').select('*').eq('author_id', user.id).is('published_at', null).neq('moderation_status', 'hidden').order('created_at', { ascending: false }).limit(50)
      if (error) throw new Error('Could not load scheduled posts')
      return noStore({ posts: await hydratePosts(db, data ?? []) })
    }
    if (path[0] === 'media' && path[1]) {
      const id = idSchema.parse(path[1])
      const { data, error } = await db.from('community_media').select('path,content_type').eq('id', id).maybeSingle()
      if (error || !data) throw new CommunityError('Photo unavailable.', 404)
      const { data: file, error: downloadError } = await db.storage.from('community-media').download(data.path)
      if (downloadError || !file) throw new CommunityError('Photo unavailable.', 404)
      return new Response(file, { headers: { 'Content-Type': data.content_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
    }
    if (path[0] === 'moderation') {
      if (!user) throw new CommunityError('Sign in to review reports.', 401)
      const { data: actor } = await db.from('users').select('role').eq('id', user.id).single()
      if (actor?.role !== 'admin') throw new CommunityError('Admin access required.', 403)
      const admin: SupabaseClient = createAdminClient()
      const [reports, posts, comments] = await Promise.all([
        admin.from('community_reports').select('*').eq('status', 'open').order('created_at').limit(100),
        admin.from('community_posts').select('id,body,author_id').eq('moderation_status', 'pending').order('created_at').limit(100),
        admin.from('community_comments').select('id,body,author_id').eq('moderation_status', 'pending').order('created_at').limit(100),
      ])
      if ([reports, posts, comments].some(r => r.error)) throw new Error('Could not load moderation queue')
      return noStore({ reports: reports.data, pendingPosts: posts.data, pendingComments: comments.data })
    }
    if (path[0] === 'export') {
      if (!user) throw new CommunityError('Sign in to download your data.', 401)
      await takeRate(user.id, 'export', 2, 3600)
      const tables = ['community_profiles', 'community_posts', 'community_comments', 'community_follows', 'community_blocks', 'community_mutes', 'community_notification_preferences']
      const columns = ['user_id', 'author_id', 'author_id', 'follower_id', 'user_id', 'user_id', 'user_id']
      const exportData: Record<string, unknown[]> = {}
      for (let i = 0; i < tables.length; i++) {
        const rows: unknown[] = []
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await db.from(tables[i]).select('*').eq(columns[i], user.id).range(offset, offset + 499)
          if (error) throw new Error('Could not export your data')
          rows.push(...data)
          if (data.length < 500) break
        }
        exportData[tables[i]] = rows
      }
      return new Response(JSON.stringify(exportData, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="ita-community-data.json"', 'Cache-Control': 'private, no-store' } })
    }
    throw new CommunityError('Community route not found.', 404)
  } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest, route: RouteContext) {
  try {
    requireSameOrigin(req)
    const { path } = await route.params
    const { db, user } = await context(true)
    const actor = user!.id
    await takeRate(actor, path[0], path[0] === 'posts' ? 10 : 30)
    if (path[0] === 'media') return await upload(req, actor)
    const raw = await readBody(req)
    if (path[0] === 'identity-media') {
      const values = z.object({ subject_type: z.enum(['user', 'house']), subject: idSchema, slot: z.enum(['avatar', 'banner']), media_id: idSchema.nullable() }).parse(raw)
      const { data, error } = await adminRpc('community_set_image', { actor, ...values })
      if (error) throw new CommunityError('Could not save this profile image.', 403)
      return noStore(data)
    }
    if (path[0] === 'draft') {
      const values = z.object({ mode: z.enum(['lot', 'shorter', 'hashtags']), text: z.string().trim().max(4000).default(''), lot_id: idSchema.nullable().optional() }).parse(raw)
      await takeRate(actor, 'ai-draft-hourly', 12, 3600)
      let lot: { title: string; description: string | null } | undefined
      if (values.mode === 'lot') {
        if (!values.lot_id) throw new CommunityError('Choose a lot first.')
        const { data, error } = await db.from('lots').select('title,description').eq('id', values.lot_id).maybeSingle()
        if (error || !data) throw new CommunityError('This lot is unavailable.', 404)
        lot = data
      } else if (!values.text) throw new CommunityError('Write some post text first.')
      if (await screen(values.text || lot!.title) !== 'approved') throw new CommunityError('This text needs review before AI drafting.', 422)
      const text = await draftCommunityPost({ mode: values.mode, text: values.text, lot })
      if (await screen(text) !== 'approved') throw new CommunityError('The suggestion needs review. Please write your own post.', 422)
      return noStore({ text })
    }
    if (path[0] === 'profiles' || path[0] === 'houses') {
      const values = path[0] === 'profiles' ? profileSchema.parse(raw) : houseSchema.parse(raw)
      if (await screen(JSON.stringify(values)) !== 'approved') throw new CommunityError('Profile moderation is temporarily unavailable or this content needs review. Please try again later.', 503)
      return noStore(await command(actor, path[0] === 'profiles' ? 'profile' : 'house', values))
    }
    if (path[0] === 'posts') {
      const values = postSchema.parse(raw)
      const moderation_status = await screen(values.body)
      return noStore(await command(actor, 'post', { ...values, moderation_status, tags: extractTags(values.body), mentions: extractMentions(values.body) }), 201)
    }
    if (path[0] === 'comments') {
      const values = commentSchema.parse(raw)
      return noStore(await command(actor, 'comment', { ...values, moderation_status: await screen(values.body) }), 201)
    }
    const commands = { follows: ['follow', followSchema], reactions: ['reaction', reactionSchema], reports: ['report', reportSchema], blocks: ['block', blockSchema], mutes: ['mute', blockSchema], preferences: ['preference', preferenceSchema], moderation: ['moderate', moderationSchema], 'hide-post': ['delete-post', z.object({ id: idSchema })] } as const
    if (path[0] in commands) {
      const [operation, schema] = commands[path[0] as keyof typeof commands]
      return noStore(await command(actor, operation, schema.parse(raw)))
    }
    if (path[0] === 'read-notification') {
      const { id } = z.object({ id: idSchema }).parse(raw)
      const { error } = await db.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', actor)
      if (error) throw new Error('Could not mark notification read')
      return noStore({ saved: true })
    }
    if (path[0] === 'review-pending') {
      const values = z.object({ id: idSchema, type: z.enum(['post', 'comment']), approve: z.boolean(), reason: z.string().trim().min(5).max(1000) }).parse(raw)
      const { data, error } = await adminRpc('community_review_pending', { actor, subject: values.id, subject_type: values.type, approve: values.approve, explanation: values.reason })
      if (error) throw new CommunityError('Could not review this content.', 403)
      return noStore(data)
    }
    throw new CommunityError('Community route not found.', 404)
  } catch (error) { return failure(error) }
}

async function upload(req: NextRequest, actor: string) {
  if (Number(req.headers.get('content-length')) > 10_500_000) throw new CommunityError('Photos must be under 10 MB.', 413)
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > 10_485_760) throw new CommunityError('Choose a photo under 10 MB.')
  const contentType = z.enum(['image/jpeg', 'image/png', 'image/webp']).parse(file.type)
  const alt = z.string().trim().max(200).parse(form.get('alt_text') ?? '')
  const bytes = Buffer.from(await file.arrayBuffer())
  const valid = contentType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'
  if (!valid) throw new CommunityError('The photo format does not match the file.')
  if (!process.env.OPENAI_API_KEY) throw new CommunityError('Photo moderation is temporarily unavailable.', 503)
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const moderation = await client.moderations.create({ model: 'omni-moderation-latest', input: [{ type: 'image_url', image_url: { url: `data:${contentType};base64,${bytes.toString('base64')}` } }, { type: 'text', text: alt || 'Auction community photo' }] })
  if (!moderation.results[0] || moderation.results[0].flagged) throw new CommunityError('This photo needs a safety review. Please choose a different image.')
  const id = crypto.randomUUID()
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType]
  const path = `${actor}/${id}.${extension}`
  const admin: SupabaseClient = createAdminClient()
  const { error: uploadError } = await admin.storage.from('community-media').upload(path, bytes, { contentType, upsert: false })
  if (uploadError) throw new Error('Could not upload photo')
  const { error } = await admin.from('community_media').insert({ id, owner_id: actor, path, content_type: contentType, bytes: bytes.length, alt_text: alt, moderation_status: 'approved' })
  if (error) { await admin.storage.from('community-media').remove([path]); throw new Error('Could not save photo') }
  return noStore({ id, url: `/api/community/media/${id}`, alt_text: alt }, 201)
}
