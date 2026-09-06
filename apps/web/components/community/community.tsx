'use client'

import './community.css'
import { DiscussionModeration, QuestionInbox } from './discussions'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Heart, MessageCircle, Users, Compass, ShieldCheck, ImagePlus, ArrowUpRight, CalendarClock, Settings, Flag, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { type CommunityPost, type CommunityProfile, REACTIONS } from '@/lib/community/model'

const panel = 'rounded-3xl border border-indigo-100 bg-white/90 p-5 shadow-[0_12px_40px_rgba(79,70,229,0.05)] sm:p-6'
const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100'
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50'
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50'
type Me = { user: { id: string; role: string } | null; profile?: CommunityProfile | null; houses?: { id: string; company_name: string }[]; follows?: { target_type: string; target_id: string }[]; preferences?: { category: string; frequency: string }[] }
type House = { banner_path?: string | null; id: string; owner_id: string; slug: string; company_name: string; about: string; city: string; region: string; categories: string[]; is_approved: boolean; service_radius_miles: number; auto_posts: boolean }
type Auction = { id: string; auctioneer_id: string; title: string; starts_at: string; ends_at: string; status: string }

async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/community/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Please try again.')
  return result as T
}
function Busy({ label = 'Loading your community' }: { label?: string }) {
  return <div role="status" className="space-y-3 py-6"><p className="text-sm text-slate-600">{label}</p><div role="progressbar" aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-indigo-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-indigo-600 to-amber-400" /></div></div>
}
function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <p role={error ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${error ? 'bg-rose-50 text-rose-800' : 'bg-indigo-50 text-indigo-800'}`}>{children}</p> }
function Avatar({ name, userId, hasImage }: { name: string; userId?: string; hasImage?: boolean }) { if (userId && hasImage) return <img className="h-11 w-11 shrink-0 rounded-2xl object-cover" src={`/api/community/identity-media/user/${userId}/avatar`} alt={`${name} profile photo`} />; return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-100 font-semibold text-indigo-900" aria-hidden>{name.slice(0, 2).toUpperCase()}</span> }

export function Community({ view = 'feed', handle, slug }: { view?: 'feed' | 'explore' | 'profile' | 'house' | 'settings' | 'notifications' | 'org' | 'admin'; handle?: string; slug?: string }) {
  const [state, setState] = useState<'loading' | 'enabled' | 'disabled' | 'error'>('loading')
  const [me, setMe] = useState<Me>({ user: null })
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(n => n + 1), [])
  useEffect(() => {
    let cancelled = false
    api<{ enabled: boolean }>('status').then(async status => {
      if (!status.enabled) { if (!cancelled) setState('disabled'); return }
      const account = await api<Me>('me')
      if (!cancelled) { setMe(account); setState('enabled') }
    }).catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [revision])
  const titles = { feed: 'Your next great find starts here.', explore: 'Find your people. Follow your interests.', profile: 'Collector profile', house: 'Meet the auction house', settings: 'Make yourself at home.', notifications: 'Keep up with your community.', org: 'Bring collectors closer.', admin: 'Keep the community welcoming.' }
  return <div data-community className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">Imagine This · Community</p><h1 className="max-w-2xl font-serif text-3xl leading-tight text-slate-950 sm:text-5xl">{titles[view]}</h1><p className="mt-4 max-w-xl text-slate-600">Good finds. Familiar faces. A place to connect between auctions.</p></div><Link className={secondary} href="/auctions">Browse auctions <ArrowUpRight size={16} /></Link></header>
    {state === 'loading' ? <Busy /> : state === 'disabled' ? <section className={panel}><h2 className="text-xl font-semibold">Your collecting community is coming soon</h2><p className="mt-3 text-slate-600">We’re preparing profiles, house updates, and conversations. Explore the auctions while we get ready.</p></section> : state === 'error' ? <Notice error>We couldn’t load Community. <button className="underline" onClick={refresh}>Try again</button></Notice> :
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-28"><nav aria-label="Community" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col">
        {[['/feed','Your feed',Users],['/explore','Explore',Compass],['/notifications','Notifications',Bell],['/settings/community','Your profile',Settings],...(me.houses?.length ? [['/org/community','House studio',CalendarClock]] : []),...(me.user?.role === 'admin' ? [['/admin/community','Moderation',ShieldCheck]] : [])].map(([href,label,Icon]) => { const Mark = Icon as typeof Users; return <Link key={String(href)} href={String(href)} className="flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-800"><Mark size={19} />{String(label)}</Link> })}
      </nav><div className="mt-6 hidden rounded-2xl bg-indigo-950 p-5 text-white lg:block"><p className="font-serif text-xl">A shared love of the find.</p><p className="mt-3 text-sm leading-relaxed text-indigo-200">Share what caught your eye, learn from fellow collectors, and get to know the houses behind the hammer.</p><Link href="/settings/community" className="mt-5 inline-block text-sm font-semibold text-amber-300">Build your profile →</Link></div></aside>
      <div className="min-w-0 space-y-6">
        {view === 'feed' && <><Composer me={me} onSaved={refresh} /><Feed me={me} revision={revision} /></>}
        {view === 'explore' && <Discovery me={me} refresh={refresh} />}
        {(view === 'profile' || view === 'house') && <ProfilePage handle={handle} slug={slug} me={me} refresh={refresh} revision={revision} />}
        {view === 'settings' && <ProfileSettings me={me} refresh={refresh} />}
        {view === 'notifications' && <Notifications me={me} revision={revision} />}
        {view === 'org' && <><HouseStudio me={me} refresh={refresh} revision={revision} />{!!me.houses?.length && <QuestionInbox />}</>}
        {view === 'admin' && <><Moderation me={me} />{me.user?.role === 'admin' && <DiscussionModeration />}</>}
      </div>
    </div>}
  </div>
}

function Composer({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [body, setBody] = useState(''), [house, setHouse] = useState(''), [schedule, setSchedule] = useState(''), [lot, setLot] = useState(''), [auction, setAuction] = useState('')
  const [visibility, setVisibility] = useState('public'), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const [media, setMedia] = useState<{ id: string; url: string; alt_text: string }[]>([])
  const [drafting, setDrafting] = useState(false), [suggestion, setSuggestion] = useState('')
  if (!me.user) return <section className={panel}><h2 className="text-lg font-semibold">There’s a story behind every find.</h2><p className="my-3 text-slate-600">Sign in to follow your favorite houses and join the conversation.</p><Link href="/login" className={button}>Join the community</Link></section>
  if (!me.profile) return <section className={panel}><p className="mb-4 text-slate-700">Choose a handle to start sharing your finds.</p><Link href="/settings/community" className={button}>Create your profile</Link></section>
  async function publish(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const result = await api<{ moderation_status: string }>('posts', { body, house_id: house || null, media_ids: media.map(m => m.id), lot_id: lot || null, auction_id: auction || null, visibility, scheduled_at: schedule ? new Date(schedule).toISOString() : null })
      setBody(''); setMedia([]); setSchedule(''); setLot(''); setAuction(''); setMessage(result.moderation_status === 'pending' ? 'Your post is waiting for a moderation review.' : schedule ? 'Your post is scheduled.' : 'Your post is published.'); onSaved()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function draft(mode: 'lot' | 'shorter' | 'hashtags') {
    setDrafting(true); setError(''); setSuggestion('')
    try {
      const result = await api<{ text: string }>('draft', { mode, text: body, lot_id: lot || null })
      setSuggestion(mode === 'hashtags' ? `${body}\n\n${result.text}`.trim().slice(0, 4000) : result.text)
    } catch (err) { setError((err as Error).message) } finally { setDrafting(false) }
  }
  async function upload(files: FileList | null) {
    if (!files) return
    if (files.length + media.length > 10) { setError('Choose up to 10 photos.'); return }
    setUploading(true); setError('')
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.set('file', file); form.set('alt_text', '')
        const response = await fetch('/api/community/media', { method: 'POST', body: form })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Photo upload failed.')
        setMedia(current => [...current, result])
      }
    } catch (err) { setError((err as Error).message) } finally { setUploading(false) }
  }
  return <form onSubmit={publish} className={`${panel} space-y-4`} aria-label="Create a post">
    <div className="flex items-center gap-3"><Avatar name={me.profile.display_name} userId={me.profile.user_id} hasImage={!!me.profile.avatar_path} /><div><h2 className="font-semibold text-slate-900">Share a find or an update</h2><p className="text-xs text-slate-500">Posting as @{me.profile.handle}</p></div></div>
    {me.houses?.length ? <label className="block text-sm text-slate-700">Post as<select className={`${input} mt-1`} value={house} onChange={e => setHouse(e.target.value)}><option value="">Your collector profile</option>{me.houses.map(h => <option value={h.id} key={h.id}>{h.company_name}</option>)}</select></label> : null}
    <label className="sr-only" htmlFor="community-post-body">Post text</label><textarea id="community-post-body" required maxLength={4000} rows={4} className={`${input} resize-y border-slate-200 bg-slate-50/50`} placeholder="What caught your eye? Share a story, an upcoming sale, or a recent find…" value={body} onChange={e => setBody(e.target.value)} />
    <div className="flex flex-wrap gap-2" aria-label="AI writing help"><button type="button" className={secondary} disabled={drafting || busy || !lot} onClick={() => void draft('lot')}>Draft from lot</button><button type="button" className={secondary} disabled={drafting || busy || !body.trim()} onClick={() => void draft('shorter')}>Make shorter</button><button type="button" className={secondary} disabled={drafting || busy || !body.trim()} onClick={() => void draft('hashtags')}>Suggest hashtags</button></div>
    {drafting && <Busy label="Writing a suggestion for you to review" />}
    {suggestion && <section className="space-y-3 rounded-xl bg-indigo-50 p-4" aria-label="AI suggestion"><p className="text-xs font-semibold text-indigo-700">AI suggestion · check the facts before sharing</p><p className="whitespace-pre-wrap text-sm">{suggestion}</p><button type="button" className={secondary} onClick={() => { setBody(suggestion); setSuggestion('') }}>Use suggestion</button><button type="button" className="ml-3 text-sm underline" onClick={() => setSuggestion('')}>Dismiss</button></section>}
    {media.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{media.map(photo => <div key={photo.id} className="relative"><img className="aspect-square w-full rounded-xl object-cover" src={photo.url} alt={photo.alt_text || 'Photo attached to your post'} /><button type="button" aria-label="Remove photo" onClick={() => setMedia(current => current.filter(m => m.id !== photo.id))} className="absolute right-1 top-1 rounded-full bg-white p-2 text-slate-900"><X size={16} /></button></div>)}</div>}
    <details className="text-sm text-slate-600"><summary className="cursor-pointer py-2 font-medium">Schedule, audience & auction links</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><label>Publish time (your local time)<input aria-label="Publish time" type="datetime-local" className={`${input} mt-1`} value={schedule} onChange={e => setSchedule(e.target.value)} /></label><label>Audience<select className={`${input} mt-1`} value={visibility} onChange={e => setVisibility(e.target.value)}><option value="public">Everyone</option><option value="followers">Followers</option></select></label><label>Lot ID<input className={`${input} mt-1`} value={lot} onChange={e => setLot(e.target.value)} placeholder="From the lot’s page address" /></label><label>Auction ID<input className={`${input} mt-1`} value={auction} onChange={e => setAuction(e.target.value)} placeholder="From the auction’s page address" /></label></div></details>
    {uploading && <Busy label="Checking and uploading your photos" />}{busy && <Busy label="Preparing your post" />}{error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><label className={`${secondary} cursor-pointer`}><ImagePlus size={18} />Add photos<input className="sr-only" aria-label="Add photos" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} onChange={e => { void upload(e.target.files); e.target.value = '' }} /></label><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{body.length}/4,000</span><button className={button} disabled={busy || uploading || !body.trim()}>{schedule ? 'Schedule post' : 'Share post'}</button></div></div>
  </form>
}

function Feed({ me, revision, author, house }: { me: Me; revision: number; author?: string; house?: string }) {
  const [mode, setMode] = useState('for-you'), [posts, setPosts] = useState<CommunityPost[]>([]), [next, setNext] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState(''), [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    let cancelled = false; setBusy(true); setError('')
    const query = new URLSearchParams({ mode, ...(author ? { author } : {}), ...(house ? { house } : {}) })
    api<{ posts: CommunityPost[]; next: string | null }>(`feed?${query}`).then(data => { if (!cancelled) { setPosts(data.posts); setNext(data.next) } }).catch(err => { if (!cancelled) setError(err.message) }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [mode, author, house, revision, version])
  useEffect(() => {
    if (!me.user) return
    const client = createClient()
    const channel = client.channel(`community-feed-${me.user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'community_feed_items', filter: `user_id=eq.${me.user.id}` }, reload).subscribe()
    return () => { void client.removeChannel(channel) }
  }, [me.user?.id, reload])
  async function more() {
    if (!next || busy) return; setBusy(true)
    try { const data = await api<{ posts: CommunityPost[]; next: string | null }>(`feed?${new URLSearchParams({ mode, before: next, ...(author ? { author } : {}), ...(house ? { house } : {}) })}`); setPosts(current => [...new Map([...current, ...data.posts].map(p => [p.id, p])).values()]); setNext(data.next) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <section aria-label="Community feed" className="space-y-4"><div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-slate-900">From the community</h2><div className="flex rounded-xl border border-indigo-100 bg-white p-1">{[['for-you','For you'],['latest','Latest']].map(([value,label]) => <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${mode === value ? 'bg-indigo-100 text-indigo-900' : 'text-slate-600'}`}>{label}</button>)}</div></div>
    {error && <Notice error>{error} <button className="underline" onClick={reload}>Try again</button></Notice>}
    {!busy && !error && !posts.length && <div className={`${panel} py-12 text-center`}><Users className="mx-auto mb-4 text-indigo-400" size={30} /><h3 className="font-serif text-2xl text-slate-900">Room for your first discovery.</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">Follow a house, introduce yourself, or share a find. The conversation starts with you.</p><Link className={`${secondary} mt-5`} href="/explore">Explore the community</Link></div>}
    {posts.map(post => <PostCard key={post.id} post={post} me={me} refresh={reload} />)}{busy && <Busy />}{next && !busy && <button className={`${secondary} w-full`} onClick={more}>Load more posts</button>}
  </section>
}

function PostCard({ post, me, refresh }: { post: CommunityPost; me: Me; refresh: () => void }) {
  const [comment, setComment] = useState(''), [replyTo, setReplyTo] = useState<string | null>(null), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const name = post.house?.company_name ?? post.profile?.display_name ?? 'Community member'
  async function act(path: string, values: unknown) { setBusy(true); setError(''); try { await api(path, values); setComment(''); setReplyTo(null); setReason(''); refresh() } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  const mine = post.reactions?.find(r => r.user_id === me.user?.id)
  return <article className={`${panel} space-y-4`}>
    <header className="flex items-center gap-3"><Avatar name={name} /><div className="min-w-0 flex-1">{post.house || post.profile ? <Link className="font-semibold text-slate-900 hover:text-indigo-700" href={post.house ? `/h/${post.house.slug}` : `/u/${post.profile!.handle}`}>{name}</Link> : <span className="font-semibold">{name}</span>}<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">{post.house?.is_approved && <span className="inline-flex items-center gap-1 text-indigo-700"><ShieldCheck size={13} />Reviewed and licensed</span>}<time dateTime={post.published_at ?? post.scheduled_at ?? ''}>{post.published_at ? new Date(post.published_at).toLocaleString() : post.moderation_status === 'pending' ? 'Awaiting review' : 'Scheduled'}</time></div></div></header>
    <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{post.body}</p>
    {!!post.media?.length && <div className={`grid gap-2 ${post.media.length > 1 ? 'grid-cols-2' : ''}`}>{post.media.map(photo => <img key={photo.id} src={photo.url} alt={photo.alt_text || `Photo shared by ${name}`} loading="lazy" className="max-h-[480px] w-full rounded-2xl object-cover" />)}</div>}
    {post.lot && <Link href={`/lots/${post.lot.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">On the auction block</p><p className="mt-1 font-semibold text-slate-900">{post.lot.title}</p><p className="mt-1 text-sm text-slate-600">Current bid {(post.lot.current_high_bid / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p></div><span className="text-sm font-semibold text-indigo-700">View & bid →</span></Link>}
    {post.auction && <Link href={`/auctions/${post.auction.id}`} className="block rounded-2xl bg-indigo-50 p-4"><p className="text-xs font-semibold uppercase text-indigo-600">{post.auction.status === 'live' ? 'Live now' : 'Auction'}</p><p className="mt-1 font-semibold text-indigo-950">{post.auction.title}</p><p className="mt-2 text-sm text-indigo-700">{new Date(post.auction.starts_at).toLocaleString()} · View auction →</p></Link>}
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">{REACTIONS.map(kind => <button key={kind} aria-label={`React ${kind}`} aria-pressed={mine?.kind === kind} disabled={!me.user || busy} onClick={() => act('reactions', { post_id: post.id, kind, active: mine?.kind !== kind })} className={`flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs capitalize ${mine?.kind === kind ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-50'}`}><Heart size={14} fill={mine?.kind === kind ? 'currentColor' : 'none'} />{kind}<span>{post.reactions?.filter(r => r.kind === kind).length || ''}</span></button>)}<span className="ml-auto flex items-center gap-1 text-xs text-slate-500"><MessageCircle size={15} />{post.comments?.length ?? 0}</span></div>
    {!!post.comments?.length && <div className="space-y-3">{post.comments.filter(c => !c.parent_id).map(c => <div key={c.id} className="rounded-xl bg-slate-50 p-3"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{c.body}</p>{me.user && <button disabled={busy} onClick={() => setReplyTo(c.id)} className="mt-1 min-h-9 text-xs font-semibold text-indigo-700">Reply</button>}{post.comments?.filter(reply => reply.parent_id === c.id).map(reply => <p key={reply.id} className="mt-2 whitespace-pre-wrap break-words border-l-2 border-indigo-200 pl-3 text-sm leading-6 text-slate-600">{reply.body}</p>)}</div>)}</div>}
    {me.user && <form onSubmit={e => { e.preventDefault(); void act('comments', { post_id: post.id, body: comment, parent_id: replyTo }) }} className="space-y-2">{replyTo && <p className="text-xs text-indigo-700">Replying to a comment <button type="button" onClick={() => setReplyTo(null)} className="underline">Cancel</button></p>}<div className="flex gap-2"><input aria-label="Write a comment" required maxLength={2000} className={input} placeholder="Add to the conversation…" value={comment} onChange={e => setComment(e.target.value)} /><button disabled={busy || !comment.trim()} className={secondary}>Reply</button></div></form>}
    {me.user && <details className="text-xs text-slate-500"><summary className="cursor-pointer py-2">Post options</summary><div className="mt-2 flex flex-wrap gap-2">{me.user.id !== post.author_id ? <><button className={secondary} disabled={busy} onClick={() => act('mutes', { target_id: post.author_id, active: true })}>Mute member</button><button className={secondary} disabled={busy} onClick={() => act('blocks', { target_id: post.author_id, active: true })}>Block member</button></> : <button className={secondary} disabled={busy} onClick={() => act('hide-post', { id: post.id })}>Hide my post</button>}</div><form onSubmit={e => { e.preventDefault(); void act('reports', { subject_type: 'post', subject_id: post.id, reason }) }} className="mt-3 flex gap-2"><input className={input} aria-label="Report reason" minLength={10} maxLength={2000} required placeholder="Describe the issue (at least 10 characters)" value={reason} onChange={e => setReason(e.target.value)} /><button className={secondary} disabled={busy}><Flag size={14} />Report</button></form></details>}
    {error && <Notice error>{error}</Notice>}
  </article>
}

function Follow({ me, type, id, refresh }: { me: Me; type: string; id: string; refresh: () => void }) {
  const following = me.follows?.some(f => f.target_type === type && f.target_id === id)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!me.user) return <Link className={secondary} href="/login">Sign in to follow</Link>
  if (type === 'user' && me.user.id === id) return <Link className={secondary} href="/settings/community">Edit profile</Link>
  return <div><button className={following ? secondary : button} aria-pressed={!!following} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api('follows', { target_type: type, target_id: id, following: !following }); refresh() } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }}>{following && <Check size={16} />}{following ? 'Following' : 'Follow'}</button>{error && <Notice error>{error}</Notice>}</div>
}

function Discovery({ me, refresh }: { me: Me; refresh: () => void }) {
  const [houses, setHouses] = useState<House[]>([]), [profiles, setProfiles] = useState<CommunityProfile[]>([]), [q, setQ] = useState(''), [search, setSearch] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(true)
  useEffect(() => { let cancelled = false; setBusy(true); setError(''); Promise.all([api<{ houses: House[] }>(`houses?q=${encodeURIComponent(search)}`), api<{ profiles: CommunityProfile[] }>(`profiles?q=${encodeURIComponent(search)}`)]).then(([h,p]) => { if (!cancelled) { setHouses(h.houses); setProfiles(p.profiles) } }).catch(err => { if (!cancelled) setError(err.message) }).finally(() => { if (!cancelled) setBusy(false) }); return () => { cancelled = true } }, [search])
  return <><form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(q) }}><input className={input} aria-label="Search houses and collectors" value={q} onChange={e => setQ(e.target.value)} placeholder="Search houses and collectors" /><button className={button}>Search</button></form>{error && <Notice error>{error}</Notice>}{busy ? <Busy /> : <><h2 className="text-xl font-semibold">Auction houses</h2><div className="grid gap-4 md:grid-cols-2">{houses.map(h => <section className={panel} key={h.id}><div className="mb-4 flex items-center gap-3"><Avatar name={h.company_name} /><Link className="font-semibold text-slate-900" href={`/h/${h.slug}`}>{h.company_name}</Link></div><p className="text-xs font-semibold text-indigo-700">Reviewed and licensed</p><p className="mb-4 mt-2 text-sm text-slate-600">{h.city}, {h.region}</p><Follow me={me} type="house" id={h.id} refresh={refresh} /></section>)}</div>{!houses.length && <p className="text-sm text-slate-500">No houses match this search yet.</p>}<h2 className="pt-3 text-xl font-semibold">Fellow collectors</h2><div className="grid gap-4 md:grid-cols-2">{profiles.map(p => <section className={panel} key={p.user_id}><div className="mb-3 flex items-center gap-3"><Avatar name={p.display_name} userId={p.user_id} hasImage={!!p.avatar_path} /><div><Link href={`/u/${p.handle}`} className="font-semibold">{p.display_name}</Link><p className="text-xs text-slate-500">@{p.handle}</p></div></div><p className="mb-4 line-clamp-3 text-sm leading-6 text-slate-600">{p.bio || 'Here for the next great find.'}</p><Follow me={me} type="user" id={p.user_id} refresh={refresh} /></section>)}</div>{!profiles.length && <p className="text-sm text-slate-500">No collectors match this search yet.</p>}</>}</>
}

function ProfilePage({ handle, slug, me, refresh, revision }: { handle?: string; slug?: string; me: Me; refresh: () => void; revision: number }) {
  const [profile, setProfile] = useState<CommunityProfile | null>(null), [house, setHouse] = useState<House | null>(null), [auctions, setAuctions] = useState<Auction[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState('')
  useEffect(() => { let cancelled = false; setBusy(true); setError(''); (async () => { if (slug) { const data = await api<{ houses: House[]; auctions: Auction[] }>(`houses?slug=${encodeURIComponent(slug)}`); if (!cancelled) { setHouse(data.houses[0] ?? null); setAuctions(data.auctions) } } else { const data = await api<{ profiles: CommunityProfile[] }>(`profiles?handle=${encodeURIComponent(handle ?? '')}`); if (!cancelled) setProfile(data.profiles[0] ?? null) } })().catch(err => { if (!cancelled) setError(err.message) }).finally(() => { if (!cancelled) setBusy(false) }); return () => { cancelled = true } }, [slug, handle, revision])
  if (busy) return <Busy />
  if (error) return <Notice error>{error}</Notice>
  if (!profile && !house) return <section className={panel}><h2 className="font-semibold">This profile isn’t available</h2><p className="mt-2 text-sm text-slate-600">The address may have changed or the member may have limited visibility.</p></section>
  const name = house?.company_name ?? profile!.display_name
  return <><section className={`${panel} overflow-hidden !p-0`}><div className="h-28 bg-gradient-to-r from-indigo-950 via-violet-800 to-amber-400 sm:h-40">{(house?.banner_path || profile?.banner_path) && <img className="h-full w-full object-cover" src={`/api/community/identity-media/${house ? 'house' : 'user'}/${house?.id ?? profile!.user_id}/banner`} alt={`${name} cover photo`} />}</div><div className="space-y-4 p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Avatar name={name} userId={profile?.user_id} hasImage={!!profile?.avatar_path} /><div><h2 className="font-serif text-3xl text-slate-950">{name}</h2><p className="text-sm text-slate-500">@{house?.slug ?? profile?.handle}</p></div></div><Follow me={me} type={house ? 'house' : 'user'} id={house?.id ?? profile!.user_id} refresh={refresh} /></div>{house?.is_approved && <p className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><ShieldCheck size={18} />Reviewed and licensed</p>}<p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{house?.about ?? profile?.bio}</p>{(house || profile?.show_location) && <p className="text-sm text-slate-500">{house?.city ?? profile?.city}, {house?.region ?? profile?.region}</p>}<div className="flex flex-wrap gap-2">{(house?.categories ?? profile?.interests ?? []).map(tag => <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700" key={tag}>#{tag}</span>)}</div>{profile && <p className="text-xs text-slate-500">{profile.reputation_tier} collector · Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>}</div></section>
    {!!auctions.length && <section className={panel}><h2 className="mb-4 text-lg font-semibold">Upcoming & live auctions</h2><div className="grid gap-3 sm:grid-cols-2">{auctions.map(a => <Link href={`/auctions/${a.id}`} className="rounded-2xl bg-indigo-50 p-4" key={a.id}><p className="text-xs font-semibold uppercase text-indigo-700">{a.status === 'live' ? 'Live now' : new Date(a.starts_at).toLocaleDateString()}</p><p className="mt-2 font-semibold text-indigo-950">{a.title}</p></Link>)}</div></section>}
    <Feed me={me} revision={revision} author={profile?.user_id} house={house?.id} />
  </>
}

function ProfileSettings({ me, refresh }: { me: Me; refresh: () => void }) {
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  if (!me.user) return <Link className={button} href="/login">Sign in to create your profile</Link>
  const p = me.profile
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); setMessage('')
    try { await api('profiles', { handle: form.get('handle'), display_name: form.get('display_name'), bio: form.get('bio'), city: form.get('city'), region: form.get('region'), interests: String(form.get('interests')).split(',').map(s => s.trim()).filter(Boolean), visibility: form.get('visibility'), show_location: form.get('show_location') === 'on', dm_policy: form.get('dm_policy') }); setMessage('Your profile is saved.'); refresh() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <><form key={p?.updated_at as string ?? p?.handle ?? 'new'} onSubmit={save} className={`${panel} space-y-5`}><h2 className="text-xl font-semibold">Your collector profile</h2><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Display name<input name="display_name" required maxLength={80} defaultValue={p?.display_name ?? ''} className={`${input} mt-1`} /></label><label className="text-sm">Handle<input name="handle" required minLength={3} maxLength={30} defaultValue={p?.handle ?? ''} pattern="[A-Za-z0-9][A-Za-z0-9_]{2,29}" className={`${input} mt-1`} /><span className="mt-1 block text-xs text-slate-500">Letters, numbers, underscores. Change once every 30 days.</span></label></div><label className="block text-sm">About you<textarea name="bio" maxLength={500} rows={3} defaultValue={p?.bio ?? ''} className={`${input} mt-1`} /></label><label className="block text-sm">Collecting interests<input name="interests" defaultValue={p?.interests.join(', ') ?? ''} className={`${input} mt-1`} placeholder="coins, vintage, estate-sale" /><span className="text-xs text-slate-500">Separate interests with commas.</span></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">City<input name="city" maxLength={80} defaultValue={p?.city ?? ''} className={`${input} mt-1`} /></label><label className="text-sm">State / region<input name="region" maxLength={80} defaultValue={p?.region ?? ''} className={`${input} mt-1`} /></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="show_location" defaultChecked={p?.show_location ?? false} />Show my city and region on my profile</label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Profile visibility<select name="visibility" defaultValue={p?.visibility ?? 'public'} className={`${input} mt-1`}><option value="public">Everyone</option><option value="followers">Followers only</option><option value="private">Only me</option></select></label><label className="text-sm">Who can message me<select name="dm_policy" defaultValue={p?.dm_policy ?? 'mutual'} className={`${input} mt-1`}><option value="mutual">People I follow who follow me</option><option value="open">Anyone</option><option value="closed">No one</option></select></label></div>{error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}{busy && <Busy label="Saving your profile" />}<button className={button} disabled={busy}>Save profile</button></form><>{p && <IdentityImages type="user" id={p.user_id} refresh={refresh} />}</><NotificationPreferences me={me} refresh={refresh} /><section className={panel}><h2 className="font-semibold">Your community data</h2><p className="my-3 text-sm text-slate-600">Download your profile, posts, comments, follows, blocks, and preferences.</p><a href="/api/community/export" className={secondary}>Download my community data</a></section></>
}

function IdentityImages({ type, id, refresh }: { type: 'user' | 'house'; id: string; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  async function save(slot: 'avatar' | 'banner', file?: File) {
    setBusy(true); setError(''); setMessage('')
    try {
      let media_id: string | null = null
      if (file) {
        const form = new FormData(); form.set('file', file)
        const response = await fetch('/api/community/media', { method: 'POST', body: form })
        const uploaded = await response.json()
        if (!response.ok) throw new Error(uploaded.error || 'Image upload failed.')
        media_id = uploaded.id
      }
      await api('identity-media', { subject_type: type, subject: id, slot, media_id })
      setMessage(file ? 'Your photo is saved.' : 'Your photo is removed.'); refresh()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <section className={`${panel} space-y-4`}><h2 className="text-lg font-semibold">Profile photos</h2><p className="text-sm text-slate-600">Choose a JPG, PNG, or WebP under 10 MB. Photos follow your profile visibility.</p>{(type === 'user' ? ['avatar', 'banner'] as const : ['banner'] as const).map(slot => <div key={slot} className="flex flex-wrap items-center gap-3"><label className={`${secondary} cursor-pointer`}>Upload {slot === 'avatar' ? 'profile photo' : 'cover photo'}<input aria-label={`Upload ${slot}`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void save(slot, file); e.target.value = '' }} /></label><button className="text-sm underline" disabled={busy} onClick={() => void save(slot)}>Remove {slot === 'avatar' ? 'profile photo' : 'cover photo'}</button></div>)}{busy && <Busy label="Checking and saving your photo" />}{error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}</section>
}

function NotificationPreferences({ me, refresh }: { me: Me; refresh: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  return <section className={`${panel} space-y-3`}><h2 className="text-lg font-semibold">Notification preferences</h2><p className="text-sm text-slate-600">Choose how often you receive email and push updates. Updates remain in your notification center.</p>{['posts','follows','replies','mentions','reactions','auctions'].map(category => <label key={category} className="flex items-center justify-between gap-4 text-sm capitalize">{category}<select disabled={busy} className={`${input} !w-40`} value={me.preferences?.find(p => p.category === category)?.frequency ?? 'instant'} onChange={async e => { const frequency = e.target.value; setBusy(true); setError(''); try { await api('preferences', { category, frequency }); refresh() } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }}><option value="instant">Instant</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option><option value="off">Off</option></select></label>)}{error && <Notice error>{error}</Notice>}</section>
}

type CommunityNotification = { id: string; created_at: string; category: string; notifications: { id: string; title: string; message: string; is_read: boolean } | null }
function Notifications({ me, revision }: { me: Me; revision: number }) {
  const [rows, setRows] = useState<CommunityNotification[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(true)
  useEffect(() => { let cancelled = false; if (!me.user) { setBusy(false); return } api<{ notifications: CommunityNotification[] }>('notifications').then(data => { if (!cancelled) setRows(data.notifications) }).catch(err => { if (!cancelled) setError(err.message) }).finally(() => { if (!cancelled) setBusy(false) }); return () => { cancelled = true } }, [me.user?.id, revision])
  if (!me.user) return <Link className={button} href="/login">Sign in to view notifications</Link>
  return <section className={`${panel} space-y-4`}><h2 className="text-xl font-semibold">Your updates</h2>{busy && <Busy />}{error && <Notice error>{error}</Notice>}{!busy && !rows.length && <p className="text-sm text-slate-500">You’re all caught up. Follow a house to hear what’s new.</p>}{rows.filter(r => r.notifications).map(row => <div key={row.id} className={`rounded-2xl p-4 ${row.notifications!.is_read ? 'bg-slate-50' : 'bg-indigo-50'}`}><p className="font-semibold text-slate-900">{row.notifications!.title}</p><p className="mt-2 text-sm text-slate-600">{row.notifications!.message}</p><div className="mt-3 flex items-center justify-between"><time className="text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</time>{!row.notifications!.is_read && <button className="min-h-10 text-xs font-semibold text-indigo-700" onClick={async () => { try { await api('read-notification', { id: row.notifications!.id }); setRows(current => current.map(r => r.id === row.id ? { ...r, notifications: { ...r.notifications!, is_read: true } } : r)) } catch (err) { setError((err as Error).message) } }}>Mark read</button>}</div></div>)}</section>
}

function HouseStudio({ me, refresh, revision }: { me: Me; refresh: () => void; revision: number }) {
  const [houseProfiles, setHouseProfiles] = useState<House[]>([]), [selected, setSelected] = useState(me.houses?.[0]?.id ?? '')
  const currentHouse = houseProfiles.find(h => h.id === selected)
  useEffect(() => { let cancelled = false; api<{ houses: House[] }>('houses?mine=true').then(data => { if (!cancelled) setHouseProfiles(data.houses) }).catch(() => {}); return () => { cancelled = true } }, [revision])
  const [posts, setPosts] = useState<CommunityPost[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { let cancelled = false; if (me.user) api<{ posts: CommunityPost[] }>('scheduled').then(data => { if (!cancelled) setPosts(data.posts) }).catch(err => { if (!cancelled) setError(err.message) }); return () => { cancelled = true } }, [me.user?.id, revision])
  if (!me.houses?.length) return <Notice>House tools are available to approved auctioneers.</Notice>
  return <><section className={panel}><h2 className="mb-4 text-xl font-semibold">Set up your house profile</h2><form key={selected + revision} className="space-y-4" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { await api('houses', { id: form.get('house_id'), slug: form.get('slug'), about: form.get('about'), categories: String(form.get('categories')).split(',').map(s => s.trim()).filter(Boolean), service_radius_miles: Number(form.get('radius')), auto_posts: form.get('auto_posts') === 'on' }); refresh() } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }}><label className="block text-sm">House<select name="house_id" value={selected} onChange={e => setSelected(e.target.value)} className={`${input} mt-1`}>{me.houses.map(h => <option key={h.id} value={h.id}>{h.company_name}</option>)}</select></label><label className="block text-sm">House address name<input name="slug" defaultValue={currentHouse?.slug ?? ''} required minLength={3} maxLength={30} className={`${input} mt-1`} placeholder="smith_auctions" /><span className="text-xs text-slate-500">Your profile will be at /h/your_name.</span></label><label className="block text-sm">About your house<textarea name="about" defaultValue={currentHouse?.about ?? ''} required maxLength={2000} rows={3} className={`${input} mt-1`} /></label><label className="block text-sm">Categories<input name="categories" defaultValue={currentHouse?.categories.join(', ') ?? ''} className={`${input} mt-1`} placeholder="coins, vintage, estates" /></label><label className="block text-sm">Service radius (miles)<input type="number" name="radius" min={1} max={500} defaultValue={currentHouse?.service_radius_miles ?? 25} required className={`${input} mt-1`} /></label><label className="flex gap-2 text-sm"><input type="checkbox" name="auto_posts" defaultChecked={currentHouse?.auto_posts ?? false} />Automatically share auction announcements</label><button className={button} disabled={busy}>Save house profile</button></form></section>{currentHouse && <IdentityImages type="house" id={selected} refresh={refresh} />}<Composer me={me} onSaved={refresh} />{error && <Notice error>{error}</Notice>}<h2 className="text-xl font-semibold">Scheduled & awaiting review</h2>{!posts.length && <p className="text-sm text-slate-500">No posts are waiting.</p>}{posts.map(post => <PostCard key={post.id} post={post} me={me} refresh={refresh} />)}</>
}

function Moderation({ me }: { me: Me }) {
  const [queue, setQueue] = useState<{ reports: { id: string; subject_type: string; reason: string }[]; pendingPosts: { id: string; body: string }[]; pendingComments: { id: string; body: string }[] }>({ reports: [], pendingPosts: [], pendingComments: [] }), [error, setError] = useState(''), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false)
  useEffect(() => { let cancelled = false; if (me.user?.role === 'admin') api<typeof queue>('moderation').then(data => { if (!cancelled) setQueue(data) }).catch(err => { if (!cancelled) setError(err.message) }); return () => { cancelled = true } }, [me.user?.role, revision])
  if (me.user?.role !== 'admin') return <Notice error>Admin access is required.</Notice>
  async function act(path: string, values: unknown) { setBusy(true); setError(''); try { await api(path, values); setRevision(n => n + 1) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  return <><h2 className="text-xl font-semibold">Moderation queue</h2>{error && <Notice error>{error}</Notice>}{queue.reports.map(r => <form key={r.id} className={`${panel} space-y-3`} onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void act('moderation', { report_id: r.id, action: form.get('action'), reason: form.get('reason') }) }}><p className="text-xs font-semibold uppercase text-indigo-600">Reported {r.subject_type}</p><p className="whitespace-pre-wrap text-sm text-slate-700">{r.reason}</p><label className="block text-sm">Decision<select name="action" className={`${input} mt-1`}><option value="dismiss">Dismiss report</option><option value="hide">Hide content</option><option value="warn">Warn member</option><option value="suspend">Suspend for 7 days</option><option value="ban">Ban member</option><option value="restore">Restore</option></select></label><input className={input} name="reason" aria-label="Moderation reason" required minLength={5} placeholder="Explain this decision" /><button className={button} disabled={busy}>Record decision</button></form>)}{[['post',queue.pendingPosts],['comment',queue.pendingComments]].map(([type,items]) => (items as { id: string; body: string }[]).map(p => <form key={p.id} className={`${panel} space-y-3`} onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void act('review-pending', { id: p.id, type, approve: form.get('approve') === 'true', reason: form.get('reason') }) }}><p className="text-xs font-semibold uppercase text-indigo-600">Pending {String(type)}</p><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{p.body}</p><select name="approve" aria-label="Review decision" className={input}><option value="false">Keep hidden</option><option value="true">Approve publication</option></select><input className={input} name="reason" required minLength={5} aria-label="Review reason" placeholder="Explain this decision" /><button className={button} disabled={busy}>Save review</button></form>))}{!queue.reports.length && !queue.pendingPosts.length && !queue.pendingComments.length && <p className="text-sm text-slate-500">No content is waiting for review.</p>}</>
}

