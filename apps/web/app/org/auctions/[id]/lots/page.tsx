import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Package2, Sparkles } from 'lucide-react'

import { normalizeAiPreferences } from '@/lib/ai/listing-assistant'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDollars } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LotForm } from '@/components/org/lot-form'

interface Props {
  params: Promise<{
    id: string
  }>
}

export default async function AuctionLotsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('id, company_name, ai_preferences')
    .eq('user_id', user.id)
    .single()

  if (!auctioneer) {
    notFound()
  }

  const { data: auction } = await supabase
    .from('auctions')
    .select('*')
    .eq('id', id)
    .eq('auctioneer_id', auctioneer.id)
    .single()

  if (!auction) {
    notFound()
  }

  const { data: lots } = await supabase
    .from('lots')
    .select('*')
    .eq('auction_id', auction.id)
    .order('lot_number', { ascending: true })

  const aiPreferences = normalizeAiPreferences(auctioneer.ai_preferences)
  const lotCount = lots?.length ?? 0

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/org/auctions/${auction.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Auction
            </Link>
          </Button>
          <Badge className="bg-gradient-to-r from-[#4c1d95] to-[#6d28d9] text-white">
            Lot Builder
          </Badge>
          <Badge variant="secondary">
            {lotCount} existing lot{lotCount === 1 ? '' : 's'}
          </Badge>
          <Badge variant={aiPreferences.enabled ? 'default' : 'outline'} className="gap-1">
            <Sparkles className="h-3 w-3" />
            AI {aiPreferences.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-4xl text-slate-950">{auction.title}</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Build catalog-ready lots for this sale. Image uploads go to Supabase Storage,
            AI suggestions remain opt-in, and only accepted fields are written to the lot
            record.
          </p>
        </div>
      </header>

      <LotForm auction={auction} existingLots={lots ?? []} aiEnabled={aiPreferences.enabled} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">Existing Lots</CardTitle>
            <CardDescription>
              Current catalog entries for this auction, sorted by lot number.
            </CardDescription>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div>Starts {formatDate(auction.starts_at)}</div>
            <div>Ends {formatDate(auction.ends_at)}</div>
          </div>
        </CardHeader>

        <CardContent>
          {lotCount === 0 ? (
            <div className="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50/70 px-6 py-12 text-center text-sm text-slate-500">
              <Package2 className="mx-auto mb-4 h-9 w-9 text-indigo-500" />
              No lots have been added yet. Use the workspace above to create the first one.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lots?.map((lot) => (
                <div
                  key={lot.id}
                  className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                        Lot {lot.lot_number}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">
                        {lot.title}
                      </h3>
                    </div>
                    {lot.ai_generated ? (
                      <Badge>AI Assisted</Badge>
                    ) : (
                      <Badge variant="outline">Manual</Badge>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p className="line-clamp-3">{lot.description || 'No description yet.'}</p>
                    <div className="flex flex-wrap gap-2">
                      {lot.category ? <Badge variant="secondary">{lot.category}</Badge> : null}
                      {lot.estimate_low != null && lot.estimate_high != null ? (
                        <Badge variant="outline">
                          {formatDollars(lot.estimate_low)} - {formatDollars(lot.estimate_high)}
                        </Badge>
                      ) : lot.estimate_low != null ? (
                        <Badge variant="outline">
                          Estimate from {formatDollars(lot.estimate_low)}
                        </Badge>
                      ) : lot.estimate_high != null ? (
                        <Badge variant="outline">
                          Estimate up to {formatDollars(lot.estimate_high)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Starting bid {formatDollars(lot.starting_bid)}</span>
                      <span>{Array.isArray(lot.images) ? lot.images.length : 0} images</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
