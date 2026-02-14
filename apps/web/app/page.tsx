import Link from 'next/link'
import Image from 'next/image'
import {
  Sparkles,
  ShieldCheck,
  Clock3,
  Heart,
  Globe2,
  ArrowUpRight,
  Wallet,
  Play,
  ChevronRight,
  Gavel,
  Timer,
  TrendingUp,
  Users,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'

type Auction = Database['public']['Tables']['auctions']['Row']
type Lot = Database['public']['Tables']['lots']['Row']

interface LotWithAuction extends Lot {
  auction: Pick<Auction, 'ends_at' | 'title' | 'status'>
}

// Placeholder lots for when database is empty - using the new accessible images
const placeholderLots = [
  {
    id: 'placeholder-1',
    title: 'Vintage Film Camera Collection',
    subtitle: 'Includes 3 working cameras',
    category: 'Electronics',
    currentBid: 125,
    estimateLow: 100,
    estimateHigh: 200,
    bids: 8,
    endsIn: '2h 14m',
    image: '/lots/camera-vintage.webp',
    featured: true,
  },
  {
    id: 'placeholder-2',
    title: 'Classic Vinyl Records Bundle',
    subtitle: '20+ records from the 60s-80s',
    category: 'Music',
    currentBid: 85,
    estimateLow: 50,
    estimateHigh: 150,
    bids: 12,
    endsIn: '4h 32m',
    image: '/lots/vinyl-records.webp',
  },
  {
    id: 'placeholder-3',
    title: 'Handcrafted Oak Rocking Chair',
    subtitle: 'Restored antique, circa 1920',
    category: 'Furniture',
    currentBid: 275,
    estimateLow: 200,
    estimateHigh: 400,
    bids: 5,
    endsIn: '1d 6h',
    image: '/lots/rocking-chair.webp',
    hero: true,
  },
  {
    id: 'placeholder-4',
    title: 'Signed Sports Memorabilia',
    subtitle: 'Authenticated baseball collection',
    category: 'Sports',
    currentBid: 450,
    estimateLow: 300,
    estimateHigh: 600,
    bids: 15,
    endsIn: '5h 48m',
    image: '/lots/sports-memorabilia.webp',
  },
  {
    id: 'placeholder-5',
    title: 'Vintage Toy Train Set',
    subtitle: 'Complete with tracks & accessories',
    category: 'Toys',
    currentBid: 195,
    estimateLow: 150,
    estimateHigh: 300,
    bids: 9,
    endsIn: '3h 22m',
    image: '/lots/vintage-toys.webp',
  },
  {
    id: 'placeholder-6',
    title: 'Handmade Pottery Collection',
    subtitle: 'Local artisan, 6-piece set',
    category: 'Home & Garden',
    currentBid: 75,
    estimateLow: 60,
    estimateHigh: 120,
    bids: 6,
    endsIn: '8h 15m',
    image: '/lots/pottery-handmade.webp',
  },
]

const processSteps = [
  {
    number: '01',
    title: 'Browse',
    description: 'Explore unique finds from local sellers and community auctions',
    icon: Search,
  },
  {
    number: '02',
    title: 'Join',
    description: 'Create your free account in seconds and start bidding right away',
    icon: Users,
  },
  {
    number: '03',
    title: 'Bid',
    description: 'Place bids in real-time or set your maximum and let us bid for you',
    icon: Gavel,
  },
  {
    number: '04',
    title: 'Win',
    description: 'Celebrate your win and arrange easy pickup or delivery',
    icon: Heart,
  },
]

const stats = [
  { value: '5K+', label: 'Happy Bidders' },
  { value: '120+', label: 'Local Sellers' },
  { value: '98%', label: 'Satisfaction Rate' },
  { value: '24/7', label: 'Support Available' },
]

// Format dollars with ITC equivalent (100 ITC = $1)
function formatCurrency(amountInDollars: number): string {
  const itc = Math.round(amountInDollars * 100)
  const dollarStr = amountInDollars >= 1000
    ? `$${(amountInDollars / 1000).toFixed(amountInDollars >= 10000 ? 0 : 1)}K`
    : `$${amountInDollars.toLocaleString()}`
  return `${dollarStr} (${itc.toLocaleString()} ITC)`
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

interface DisplayLot {
  id: string
  title: string
  subtitle?: string
  category: string
  currentBid: number
  estimateLow: number
  estimateHigh: number
  bids: number
  endsIn: string
  image: string
  featured?: boolean
  hero?: boolean
}

function LotCard({ lot, index }: { lot: DisplayLot; index: number }) {
  return (
    <Link
      href={`/lots/${lot.id}`}
      className="group relative block"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="lot-card relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-[0_8px_40px_rgba(0,0,0,0.06)] transition-all duration-500 hover:shadow-[0_20px_60px_rgba(234,88,12,0.15)] hover:-translate-y-2 hover:border-orange-200/60">
        {/* Image Container */}
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
          <Image
            src={lot.image}
            alt={lot.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-110"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />

          {/* Overlay Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          {/* Category Badge */}
          <div className="absolute top-4 left-4">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] bg-white/90 backdrop-blur-md text-slate-800 shadow-lg">
              {lot.category}
            </span>
          </div>

          {/* Live Badge */}
          <div className="absolute top-4 right-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          </div>

          {/* Quick Bid Button - Appears on Hover */}
          <div className="absolute bottom-4 left-4 right-4 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
            <button className="w-full py-3 rounded-xl bg-white/95 backdrop-blur-md text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-white transition-colors">
              <Gavel className="w-4 h-4" />
              Place Bid
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="font-display text-lg font-semibold text-slate-900 leading-tight line-clamp-1 group-hover:text-orange-600 transition-colors">
            {lot.title}
          </h3>
          {lot.subtitle && (
            <p className="mt-1 text-sm text-slate-500 line-clamp-1">{lot.subtitle}</p>
          )}

          {/* Pricing */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Current Bid</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCurrency(lot.currentBid)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Ends In</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-orange-600">
                  <Timer className="w-3.5 h-3.5" />
                  {lot.endsIn}
                </p>
              </div>
            </div>

            {/* Bid Count & Estimate */}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {lot.bids} bids
              </span>
              <span>Est. {formatCurrency(lot.estimateLow)} - {formatCurrency(lot.estimateHigh)}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function HeroLotCard({ lot }: { lot: DisplayLot }) {
  return (
    <Link href={`/lots/${lot.id}`} className="group relative block">
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 aspect-[16/10] lg:aspect-[21/9]">
        <Image
          src={lot.image}
          alt={lot.title}
          fill
          className="object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105"
          priority
          sizes="100vw"
        />

        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-8 lg:p-12">
          <div className="max-w-2xl">
            {/* Badges */}
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-[0.2em] bg-white/10 backdrop-blur-md text-white border border-white/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Auction
              </span>
              <span className="inline-flex items-center px-4 py-2 rounded-full text-xs font-bold uppercase tracking-[0.2em] bg-orange-500/90 text-white">
                Featured
              </span>
            </div>

            {/* Title */}
            <h2 className="text-3xl lg:text-5xl font-display font-bold text-white leading-tight mb-2">
              {lot.title}
            </h2>
            {lot.subtitle && (
              <p className="text-lg lg:text-xl text-white/70 mb-6">{lot.subtitle}</p>
            )}

            {/* Stats Row */}
            <div className="flex flex-wrap items-center gap-6 lg:gap-10 mb-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-1">Current Bid</p>
                <p className="text-3xl lg:text-4xl font-bold text-white tabular-nums">{formatCurrency(lot.currentBid)}</p>
              </div>
              <div className="h-12 w-px bg-white/20" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-1">Estimate</p>
                <p className="text-lg text-white/90">{formatCurrency(lot.estimateLow)} - {formatCurrency(lot.estimateHigh)}</p>
              </div>
              <div className="h-12 w-px bg-white/20" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-1">Time Remaining</p>
                <p className="text-lg text-orange-400 font-semibold flex items-center gap-2">
                  <Timer className="w-4 h-4" />
                  {lot.endsIn}
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <Button size="lg" className="bg-white text-slate-900 hover:bg-white/90 shadow-2xl">
                <Gavel className="w-4 h-4 mr-2" />
                Place Bid Now
              </Button>
              <Button size="lg" variant="outline" className="border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20">
                View Details
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>

        {/* Bid Count Badge */}
        <div className="absolute top-6 right-6 lg:top-8 lg:right-8">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">{lot.bids} bids</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default async function Home() {
  // Fetch real data from database
  const supabase = await createClient()

  // Fetch live auctions with their lots
  const { data: liveAuctions } = await supabase
    .from('auctions')
    .select('id, title, ends_at, status')
    .eq('status', 'live')
    .order('ends_at', { ascending: true })
    .limit(5)

  // Fetch lots from live auctions
  let dbLots: LotWithAuction[] = []
  if (liveAuctions && liveAuctions.length > 0) {
    const auctionIds = liveAuctions.map(a => a.id)
    const { data: lotsData } = await supabase
      .from('lots')
      .select('*, auction:auctions!inner(ends_at, title, status)')
      .in('auction_id', auctionIds)
      .eq('is_sold', false)
      .order('bid_count', { ascending: false })
      .limit(10)

    if (lotsData) {
      dbLots = lotsData as unknown as LotWithAuction[]
    }
  }

  // Transform database lots to display format
  const transformedLots: DisplayLot[] = dbLots.map((lot, index) => {
    // Parse images - it's stored as a JSON string in the database
    let firstImage = '/lots/pottery-handmade.webp'
    try {
      const imagesData = lot.images
      if (typeof imagesData === 'string') {
        const parsed = JSON.parse(imagesData)
        if (Array.isArray(parsed) && parsed.length > 0) {
          firstImage = parsed[0]
        }
      } else if (Array.isArray(imagesData) && imagesData.length > 0) {
        firstImage = imagesData[0]
      }
    } catch {
      // Use default image on parse error
    }

    return {
      id: lot.id,
      title: lot.title,
      subtitle: lot.description?.substring(0, 50) || undefined,
      category: lot.category || 'General',
      currentBid: lot.current_high_bid / 100, // Convert cents to dollars
      estimateLow: (lot.estimate_low || lot.starting_bid) / 100,
      estimateHigh: (lot.estimate_high || lot.starting_bid * 2) / 100,
      bids: lot.bid_count,
      endsIn: calculateTimeRemaining(lot.auction.ends_at),
      image: firstImage,
      featured: index === 0,
      hero: index === 0,
    }
  })

  // Use database lots if available, otherwise use placeholders
  const displayLots = transformedLots.length > 0 ? transformedLots : placeholderLots
  const heroLot = displayLots.find(lot => lot.hero) || displayLots[0]
  const regularLots = displayLots.filter(lot => lot.id !== heroLot.id).slice(0, 5)

  return (
    <div className="relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[20%] top-0 h-[800px] w-[800px] rounded-full bg-gradient-to-br from-orange-200/40 via-amber-200/30 to-transparent blur-[120px] animate-float-slow" />
        <div className="absolute -right-[10%] top-[20%] h-[600px] w-[600px] rounded-full bg-gradient-to-bl from-teal-100/30 via-emerald-100/20 to-transparent blur-[100px] animate-float-slower" />
        <div className="absolute left-[30%] bottom-0 h-[500px] w-[500px] rounded-full bg-gradient-to-t from-orange-100/40 to-transparent blur-[80px]" />
      </div>

      {/* ========== HERO SECTION ========== */}
      <section className="relative px-4 pt-8 pb-16 sm:px-6 lg:px-8 lg:pt-12">
        <div className="mx-auto max-w-7xl">
          {/* Eyebrow */}
          <div className="text-center mb-8 animate-fade-in">
            <Badge className="mx-auto bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white border-0 px-5 py-2 text-[11px] tracking-[0.25em] shadow-lg">
              <Sparkles className="w-3.5 h-3.5 mr-2" />
              Your Community Auction Marketplace
            </Badge>
          </div>

          {/* Main Headline */}
          <div className="text-center max-w-5xl mx-auto mb-12 animate-fade-in-up">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold leading-[1.1] tracking-tight text-slate-900">
              Discover Treasures,
              <span className="block bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-500 bg-clip-text text-transparent">
                Create Memories
              </span>
            </h1>
            <p className="mt-6 text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Find unique items from your neighbors, local sellers, and community auctions.
              Real-time bidding, fair prices, and the thrill of the win - all in one friendly place.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in-up">
            <Button asChild size="lg" className="text-base px-8 h-14 rounded-2xl shadow-xl shadow-orange-500/25 bg-orange-600 hover:bg-orange-700">
              <Link href="/auctions">
                <Play className="w-4 h-4 mr-2" />
                Explore Auctions
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base px-8 h-14 rounded-2xl">
              <Link href="/signup">
                Join Free Today
                <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>

          {/* Hero Lot */}
          <div className="animate-fade-in-up">
            <HeroLotCard lot={heroLot} />
          </div>
        </div>
      </section>

      {/* ========== STATS BAR ========== */}
      <section className="relative px-4 py-12 sm:px-6 lg:px-8 border-y border-slate-200/60 bg-white/40 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl lg:text-5xl font-display font-bold text-slate-900 tabular-nums">{stat.value}</p>
                <p className="mt-2 text-sm font-medium uppercase tracking-[0.15em] text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FEATURED LOTS GRID ========== */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
            <div>
              <Badge variant="secondary" className="mb-4 text-[10px] tracking-[0.2em] bg-orange-100 text-orange-700">
                Currently Bidding
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900">
                Popular Finds
              </h2>
              <p className="mt-2 text-slate-600 max-w-lg">
                Check out what your community is bidding on right now. New items added daily!
              </p>
            </div>
            <Button asChild variant="outline" className="self-start sm:self-auto">
              <Link href="/lots">
                View All Items
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>

          {/* Lots Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {regularLots.map((lot, i) => (
              <LotCard key={lot.id} lot={lot} index={i} />
            ))}
          </div>

          {/* Empty State */}
          {displayLots.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No live auctions right now</h3>
              <p className="text-slate-600 mb-6">Check back soon - new auctions are added regularly!</p>
              <Button asChild>
                <Link href="/signup">Get Notified When Auctions Go Live</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50/80 to-white/40">
        <div className="mx-auto max-w-7xl">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge className="mb-4 bg-slate-900 text-white text-[10px] tracking-[0.2em]">
              Simple & Easy
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900">
              Start Bidding in Minutes
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Whether you&apos;re a seasoned collector or just looking for unique finds, getting started is a breeze.
            </p>
          </div>

          {/* Process Steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {processSteps.map((step, i) => (
              <div key={step.number} className="relative group">
                {/* Connector Line */}
                {i < processSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-full h-px bg-gradient-to-r from-orange-300 to-transparent" />
                )}

                <div className="relative p-8 rounded-3xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-[0_8px_40px_rgba(0,0,0,0.04)] transition-all duration-500 hover:shadow-[0_20px_60px_rgba(234,88,12,0.1)] hover:-translate-y-1">
                  {/* Number */}
                  <span className="inline-block text-6xl font-display font-bold text-slate-100 mb-4 select-none">
                    {step.number}
                  </span>

                  {/* Icon */}
                  <div className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
                    <step.icon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== VALUE PROPS ========== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Content */}
            <div>
              <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-orange-100 text-orange-700">
                Why Choose Us
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 leading-tight mb-6">
                A friendly place to find amazing deals and hidden gems.
              </h2>
              <p className="text-lg text-slate-600 mb-10">
                We believe everyone deserves access to great auctions. No stuffy atmosphere here -
                just real people, real items, and real savings. Join our growing community today!
              </p>

              {/* Feature Cards */}
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: Globe2, title: 'Bid Anywhere', desc: 'Join auctions from your couch' },
                  { icon: Wallet, title: 'Fair Prices', desc: 'You set the price with your bid' },
                  { icon: Clock3, title: 'Anti-Sniping', desc: 'Everyone gets a fair chance' },
                  { icon: ShieldCheck, title: 'Secure & Safe', desc: 'Protected payments always' },
                ].map((feature) => (
                  <div key={feature.title} className="flex gap-4 p-4 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/60">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                      <feature.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">{feature.title}</h4>
                      <p className="text-sm text-slate-500">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - CTA Card */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative p-10 lg:p-12 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-orange-500/20 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-3xl" />

                <div className="relative">
                  <Badge className="mb-6 bg-white/10 text-white border border-white/20 text-[10px] tracking-[0.2em]">
                    Sell With Us
                  </Badge>
                  <h3 className="text-2xl lg:text-3xl font-display font-bold mb-4">
                    Have items to sell? We make it easy.
                  </h3>
                  <ul className="space-y-4 mb-8">
                    {[
                      'Simple listing process - be live in minutes',
                      'Reach thousands of local buyers',
                      'Secure payments deposited to your account',
                      'Friendly support every step of the way',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span className="text-white/80">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-white/90 shadow-xl">
                    <Link href="/become-auctioneer">
                      Start Selling Today
                      <ArrowUpRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-12 lg:p-20 text-white shadow-2xl shadow-orange-500/30">
            {/* Decorative Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                backgroundSize: '32px 32px',
              }} />
            </div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="max-w-2xl">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight">
                  Ready to find your next treasure?
                </h2>
                <p className="mt-4 text-lg text-white/80">
                  Join thousands of happy bidders discovering amazing deals every day. Your next favorite find is waiting!
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="bg-white text-orange-700 hover:bg-white/90 shadow-xl h-14 px-8 rounded-2xl text-base">
                  <Link href="/signup">
                    Get Started Free
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 h-14 px-8 rounded-2xl text-base backdrop-blur-sm">
                  <Link href="/auctions">
                    Browse Auctions
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
