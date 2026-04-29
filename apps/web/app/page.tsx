import Link from 'next/link'
import Image from 'next/image'
import {
  Sparkles,
  ShieldCheck,
  Clock3,
  Globe2,
  ArrowUpRight,
  ArrowRight,
  Wallet,
  ChevronRight,
  Gavel,
  Timer,
  TrendingUp,
  Users,
  Search,
  Zap,
  DollarSign,
  BarChart3,
  CheckCircle2,
  XCircle,
  Star,
  CreditCard,
  Layers,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'

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

function formatCurrency(amountInDollars: number): string {
  return `$${amountInDollars.toLocaleString()}`
}

interface DisplayLot {
  id: string
  title: string
  subtitle?: string
  category: string
  currentBid: number
  bids: number
  endsIn: string
  image: string
}

const placeholderLots: DisplayLot[] = [
  { id: 'p-1', title: 'Vintage Film Camera Collection', subtitle: 'Includes 3 working cameras', category: 'Electronics', currentBid: 125, bids: 8, endsIn: '2h 14m', image: '/lots/camera-vintage.webp' },
  { id: 'p-2', title: 'Classic Vinyl Records Bundle', subtitle: '20+ records from the 60s-80s', category: 'Music', currentBid: 85, bids: 12, endsIn: '4h 32m', image: '/lots/vinyl-records.webp' },
  { id: 'p-3', title: 'Handcrafted Oak Rocking Chair', subtitle: 'Restored antique, circa 1920', category: 'Furniture', currentBid: 275, bids: 5, endsIn: '1d 6h', image: '/lots/rocking-chair.webp' },
  { id: 'p-4', title: 'Signed Sports Memorabilia', subtitle: 'Authenticated baseball collection', category: 'Sports', currentBid: 450, bids: 15, endsIn: '5h 48m', image: '/lots/sports-memorabilia.webp' },
  { id: 'p-5', title: 'Vintage Toy Train Set', subtitle: 'Complete with tracks & accessories', category: 'Toys', currentBid: 195, bids: 9, endsIn: '3h 22m', image: '/lots/vintage-toys.webp' },
  { id: 'p-6', title: 'Handmade Pottery Collection', subtitle: 'Local artisan, 6-piece set', category: 'Home & Garden', currentBid: 75, bids: 6, endsIn: '8h 15m', image: '/lots/pottery-handmade.webp' },
]

function LotCard({ lot }: { lot: DisplayLot }) {
  return (
    <Link href={`/lots/${lot.id}`} className="group relative block">
      <div className="relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-[0_8px_40px_rgba(0,0,0,0.06)] transition-all duration-500 hover:shadow-[0_20px_60px_rgba(76,29,149,0.15)] hover:-translate-y-2 hover:border-purple-200/60">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
          <Image src={lot.image} alt={lot.title} fill className="object-cover transition-transform duration-700 group-hover:scale-110" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-4 left-4">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] bg-white/90 backdrop-blur-md text-slate-800 shadow-lg">{lot.category}</span>
          </div>
          <div className="absolute top-4 right-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          </div>
          <div className="absolute bottom-4 left-4 right-4 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
            <button className="w-full py-3 rounded-xl bg-white/95 backdrop-blur-md text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-white transition-colors">
              <Gavel className="w-4 h-4" />
              Place Bid
            </button>
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-display text-lg font-semibold text-slate-900 leading-tight line-clamp-1 group-hover:text-purple-700 transition-colors">{lot.title}</h3>
          {lot.subtitle && <p className="mt-1 text-sm text-slate-600 line-clamp-1">{lot.subtitle}</p>}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Current Bid</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(lot.currentBid)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Ends In</p>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-purple-600">
                <Timer className="w-3.5 h-3.5" />
                {lot.endsIn}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs text-slate-600">
            <TrendingUp className="w-3 h-3 mr-1" />
            {lot.bids} bids
          </div>
        </div>
      </div>
    </Link>
  )
}

const comparisonRows = [
  { feature: 'Monthly Software Fee', us: 'Free', them: '$95 - $295/mo', usWins: true },
  { feature: 'Per-Auction Fee', us: 'Free', them: '$25 - $125/auction', usWins: true },
  { feature: 'Per-Bid Fee', us: 'Free', them: '$0.25/bid', usWins: true },
  { feature: 'Platform Commission', us: '1.2%', them: '2% of GMV', usWins: true },
  { feature: 'Webcast Setup Fee', us: 'Free', them: '$25/auction', usWins: true },
  { feature: 'Credit Card Auth Fee', us: 'Free', them: '$1/auth', usWins: true },
  { feature: 'Listing Fee', us: 'Free', them: '$195/listing', usWins: true },
]

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
      currentBid: lot.current_high_bid / 100,
      bids: lot.bid_count,
      endsIn: calculateTimeRemaining(lot.auctions.ends_at),
      image: firstImage,
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
                The Future of Auctions Is Here
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
              Zero monthly fees. No per-auction charges. Just 1.2% when you sell.
              The most auctioneer-friendly platform ever built.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-start gap-4 mt-10 animate-fade-in-up">
              <Button asChild size="lg" className="text-base px-8 h-14 rounded-2xl shadow-xl shadow-purple-500/30">
                <Link href="/signup">
                  Start Selling Free
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

            {/* Trust Signals */}
            <div className="flex flex-wrap items-center gap-8 mt-14 animate-fade-in">
              {[
                { value: '1.2%', label: 'Commission' },
                { value: '$0', label: 'Monthly Fee' },
                { value: '$0', label: 'Per Auction' },
                { value: '24/7', label: 'Support' },
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

      {/* ===== SOCIAL PROOF BAR ===== */}
      <section className="relative -mt-1 bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#4c1d95] py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-center">
            {[
              { icon: Users, text: 'Trusted by 120+ Auctioneers' },
              { icon: Gavel, text: '5,000+ Successful Auctions' },
              { icon: ShieldCheck, text: 'Secure Escrow Payments' },
              { icon: Star, text: '98% Satisfaction Rate' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 text-white/90 text-sm font-medium">
                <item.icon className="w-4 h-4 text-purple-300" />
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY AUCTIONEERS SWITCH ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-6 text-[10px] tracking-[0.2em]">
              <DollarSign className="w-3 h-3 mr-1" />
              Save Thousands Every Month
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-display font-bold text-slate-900 leading-tight">
              Why Auctioneers Are
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> Making the Switch</span>
            </h2>
            <p className="mt-6 text-lg text-slate-600">
              An auctioneer doing $50K/month in sales saves over <strong className="text-slate-900">$845/month</strong> compared to the leading platform. That&apos;s $10,000+ back in your pocket every year.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="max-w-4xl mx-auto">
            <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
              {/* Header */}
              <div className="grid grid-cols-3 bg-slate-900 text-white">
                <div className="p-6 font-semibold text-sm uppercase tracking-wider text-white/80">Feature</div>
                <div className="p-6 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Image src="/images/logo-mark.webp" alt="ImagineThis" width={28} height={28} className="rounded-lg" />
                    <span className="font-bold text-lg">ImagineThis</span>
                  </div>
                </div>
                <div className="p-6 text-center">
                  <span className="font-bold text-lg text-white/80">HiBid / AuctionFlex</span>
                </div>
              </div>

              {/* Rows */}
              {comparisonRows.map((row, i) => (
                <div key={row.feature} className={`grid grid-cols-3 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'} ${i < comparisonRows.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="p-5 flex items-center text-sm font-medium text-slate-700">{row.feature}</div>
                  <div className="p-5 flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <span className="font-bold text-emerald-700 text-sm">{row.us}</span>
                  </div>
                  <div className="p-5 flex items-center justify-center gap-2">
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <span className="text-slate-500 text-sm">{row.them}</span>
                  </div>
                </div>
              ))}

              {/* Bottom CTA */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 text-center">
                <p className="text-white/80 text-sm mb-3">Ready to keep more of your revenue?</p>
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
                We stripped away the bloat and built a platform that does one thing exceptionally well: help you run profitable auctions.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: Gavel, title: 'Live & Timed Auctions', desc: 'Run both formats seamlessly' },
                  { icon: CreditCard, title: 'Instant Payouts', desc: 'Get paid as soon as items ship' },
                  { icon: BarChart3, title: 'Real-Time Analytics', desc: 'Track every bid and buyer' },
                  { icon: Smartphone, title: 'Mobile-First Bidding', desc: 'Bidders join from any device' },
                  { icon: ShieldCheck, title: 'Escrow Protection', desc: 'Funds held until delivery' },
                  { icon: Layers, title: 'Bulk Lot Upload', desc: 'Import hundreds of lots fast' },
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
              Live in Minutes, Not Weeks
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              From sign-up to your first live auction in under 10 minutes. No onboarding calls, no setup fees, no contracts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { number: '01', title: 'Sign Up Free', description: 'Create your auctioneer account in 60 seconds. No credit card required.', icon: Users },
              { number: '02', title: 'List Your Lots', description: 'Upload items individually or in bulk. Add photos, descriptions, and starting bids.', icon: Search },
              { number: '03', title: 'Go Live', description: 'Launch your auction and watch bids roll in from our community of active buyers.', icon: Gavel },
              { number: '04', title: 'Get Paid', description: 'Funds released to you automatically when buyers confirm receipt. Simple.', icon: Wallet },
            ].map((step, i) => (
              <div key={step.number} className="relative group">
                {i < 3 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-full h-px bg-gradient-to-r from-purple-300 to-transparent" />
                )}
                <div className="relative p-8 rounded-3xl bg-white backdrop-blur-sm border border-slate-200 shadow-[0_8px_40px_rgba(0,0,0,0.06)] transition-all duration-500 hover:shadow-[0_20px_60px_rgba(76,29,149,0.1)] hover:-translate-y-1">
                  <span className="inline-block text-6xl font-display font-bold text-slate-100 mb-4 select-none">{step.number}</span>
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
                  The Math Doesn&apos;t Lie
                </Badge>
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white leading-tight mb-6">
                  See how much you&apos;d save switching to ImagineThis.
                </h2>
                <p className="text-lg text-white/60 mb-8">
                  Real numbers from a real auctioneer doing $50K/month in gross merchandise value.
                </p>
                <Button asChild variant="secondary" size="lg" className="bg-white text-slate-900 hover:bg-white/90 shadow-xl rounded-2xl h-14 px-8">
                  <Link href="/signup">
                    Claim Your Savings
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>

              <div className="space-y-6">
                {/* Their Cost */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <p className="text-sm font-semibold uppercase tracking-wider text-red-400 mb-3">With HiBid / AuctionFlex</p>
                  <div className="space-y-2 text-white/70 text-sm">
                    <div className="flex justify-between"><span>Software fee</span><span>$145/mo</span></div>
                    <div className="flex justify-between"><span>Per-auction fees (4 auctions)</span><span>$300/mo</span></div>
                    <div className="flex justify-between"><span>2% GMV on $50K</span><span>$1,000/mo</span></div>
                    <div className="flex justify-between pt-2 border-t border-white/10 text-white font-bold text-lg">
                      <span>Total</span><span className="text-red-400">$1,445/mo</span>
                    </div>
                  </div>
                </div>

                {/* Our Cost */}
                <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
                  <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-3">With ImagineThis</p>
                  <div className="space-y-2 text-white/70 text-sm">
                    <div className="flex justify-between"><span>Software fee</span><span className="text-emerald-400">$0</span></div>
                    <div className="flex justify-between"><span>Per-auction fees</span><span className="text-emerald-400">$0</span></div>
                    <div className="flex justify-between"><span>1.2% GMV on $50K</span><span>$600/mo</span></div>
                    <div className="flex justify-between pt-2 border-t border-white/10 text-white font-bold text-lg">
                      <span>Total</span><span className="text-emerald-400">$600/mo</span>
                    </div>
                  </div>
                </div>

                {/* Savings */}
                <div className="text-center p-4 rounded-2xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/20">
                  <p className="text-white/60 text-sm">You save</p>
                  <p className="text-4xl font-display font-bold text-white">$845<span className="text-lg text-white/60">/mo</span></p>
                  <p className="text-purple-300 text-sm font-medium">$10,140 per year back in your pocket</p>
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
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
                {transformedLots.length > 0 ? 'Live Now' : 'Sample Listings'}
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900">
                {transformedLots.length > 0 ? 'Happening Right Now' : 'Sample Listings'}
              </h2>
              <p className="mt-2 text-slate-600 max-w-lg">
                {transformedLots.length > 0
                  ? 'Jump into active auctions and start bidding. New items added daily.'
                  : 'Preview the marketplace experience while live inventory is being prepared.'}
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
                Discover unique items from local auctioneers and community sellers. Bid in real-time, set your max, and win amazing deals.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: Globe2, title: 'Bid From Anywhere', desc: 'Join auctions from your couch or on the go' },
                  { icon: Clock3, title: 'Anti-Sniping', desc: 'Fair bidding with automatic time extensions' },
                  { icon: ShieldCheck, title: 'Buyer Protection', desc: 'Escrow holds funds until you confirm receipt' },
                  { icon: Sparkles, title: 'Curated Finds', desc: 'Quality items from vetted auctioneers' },
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
                  Limited Time Offer
                </Badge>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight">
                  Become a Founding Auctioneer
                </h2>
                <p className="mt-6 text-lg text-white/70 max-w-xl">
                  Lock in our 1.2% commission rate <strong className="text-white">for life</strong>. As we grow, rates will increase for new sign-ups — but founding auctioneers keep this rate forever.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    '1.2% commission locked forever',
                    'Priority support & dedicated account manager',
                    'Early access to new features',
                    '"Founding Auctioneer" badge on your profile',
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
                    Apply Now — It&apos;s Free
                    <ArrowUpRight className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
                <p className="text-white/40 text-sm">No credit card required</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
