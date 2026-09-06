import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  CheckCircle2,
  Gavel,
  Zap,
  Clock3,
  Smartphone,
  Layers,
  DollarSign,
  ArrowUpRight,
  Package,
  CreditCard,
  Receipt,
  Truck,
  BadgeCheck,
  FileCheck,
  Landmark,
  Camera,
  Banknote,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { computePremiumCents, computeTotalCents, formatUsd } from '@/lib/pricing/premium'
import { ITA_PRICING } from '@/lib/pricing/competitors'

// Worked example for the "what you pay" card. The math is the same function
// the lot page and the invoice use, so the example can never drift from it.
const EXAMPLE_HAMMER_CENTS = 10_000
const EXAMPLE_PREMIUM_PCT = 10
const examplePremiumCents = computePremiumCents(EXAMPLE_HAMMER_CENTS, EXAMPLE_PREMIUM_PCT)
const exampleTotalCents = computeTotalCents(EXAMPLE_HAMMER_CENTS, EXAMPLE_PREMIUM_PCT)

export default function HowItWorksPage() {
  return (
    <div className="relative overflow-hidden">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f0520] via-[#1a0b3e] to-[#0f0520] py-28 lg:py-36">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] top-[20%] h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute right-[5%] bottom-[10%] h-[400px] w-[400px] rounded-full bg-indigo-500/15 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <Badge className="mb-6 bg-white/10 text-white/90 border border-white/20 backdrop-blur-md px-5 py-2 text-[11px] tracking-[0.25em]">
            <Zap className="w-3.5 h-3.5 mr-2 text-yellow-400" />
            Every Fee, On Every Lot, Before You Bid
          </Badge>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold leading-[0.95] tracking-tight text-white">
            How It
            <span className="block bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Works
            </span>
          </h1>
          <p className="mt-8 text-xl lg:text-2xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            Bidders keep a card on file and pay only when they win. Auctioneers sell on their own merchant
            account and pay one small platform fee a month. Here is each step.
          </p>
        </div>
      </section>

      {/* ===== FOR BIDDERS ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-indigo-100 text-indigo-700">
              For Bidders
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-display font-bold text-slate-900 leading-tight">
              Register, Bid, Win.
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> Pay Only If You Win.</span>
            </h2>
          </div>

          {/* Step 1 - Register with a card */}
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative overflow-hidden rounded-3xl">
                <Image src="/images/bidder-mobile.webp" alt="Bidding from your phone" width={900} height={506} className="object-cover w-full" sizes="(max-width: 1024px) 100vw, 50vw" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <CreditCard className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">01</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Register With a Card</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Create a free account and put a card on file. Nothing is charged when you register or when you
                bid. The card is only charged if you win. Then browse lots from licensed auctioneers, with photos,
                descriptions, and the buyer&apos;s premium shown on every one.
              </p>
              <ul className="space-y-3">
                {['Free to register, free to bid', 'Licensed auctioneers, reviewed before listing', 'Photos and descriptions on every lot'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Step 2 - Bid */}
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
            <div className="order-2 lg:order-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <Gavel className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">02</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Place Your Bid</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Bid the next increment, or set a maximum and let proxy bidding raise you only as far as it has to.
                Every lot tells you the buyer&apos;s premium and your all-in total for the bid on screen. A bid placed
                near the close extends the auction, so no one wins by being last instead of highest.
              </p>
              <ul className="space-y-3">
                {['Total shown before you bid', 'Proxy bidding up to your maximum', 'Anti-sniping time extensions', 'Bid from any device'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 lg:order-2 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative p-10 lg:p-12 rounded-3xl bg-gradient-to-br from-slate-900 via-[#1a0b3e] to-slate-900 overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
                <div className="relative">
                  <Receipt className="w-12 h-12 text-yellow-400 mb-6" />
                  <h4 className="text-2xl font-display font-bold text-white mb-3">What you pay if you win</h4>
                  <p className="text-white/70 mb-8">
                    Example lot with a {EXAMPLE_PREMIUM_PCT}% buyer&apos;s premium. The auctioneer sets the premium
                    for each auction; the exact figure is on every lot page.
                  </p>
                  <div className="space-y-3 text-sm tabular-nums">
                    <div className="flex justify-between text-white/80">
                      <span>Winning bid (hammer)</span>
                      <span>{formatUsd(EXAMPLE_HAMMER_CENTS)}</span>
                    </div>
                    <div className="flex justify-between text-white/80">
                      <span>Buyer&apos;s premium, {EXAMPLE_PREMIUM_PCT}%</span>
                      <span>{formatUsd(examplePremiumCents)}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-white/10 text-white font-bold text-lg">
                      <span>Charged to your card</span>
                      <span>{formatUsd(exampleTotalCents)}</span>
                    </div>
                  </div>
                  <p className="mt-6 text-xs text-white/50">
                    Shipping or local delivery, if you choose it, is arranged after the sale and quoted separately.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 - Win */}
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative overflow-hidden rounded-3xl">
                <Image src="/images/luxury-items.webp" alt="Auction items" width={900} height={506} className="object-cover w-full" sizes="(max-width: 1024px) 100vw, 50vw" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <Banknote className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">03</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Win and Get Charged Once</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                When the auction closes with you on top, your card on file is charged the hammer price plus the
                auctioneer&apos;s buyer&apos;s premium, the same total you saw before bidding. You get an invoice
                showing exactly how it adds up.
              </p>
              <ul className="space-y-3">
                {['Charged only if you win', 'Hammer price plus the disclosed premium, nothing added', 'Itemized invoice in your account'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Step 4 - Pick up, ship, or local delivery */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <Package className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">04</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Pick Up, Ship, or Local Delivery</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Collect your lot during the auctioneer&apos;s pickup window, have it shipped, or book local delivery
                and a vetted contractor driver brings it to your door with tracking along the way.
              </p>
              <ul className="space-y-3">
                {['Pickup windows set by the auctioneer', 'Pick up, ship, or local delivery, as the auctioneer sets it up', 'Local delivery by vetted drivers, tracked to your door'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 lg:order-2 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative overflow-hidden rounded-3xl">
                <Image src="/images/package-delivery.webp" alt="Receiving your auction win" width={900} height={506} className="object-cover w-full" sizes="(max-width: 1024px) 100vw, 50vw" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOR AUCTIONEERS ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-purple-100 text-purple-700">
              For Auctioneers
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-display font-bold text-slate-900 leading-tight">
              List, Sell, Get Paid.
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> On Your Own Account.</span>
            </h2>
          </div>

          {/* Auctioneer Steps */}
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-3xl blur-2xl opacity-20 scale-95" />
              <div className="relative overflow-hidden rounded-3xl">
                <Image src="/images/auctioneer-listing.webp" alt="Auctioneer preparing lots" width={900} height={506} className="object-cover w-full" sizes="(max-width: 1024px) 100vw, 50vw" />
              </div>
            </div>
            <div>
              <div className="space-y-8">
                {[
                  { num: '01', icon: UserPlus, title: 'Apply', desc: 'Tell us about your business and your auctioneer license. Applying is free.' },
                  { num: '02', icon: FileCheck, title: 'Get Approved', desc: 'We review every application before you can list.' },
                  { num: '03', icon: Landmark, title: 'Connect Your PaymentCloud Merchant Account', desc: 'Winning bidders are charged through your own merchant account, so the money is yours from the moment it settles.' },
                  { num: '04', icon: Camera, title: 'List Your Lots', desc: 'Photograph each item and AI Quick List drafts the title and description for you to approve. Or upload a CSV. Set opening bids, increments, reserves, and your buyer’s premium.' },
                  { num: '05', icon: Gavel, title: 'Sell', desc: 'Run a timed online auction. Proxy bidding, anti-sniping extensions, and bid notifications are built in.' },
                  { num: '06', icon: Banknote, title: 'Paid Straight to Your Bank', desc: `Hammer plus the buyer’s premium settles to your bank from PaymentCloud. At month end we send one statement: ${ITA_PRICING.foundingCommissionPct}% of hammer, plus any AI listing tools you chose to use, billed per use.` },
                ].map((step) => (
                  <div key={step.num} className="flex gap-5">
                    <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                      <step.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-900 mb-1">
                        <span className="text-purple-400 mr-2">{step.num}</span>
                        {step.title}
                      </h4>
                      <p className="text-slate-600 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-6 text-[10px] tracking-[0.2em]">
              <DollarSign className="w-3 h-3 mr-1" />
              Pricing
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-display font-bold text-slate-900 leading-tight">
              Every fee, on every lot,
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> before you bid.</span>
            </h2>
            <p className="mt-6 text-lg text-slate-600">
              Bidders pay the hammer plus the auctioneer&apos;s premium. Auctioneers pay{' '}
              {ITA_PRICING.foundingCommissionPct}% of hammer, plus any AI listing tools they choose to use,
              billed per use on the same monthly statement.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Bidder Pricing */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
              <div className="p-8 lg:p-10">
                <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-indigo-100 text-indigo-700">
                  For Bidders
                </Badge>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-display font-bold text-slate-900">Free</span>
                  <span className="text-slate-600">to register and bid</span>
                </div>
                <p className="text-slate-600 mb-8">
                  Free to register and bid. You pay the hammer price plus the auctioneer&apos;s buyer&apos;s premium,
                  typically 10%, shown on every lot.
                </p>
                <ul className="space-y-4">
                  {[
                    'Card on file, charged only when you win',
                    'Buyer’s premium set by the auctioneer and shown on every lot',
                    'No monthly fees',
                    'No bidding fees',
                    'Pick up, ship, or local delivery',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-slate-700">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild size="lg" className="w-full mt-8 rounded-2xl h-14">
                  <Link href="/signup">
                    Register to Bid
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Auctioneer Pricing */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-purple-500 bg-white shadow-[0_20px_60px_rgba(76,29,149,0.12)]">
              <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-500 to-indigo-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-bl-xl">
                Founding Rate
              </div>
              <div className="p-8 lg:p-10">
                <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-purple-100 text-purple-700">
                  For Auctioneers
                </Badge>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-display font-bold text-slate-900">{ITA_PRICING.foundingCommissionPct}%</span>
                  <span className="text-slate-600">of hammer</span>
                </div>
                <p className="text-slate-600 mb-8">
                  {ITA_PRICING.foundingCommissionPct}% of hammer, founding rate locked for life. No monthly,
                  listing, per-bid, or webcast fees. Processing through your own merchant account.
                </p>
                <ul className="space-y-4">
                  {[
                    'No monthly software fees',
                    'No listing fees',
                    'No per-bid fees',
                    'No webcast fees',
                    'You keep the buyer’s premium',
                    `One monthly statement: ${ITA_PRICING.foundingCommissionPct}% of hammer plus any AI listing tools you used`,
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-slate-700">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild size="lg" className="w-full mt-8 rounded-2xl h-14">
                  <Link href="/signup">
                    Apply as Auctioneer
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-slate-500 max-w-2xl mx-auto">
            The standard platform fee is {ITA_PRICING.standardCommissionPct}% of hammer. Founding auctioneers keep{' '}
            {ITA_PRICING.foundingCommissionPct}% for as long as they sell here.
          </p>
        </div>
      </section>

      {/* ===== PLATFORM FEATURES ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge className="mb-4 bg-slate-900 text-white text-[10px] tracking-[0.2em]">
              Platform Features
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900">
              Built for Serious Auctions
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: CreditCard, title: 'Card on File', desc: 'Bidders register a card once. It is charged only when they win, for the total they saw before bidding.' },
              { icon: Clock3, title: 'Anti-Sniping', desc: 'Automatic time extensions when a bid lands near the close, so the lot sells at its true price.' },
              { icon: BadgeCheck, title: 'Licensed Auctioneers', desc: 'Every auctioneer is reviewed before they can list.' },
              { icon: Smartphone, title: 'Mobile-First', desc: 'Full bidding experience on any device. No app download needed.' },
              { icon: Layers, title: 'AI Quick List and CSV Upload', desc: 'Draft a catalog from photos, or bring one in from a spreadsheet.' },
              { icon: Truck, title: 'Local Delivery', desc: 'Vetted contractor drivers deliver won lots locally, with tracking for the buyer and the auctioneer.' },
            ].map((feature) => (
              <div key={feature.title} className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20 mb-4">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#4338ca] p-12 lg:p-20 text-white shadow-2xl shadow-purple-500/30">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                backgroundSize: '32px 32px',
              }} />
            </div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <div className="relative text-center max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight mb-6">
                Ready to Get Started?
              </h2>
              <p className="text-lg text-white/80 mb-10">
                Register with a card and start bidding, or apply to sell at the founding{' '}
                {ITA_PRICING.foundingCommissionPct}% rate.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" variant="secondary" className="bg-white text-purple-700 hover:bg-white/90 shadow-xl h-14 px-8 rounded-2xl text-base">
                  <Link href="/signup">
                    Register to Bid
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 h-14 px-8 rounded-2xl text-base backdrop-blur-sm">
                  <Link href="/signup">
                    Apply as Auctioneer
                    <ArrowUpRight className="w-4 h-4 ml-2" />
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
