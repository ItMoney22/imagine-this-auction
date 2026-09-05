import Link from 'next/link'
import Image from 'next/image'
import {
  ShieldCheck,
  Clock3,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Gavel,
  Timer,
  TrendingUp,
  Zap,
  DollarSign,
  CheckCircle2,
  XCircle,
  Star,
  CreditCard,
  Layers,
  Smartphone,
  Truck,
  Camera,
  Landmark,
  BadgeCheck,
  Receipt,
  FileCheck,
  Banknote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import { COMPETITOR_CAPTION, COMPETITOR_ROWS, HIBID_PRICING } from '@/lib/pricing/competitors'
import { formatUsd } from '@/lib/pricing/premium'

type Auction = Database['public']['Tables']['auctions']['Row']
type Lot = Database['public']['Tables']['lots']['Row']

interface LotWithAuction extends Lot {
  auctions: Pick<Auction, 'ends_at' | 'title' | 'status'>
}

function calculateTimeRemaining(endsAt: string): string {
  const now = new Date()
  const end = new Date(endsAt)
  const diff = end.getTime() - now.getTime()
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/** Whole dollars to a two-decimal USD string. */
function usd(dollars: number): string {
  return formatUsd(Math.round(dollars * 100))
}

interface DisplayLot {
  id: string
  title: string
  subtitle?: string
  category: string
  currentBidCents: number
  bids: number
  endsIn: string
  image: string
  /** Illustrative card shown only while there is no live inventory. */
  sample: boolean
}

// Shown only when no live lots exist. These are not real listings, so they
// carry a Sample badge and show no bid count or closing time.
const placeholderLots: DisplayLot[] = [
  { id: 'p-1', title: 'Vintage Film Camera Collection', subtitle: 'Includes 3 working cameras', category: 'Electronics', currentBidCents: 12500, bids: 0, endsIn: '', image: '/lots/camera-vintage.webp', sample: true },
  { id: 'p-2', title: 'Classic Vinyl Records Bundle', subtitle: '20+ records from the 60s-80s', category: 'Music', currentBidCents: 8500, bids: 0, endsIn: '', image: '/lots/vinyl-records.webp', sample: true },
  { id: 'p-3', title: 'Handcrafted Oak Rocking Chair', subtitle: 'Restored antique, circa 1920', category: 'Furniture', currentBidCents: 27500, bids: 0, endsIn: '', image: '/lots/rocking-chair.webp', sample: true },
  { id: 'p-4', title: 'Signed Sports Memorabilia', subtitle: 'Authenticated baseball collection', category: 'Sports', currentBidCents: 45000, bids: 0, endsIn: '', image: '/lots/sports-memorabilia.webp', sample: true },
  { id: 'p-5', title: 'Vintage Toy Train Set', subtitle: 'Complete with tracks & accessories', category: 'Toys', currentBidCents: 19500, bids: 0, endsIn: '', image: '/lots/vintage-toys.webp', sample: true },
  { id: 'p-6', title: 'Handmade Pottery Collection', subtitle: 'Local artisan, 6-piece set', category: 'Home & Garden', currentBidCents: 7500, bids: 0, endsIn: '', image: '/lots/pottery-handmade.webp', sample: true },
]

function LotCard({ lot }: { lot: DisplayLot }) {
  // Sample lots have no detail page; send visitors to the browse page instead
  const href = lot.sample ? '/lots' : `/lots/${lot.id}`
  return (
    <Link href={href} className="group relative block">
      <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-[0_8px_40px_rgba(0,0,0,0.06)] transition-all duration-500 hover:shadow-[0_20px_60px_rgba(76,29,149,0.15)] hover:-translate-y-2 hover:border-purple-200/60">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
          <Image src={lot.image} alt={lot.title} fill className="object-cover transition-transform duration-700 group-hover:scale-110" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-4 left-4">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] bg-white/90 backdrop-blur-md text-slate-800 shadow-lg">{lot.category}</span>
          </div>
          <div className="absolute top-4 right-4">
            {lot.sample ? (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-white shadow-lg">
                Sample
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="absolute bottom-4 left-4 right-4 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
            <span className="w-full py-3 rounded-xl bg-white/95 backdrop-blur-md text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 group-hover:bg-white transition-colors">
              <Gavel className="w-4 h-4" />
              {lot.sample ? 'Browse live lots' : 'Place Bid'}
            </span>
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-display text-lg font-semibold text-slate-900 leading-tight line-clamp-1 group-hover:text-purple-700 transition-colors">{lot.title}</h3>
          {lot.subtitle && <p className="mt-1 text-sm text-slate-600 line-clamp-1">{lot.subtitle}</p>}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">{lot.sample ? 'Example Bid' : 'Current Bid'}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{formatUsd(lot.currentBidCents)}</p>
            </div>
            {lot.sample ? (
              <p className="text-xs text-slate-400 text-right max-w-[9rem]">Illustration only. Not a real listing.</p>
            ) : (
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Ends In</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-purple-600">
                  <Timer className="w-3.5 h-3.5" />
                  {lot.endsIn}
                </p>
              </div>
            )}
          </div>
          {!lot.sample && (
            <div className="mt-3 flex items-center text-xs text-slate-600">
              <TrendingUp className="w-3 h-3 mr-1" />
              {lot.bids} {lot.bids === 1 ? 'bid' : 'bids'}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

/**
 * Worked savings example. Every input is stated in the small print under the
 * calculator; the totals below are derived from these, never typed by hand.
 */
const SAVINGS_EXAMPLE = {
  monthlyHammer: 50_000,
  auctionsPerMonth: 4,
  hibidCommissionPct: HIBID_PRICING.commissionPct,
  hibidSoftwareMonthly: HIBID_PRICING.softwareMidCents / 100, // AuctionFlex 360 mid tier
  hibidWebcastPerAuction: HIBID_PRICING.webcastSetupCents / 100,
  hibidBidFeeCap: HIBID_PRICING.perBidCapCents / 100,
  hibidBidCapAuctions: 2, // auctions per month assumed to hit the cap
  itaCommissionPct: 1.2,
}

const hibidCommission = (SAVINGS_EXAMPLE.monthlyHammer * SAVINGS_EXAMPLE.hibidCommissionPct) / 100
const hibidWebcast = SAVINGS_EXAMPLE.auctionsPerMonth * SAVINGS_EXAMPLE.hibidWebcastPerAuction
const hibidBidFees = SAVINGS_EXAMPLE.hibidBidCapAuctions * SAVINGS_EXAMPLE.hibidBidFeeCap
const hibidTotal = hibidCommission + SAVINGS_EXAMPLE.hibidSoftwareMonthly + hibidWebcast + hibidBidFees
const itaTotal = (SAVINGS_EXAMPLE.monthlyHammer * SAVINGS_EXAMPLE.itaCommissionPct) / 100
const monthlySavings = hibidTotal - itaTotal
const yearlySavings = monthlySavings * 12

export default async function Home() {
  const supabase = await createClient()

  let dbLots: LotWithAuction[] = []

  try {
    const [{ data: liveAuctions }, { data: lotsData }] = await Promise.all([
      supabase
        .from('auctions')
        .select('id, title, ends_at, status')
        .eq('status', 'live')
        .order('ends_at', { ascending: true })
        .limit(5),
      supabase
        .from('lots')
        .select('*, auctions!inner(ends_at, title, status)')
        .eq('auctions.status', 'live')
        .eq('is_sold', false)
        .order('bid_count', { ascending: false })
        .limit(6),
    ])

    if (liveAuctions && liveAuctions.length > 0 && lotsData) {
      const liveAuctionIds = new Set(liveAuctions.map((auction) => auction.id))
      dbLots = (lotsData as unknown as LotWithAuction[]).filter((lot) =>
        liveAuctionIds.has(lot.auction_id)
      )
    }
  } catch (error) {
    console.error('Failed to load homepage marketplace data:', error)
  }

  const transformedLots: DisplayLot[] = dbLots.map((lot) => {
    let firstImage = '/lots/pottery-handmade.webp'
    try {
      const imagesData = lot.images
      if (typeof imagesData === 'string') {
        const parsed = JSON.parse(imagesData)
        if (Array.isArray(parsed) && parsed.length > 0) firstImage = String(parsed[0])
      } else if (Array.isArray(imagesData) && imagesData.length > 0) {
        firstImage = String(imagesData[0])
      }
    } catch { /* use default */ }
    return {
      id: lot.id,
      title: lot.title,
      subtitle: lot.description?.substring(0, 50) || undefined,
      category: lot.category || 'General',
      currentBidCents: lot.current_high_bid > 0 ? lot.current_high_bid : lot.starting_bid,
      bids: lot.bid_count,
      endsIn: calculateTimeRemaining(lot.auctions.ends_at),
      image: firstImage,
      sample: false,
    }
  })

  const displayLots = transformedLots.length > 0 ? transformedLots : placeholderLots

  return (
    <div className="relative overflow-hidden">
      {/* ===== HERO ===== */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Hero Background Image */}
        <div className="absolute inset-0">
          <Image
            src="/images/hero-auction.webp"
            alt="Modern auction event"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f0520]/98 via-[#0f0520]/90 to-[#0f0520]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0520] via-[#0f0520]/30 to-transparent" />
        </div>

        {/* Animated Accents */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] top-[20%] h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px] animate-float-slow" />
          <div className="absolute right-[5%] top-[10%] h-[400px] w-[400px] rounded-full bg-indigo-500/15 blur-[100px] animate-float-slower" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-32 lg:py-40">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <div className="mb-8 animate-fade-in">
              <Badge className="bg-white/10 text-white/90 border border-white/20 backdrop-blur-md px-5 py-2 text-[11px] tracking-[0.25em]">
                <Zap className="w-3.5 h-3.5 mr-2 text-yellow-400" />
                Online Auctions for Independent Auctioneers
              </Badge>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-display font-bold leading-[0.95] tracking-tight text-white animate-fade-in-up">
              Auction
              <span className="block bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                Without Limits.
              </span>
            </h1>

            <p className="mt-8 text-xl lg:text-2xl text-white/80 max-w-2xl leading-relaxed animate-fade-in-up">
              No monthly, listing, per-bid, or webcast fees. Founding auctioneers pay 1.2% of hammer,
              billed once a month, and keep the buyer&apos;s premium.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-start gap-4 mt-10 animate-fade-in-up">
              <Button asChild size="lg" className="text-base px-8 h-14 rounded-2xl shadow-xl shadow-purple-500/30">
                <Link href="/signup">
                  Apply as an Auctioneer
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base px-8 h-14 rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10 backdrop-blur-md">
                <Link href="/auctions">
                  Browse Live Auctions
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>

            {/* Fee facts */}
            <div className="flex flex-wrap items-center gap-8 mt-14 animate-fade-in">
              {[
                { value: '1.2%', label: 'Founding Rate' },
                { value: '$0.00', label: 'Monthly Fee' },
                { value: '$0.00', label: 'Per-Bid Fee' },
                { value: '$0.00', label: 'Webcast Fee' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-3xl font-display font-bold text-white tabular-nums">{stat.value}</p>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/70 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW WE WORK BAR ===== */}
      <section className="relative -mt-1 bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#4c1d95] py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-center">
            {[
              { icon: Star, text: 'Founding auctioneers keep 1.2% for life' },
              { icon: Receipt, text: 'No per-bid, listing, or webcast fees' },
              { icon: CreditCard, text: 'Bid with a card on file, pay only when you win' },
              { icon: Truck, text: 'Local delivery by vetted drivers' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 text-white/90 text-sm font-medium">
                <item.icon className="w-4 h-4 text-purple-300" />
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEE COMPARISON ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-6 text-[10px] tracking-[0.2em]">
              <DollarSign className="w-3 h-3 mr-1" />
              Compare the Fees
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-display font-bold text-slate-900 leading-tight">
              Why Auctioneers Choose
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> Imagine This Auction</span>
            </h2>
            <p className="mt-6 text-lg text-slate-600">
              An auctioneer selling {usd(SAVINGS_EXAMPLE.monthlyHammer)} a month pays about{' '}
              <strong className="text-slate-900">{usd(hibidTotal)}</strong> in HiBid fees under the assumptions
              below, and <strong className="text-slate-900">{usd(itaTotal)}</strong> here. That is{' '}
              <strong className="text-slate-900">{usd(monthlySavings)}</strong> a month, or {usd(yearlySavings)} a year.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="max-w-4xl mx-auto">
            <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
              {/* Header */}
              <div className="grid grid-cols-3 bg-slate-900 text-white">
                <div className="p-6 font-semibold text-sm uppercase tracking-wider text-white/80">Fee</div>
                <div className="p-6 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Image src="/images/logo-mark.webp" alt="ImagineThis" width={28} height={28} className="rounded-lg" />
                    <span className="font-bold text-lg">ImagineThis</span>
                  </div>
                </div>
                <div className="p-6 text-center">
                  <span className="font-bold text-lg text-white/80">HiBid</span>
                </div>
              </div>

              {/* Rows */}
              {COMPETITOR_ROWS.map((row, i) => (
                <div key={row.feature} className={`grid grid-cols-3 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'} ${i < COMPETITOR_ROWS.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="p-5 flex items-center text-sm font-medium text-slate-700">{row.feature}</div>
                  <div className="p-5 flex items-center justify-center gap-2 text-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <span className="font-bold text-emerald-700 text-sm">{row.ita}</span>
                  </div>
                  <div className="p-5 flex items-center justify-center gap-2 text-center">
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <span className="text-slate-500 text-sm">{row.hibid}</span>
                  </div>
                </div>
              ))}

              <p className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 text-center">
                {COMPETITOR_CAPTION}
              </p>

              {/* Bottom CTA */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 text-center">
                <p className="text-white/80 text-sm mb-3">Ready to keep more of your hammer?</p>
                <Button asChild variant="secondary" size="lg" className="bg-white text-purple-700 hover:bg-white/90 shadow-xl rounded-2xl h-12 px-8">
                  <Link href="/signup">
                    Switch to ImagineThis
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PLATFORM FEATURES ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left - Image */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative overflow-hidden rounded-3xl">
                <Image
                  src="/images/auctioneer.webp"
                  alt="Professional auctioneer"
                  width={800}
                  height={600}
                  className="object-cover w-full"
                />
              </div>
            </div>

            {/* Right - Features */}
            <div>
              <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-purple-100 text-purple-700">
                Built for Auctioneers
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 leading-tight mb-6">
                Everything you need. Nothing you don&apos;t.
              </h2>
              <p className="text-lg text-slate-600 mb-10">
                Timed online auctions, a catalog that drafts itself from photos, and card payments that settle
                on your own merchant account. We bill one statement a month and stay out of your way.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: Gavel, title: 'Timed Online Auctions', desc: 'Set start and end times, opening bids, and reserves per lot' },
                  { icon: Landmark, title: 'Your Own Merchant Account', desc: 'Winners are charged through your PaymentCloud account; you keep the premium' },
                  { icon: Camera, title: 'AI Quick List', desc: 'Photograph an item and the title and description draft themselves' },
                  { icon: Smartphone, title: 'Mobile-First Bidding', desc: 'Bidders join from any device, no app download' },
                  { icon: Clock3, title: 'Anti-Sniping Extensions', desc: 'A late bid extends the close so the lot sells at its true price' },
                  { icon: Layers, title: 'CSV Lot Upload', desc: 'Bring a whole catalog in from a spreadsheet' },
                ].map((feature) => (
                  <div key={feature.title} className="flex gap-4 p-4 rounded-2xl bg-white backdrop-blur-sm border border-slate-200 hover:border-purple-300 hover:shadow-lg transition-all duration-300">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                      <feature.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">{feature.title}</h4>
                      <p className="text-sm text-slate-600">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-slate-50/80">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge className="mb-4 bg-slate-900 text-white text-[10px] tracking-[0.2em]">
              Simple Process
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900">
              From Application to First Sale
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Apply, connect your merchant account, list, sell. No setup fees, no software to install.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { number: '01', title: 'Apply', description: 'Tell us about your business and your auctioneer license. We review every application before anyone lists.', icon: FileCheck },
              { number: '02', title: 'Connect PaymentCloud', description: 'Link your own PaymentCloud merchant account. Winning bidders are charged through it, so the money is yours from the start.', icon: Landmark },
              { number: '03', title: 'List Your Lots', description: 'Photograph items and let AI Quick List draft the catalog, or upload a CSV. Set opening bids, increments, and reserves.', icon: Camera },
              { number: '04', title: 'Sell and Get Paid', description: 'Bids close, cards are charged, funds settle to your bank. We send one 1.2% statement at the end of the month.', icon: Banknote },
            ].map((step, i) => (
              <div key={step.number} className="relative group">
                {i < 3 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-full h-px bg-gradient-to-r from-purple-300 to-transparent" />
                )}
                <div className="relative p-8 rounded-3xl bg-white backdrop-blur-sm border border-slate-200 shadow-[0_8px_40px_rgba(0,0,0,0.06)] transition-all duration-500 hover:shadow-[0_20px_60px_rgba(76,29,149,0.1)] hover:-translate-y-1">
                  <span className="inline-block text-8xl font-display font-bold text-slate-200 mb-4 select-none leading-none">{step.number}</span>
                  <div className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                    <step.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SAVINGS CALCULATOR ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-900 via-[#1a0b3e] to-slate-900 p-12 lg:p-20">
            {/* Decorative */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="relative grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <Badge className="mb-6 bg-white/10 text-white border border-white/20 text-[10px] tracking-[0.2em]">
                  <DollarSign className="w-3 h-3 mr-1" />
                  A Worked Example
                </Badge>
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white leading-tight mb-6">
                  See what you&apos;d keep by switching to ImagineThis.
                </h2>
                <p className="text-lg text-white/60 mb-8">
                  A worked example for an auctioneer selling {usd(SAVINGS_EXAMPLE.monthlyHammer)} of hammer a month
                  across {SAVINGS_EXAMPLE.auctionsPerMonth} auctions. Change the numbers to yours and the gap moves
                  with them.
                </p>
                <Button asChild variant="secondary" size="lg" className="bg-white text-slate-900 hover:bg-white/90 shadow-xl rounded-2xl h-14 px-8">
                  <Link href="/signup">
                    Apply as a Founding Auctioneer
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <p className="mt-8 text-xs leading-relaxed text-white/40">
                  Assumptions: {usd(SAVINGS_EXAMPLE.monthlyHammer)} in hammer per month across{' '}
                  {SAVINGS_EXAMPLE.auctionsPerMonth} auctions. HiBid: {SAVINGS_EXAMPLE.hibidCommissionPct}% commission,
                  AuctionFlex 360 mid software tier at {usd(SAVINGS_EXAMPLE.hibidSoftwareMonthly)} per month,{' '}
                  {usd(SAVINGS_EXAMPLE.hibidWebcastPerAuction)} webcast setup per auction, and the {formatUsd(HIBID_PRICING.perBidFeeCents)} per unique bid fee
                  reaching its {usd(SAVINGS_EXAMPLE.hibidBidFeeCap)} per-auction cap in {SAVINGS_EXAMPLE.hibidBidCapAuctions} of
                  the {SAVINGS_EXAMPLE.auctionsPerMonth} auctions. ImagineThis: {SAVINGS_EXAMPLE.itaCommissionPct}% founding rate
                  on hammer. Card processing costs apply on both and are excluded. {COMPETITOR_CAPTION}.
                </p>
              </div>

              <div className="space-y-6">
                {/* Their Cost */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <p className="text-sm font-semibold uppercase tracking-wider text-red-400 mb-3">On HiBid</p>
                  <div className="space-y-2 text-white/70 text-sm tabular-nums">
                    <div className="flex justify-between"><span>{SAVINGS_EXAMPLE.hibidCommissionPct}% commission on {usd(SAVINGS_EXAMPLE.monthlyHammer)}</span><span>{usd(hibidCommission)}</span></div>
                    <div className="flex justify-between"><span>Software, mid tier</span><span>{usd(SAVINGS_EXAMPLE.hibidSoftwareMonthly)}</span></div>
                    <div className="flex justify-between"><span>Webcast setup, {SAVINGS_EXAMPLE.auctionsPerMonth} auctions</span><span>{usd(hibidWebcast)}</span></div>
                    <div className="flex justify-between"><span>Per-bid fees, cap hit {SAVINGS_EXAMPLE.hibidBidCapAuctions} times</span><span>{usd(hibidBidFees)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-white/10 text-white font-bold text-lg">
                      <span>Total</span><span className="text-red-400">{usd(hibidTotal)}/mo</span>
                    </div>
                  </div>
                </div>

                {/* Our Cost */}
                <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
                  <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-3">On ImagineThis</p>
                  <div className="space-y-2 text-white/70 text-sm tabular-nums">
                    <div className="flex justify-between"><span>{SAVINGS_EXAMPLE.itaCommissionPct}% founding rate on {usd(SAVINGS_EXAMPLE.monthlyHammer)}</span><span>{usd(itaTotal)}</span></div>
                    <div className="flex justify-between"><span>Software</span><span className="text-emerald-400">{usd(0)}</span></div>
                    <div className="flex justify-between"><span>Webcast setup</span><span className="text-emerald-400">{usd(0)}</span></div>
                    <div className="flex justify-between"><span>Per-bid and listing fees</span><span className="text-emerald-400">{usd(0)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-white/10 text-white font-bold text-lg">
                      <span>Total</span><span className="text-emerald-400">{usd(itaTotal)}/mo</span>
                    </div>
                  </div>
                </div>

                {/* Savings */}
                <div className="text-center p-4 rounded-2xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/20">
                  <p className="text-white/60 text-sm">You keep</p>
                  <p className="text-4xl font-display font-bold text-white tabular-nums">{usd(monthlySavings)}<span className="text-lg text-white/60">/mo</span></p>
                  <p className="text-purple-300 text-sm font-medium">{usd(yearlySavings)} a year, under the assumptions at left</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== LIVE AUCTIONS ===== */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50/80 to-white">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
            <div>
              <Badge variant="secondary" className="mb-4 text-[10px] tracking-[0.2em] bg-purple-100 text-purple-700">
                {transformedLots.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
                )}
                {transformedLots.length > 0 ? 'Live Now' : 'Sample Listings'}
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900">
                {transformedLots.length > 0 ? 'Happening Right Now' : 'What a Lot Looks Like'}
              </h2>
              <p className="mt-2 text-slate-600 max-w-lg">
                {transformedLots.length > 0
                  ? 'Jump into active auctions and start bidding.'
                  : 'These are illustrations, not real listings. Live lots appear here as soon as an auction opens.'}
              </p>
            </div>
            <Button asChild variant="outline" className="self-start sm:self-auto">
              <Link href="/auctions">
                View All Auctions
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {displayLots.slice(0, 6).map((lot) => (
              <LotCard key={lot.id} lot={lot} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOR BIDDERS ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-indigo-100 text-indigo-700">
                For Bidders
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 leading-tight mb-6">
                The thrill of the auction, from anywhere.
              </h2>
              <p className="text-lg text-slate-600 mb-10">
                Register with a card on file, bid on lots from licensed auctioneers, and pay only when you win:
                the hammer price plus the auctioneer&apos;s buyer&apos;s premium, shown on every lot before you bid.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: CreditCard, title: 'Card on File', desc: 'Nothing is charged until you win' },
                  { icon: Clock3, title: 'Anti-Sniping', desc: 'A late bid extends the close so everyone gets a fair shot' },
                  { icon: BadgeCheck, title: 'Licensed Auctioneers', desc: 'Every auctioneer is reviewed before they list' },
                  { icon: Truck, title: 'Local Delivery', desc: 'Pick up, ship, or have a vetted driver bring it to you' },
                ].map((feature) => (
                  <div key={feature.title} className="flex gap-4 p-4 rounded-2xl bg-white backdrop-blur-sm border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-300">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <feature.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">{feature.title}</h4>
                      <p className="text-sm text-slate-600">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - Items Image */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative overflow-hidden rounded-3xl">
                <Image
                  src="/images/luxury-items.webp"
                  alt="Auction items"
                  width={900}
                  height={506}
                  className="object-cover w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOUNDING AUCTIONEER CTA ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#4338ca] p-12 lg:p-20 text-white shadow-2xl shadow-purple-500/30">
            {/* Decorative */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                backgroundSize: '32px 32px',
              }} />
            </div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
              <div className="max-w-2xl">
                <Badge className="mb-6 bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 text-[10px] tracking-[0.2em]">
                  <Star className="w-3 h-3 mr-1" />
                  Founding Auctioneers
                </Badge>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight">
                  Become a Founding Auctioneer
                </h2>
                <p className="mt-6 text-lg text-white/70 max-w-xl">
                  The standard platform fee is 2% of hammer. Founding auctioneers lock in{' '}
                  <strong className="text-white">1.2% for life</strong>, no matter what new sign-ups pay later.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    '1.2% of hammer, locked for life',
                    'You keep the buyer’s premium',
                    'Card payments settle on your own PaymentCloud merchant account',
                    'One statement a month: 1.2% of hammer plus any AI listing tools you used',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-white/80">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col items-center gap-4">
                <Button asChild variant="secondary" size="lg" className="bg-white text-purple-700 hover:bg-white/90 shadow-xl h-16 px-10 rounded-2xl text-lg">
                  <Link href="/signup">
                    Apply Now
                    <ArrowUpRight className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
                <p className="text-white/40 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Applying is free. Every application is reviewed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
