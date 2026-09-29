import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ScanBarcode, ShieldCheck, Sparkles } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { QuickListWorkspace } from '@/components/org/quick-list/quick-list-workspace'
import type { QueueDraft } from '@/components/org/quick-list/batch-queue'
import { VERIFIED_ORIGINALS_LABEL } from '@/lib/ai/quick-listing'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ auction?: string; consignment?: string }>
}

export default async function QuickListPage({ searchParams }: Props) {
  const { auction: auctionParam, consignment } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('id, company_name, is_approved')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!auctioneer) notFound()
  let initialContext = ''
  if (consignment && /^[a-f0-9-]{36}$/.test(consignment)) {
    const { data: accepted } = await supabase.from('community_consignment_offers').select('request_id').eq('request_id',consignment).eq('house_id',auctioneer.id).eq('status','accepted').maybeSingle()
    if (accepted) {
      const { data: request } = await supabase.from('community_consignments').select('title,description,quantity').eq('id',consignment).maybeSingle()
      if (request) initialContext = `Consignment: ${request.title}. Approximate quantity: ${request.quantity}. Seller notes (verify against the item): ${request.description}`.slice(0,800)
    }
  }

  const [{ data: auctions }, { data: drafts }] = await Promise.all([
    supabase
      .from('auctions')
      .select('id, title, status, ends_at')
      .eq('auctioneer_id', auctioneer.id)
      .in('status', ['draft', 'scheduled', 'live'])
      .order('starts_at', { ascending: false }),
    supabase
      .from('ai_quick_list_drafts')
      .select('id, status, suggested, edits, confidence, lot_id, created_at')
      .eq('auctioneer_id', auctioneer.id)
      .neq('status', 'discarded')
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const draftList = (drafts ?? []) as unknown as QueueDraft[]

  // One query for all thumbnails rather than one per draft.
  const draftIds = draftList.map((draft) => draft.id)
  const thumbnails = new Map<string, string>()

  if (draftIds.length > 0) {
    const { data: images } = await supabase
      .from('lot_images')
      .select('draft_id, public_url, position')
      .in('draft_id', draftIds)
      .eq('kind', 'original')
      .order('position', { ascending: true })

    for (const image of (images ?? []) as Array<{ draft_id: string; public_url: string }>) {
      if (!thumbnails.has(image.draft_id)) thumbnails.set(image.draft_id, image.public_url)
    }
  }

  const initialDrafts = draftList.map((draft) => ({
    ...draft,
    thumbnail_url: thumbnails.get(draft.id) ?? null,
  }))

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-gradient-to-r from-[#4c1d95] to-[#6d28d9] text-white">
            <ScanBarcode className="mr-1 h-3 w-3" />
            Quick List
          </Badge>
          <Badge variant={auctioneer.is_approved ? 'default' : 'outline'}>
            {auctioneer.is_approved ? 'Approved seller' : 'Pending review'}
          </Badge>
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link href="/org/auctions">Full lot builder</Link>
          </Button>
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-3xl text-slate-950 sm:text-4xl">
            AI Quick Listing
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Scan a barcode or photograph an item and get a near-complete draft listing in one tap.
            You review and approve everything — AI drafts never publish on their own.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            {VERIFIED_ORIGINALS_LABEL} stay unaltered and show first
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-800">
            <Sparkles className="h-3.5 w-3.5" />
            AI images are labelled presentation mockups only
          </span>
        </div>
      </header>

      <QuickListWorkspace
        initialContext={initialContext}
        auctioneerId={auctioneer.id}
        auctions={(auctions ?? []) as Array<{
          id: string
          title: string
          status: string
          ends_at: string
        }>}
        initialDrafts={initialDrafts}
        defaultAuctionId={auctionParam}
      />
    </div>
  )
}
