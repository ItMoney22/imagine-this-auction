import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  CheckCircle2,
  Gavel,
  Search,
  Users,
  Zap,
  Clock3,
  Smartphone,
  BarChart3,
  Layers,
  DollarSign,
  Star,
  Wallet,
  ShieldCheck,
  ArrowUpRight,
  Package,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
            Simple, Transparent, Powerful
          </Badge>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold leading-[0.95] tracking-tight text-white">
            How It
            <span className="block bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Works
            </span>
          </h1>
          <p className="mt-8 text-xl lg:text-2xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            Whether you&apos;re bidding on treasures or selling your inventory, we&apos;ve made every step effortless.
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
              Find, Bid, Win.
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> That Simple.</span>
            </h2>
          </div>

          {/* Step 1 - Browse */}
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
                  <Search className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">01</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Browse & Discover</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Explore live auctions from verified auctioneers. Filter by category, price range, or ending soon. Every item has detailed photos, descriptions, and condition reports.
              </p>
              <ul className="space-y-3">
                {['Live and timed auctions', 'Verified auctioneers only', 'Detailed item descriptions & photos'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Step 2 - Load ITC */}
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
            <div className="order-2 lg:order-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <Zap className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">02</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Load ITC Credits for Instant Bids</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Pre-load your wallet with ITC credits and bid instantly — no payment delays, no missed lots. When seconds count in a live auction, ITC gives you the speed advantage.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { amount: '100 ITC', price: '$9.99', bonus: '' },
                  { amount: '275 ITC', price: '$24.99', bonus: '10% bonus' },
                  { amount: '600 ITC', price: '$49.99', bonus: '20% bonus' },
                  { amount: '1,300 ITC', price: '$99.99', bonus: '30% bonus' },
                ].map((pack) => (
                  <div key={pack.amount} className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 transition-colors">
                    <p className="text-lg font-bold text-slate-900">{pack.amount}</p>
                    <p className="text-sm text-slate-600">{pack.price}</p>
                    {pack.bonus && <span className="inline-block mt-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{pack.bonus}</span>}
                  </div>
                ))}
              </div>
              <ul className="space-y-3">
                {['Instant bid placement — no checkout delays', 'Bonus credits on larger packs', 'Secure, encrypted transactions'].map((item) => (
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
                <div className="relative text-center">
                  <Zap className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
                  <h4 className="text-2xl font-display font-bold text-white mb-3">Speed = Wins</h4>
                  <p className="text-white/70 mb-8">Pre-loaded ITC credits let you bid the instant you see the right item. No fumbling with payment forms while someone else snags your lot.</p>
                  <div className="flex items-center justify-center gap-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-white">0.1s</p>
                      <p className="text-xs text-white/50 uppercase tracking-wider mt-1">ITC Bid Time</p>
                    </div>
                    <div className="h-12 w-px bg-white/20" />
                    <div className="text-center">
                      <p className="text-3xl font-bold text-red-400">30s+</p>
                      <p className="text-xs text-white/50 uppercase tracking-wider mt-1">Card Checkout</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 - Bid */}
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
                  <Gavel className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">03</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Place Your Bid</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Bid with confidence. Set your maximum and we&apos;ll autobid for you, or go manual for the thrill. Anti-sniping protection means everyone gets a fair shot.
              </p>
              <ul className="space-y-3">
                {['Automatic proxy bidding', 'Anti-sniping time extensions', 'Real-time bid notifications', 'Bid from any device'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Step 4 - Win & Receive */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <Package className="w-6 h-6" />
                </div>
                <span className="text-7xl font-display font-bold text-slate-100 select-none">04</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-slate-900 mb-4">Win & Receive</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Won an item? Payment is handled instantly from your ITC balance. Your funds are held in escrow until you confirm receipt — so you&apos;re always protected.
              </p>
              <ul className="space-y-3">
                {['Instant payment from ITC balance', 'Escrow protection until delivery confirmed', 'Invoices and shipping tracking', 'Rate your experience'].map((item) => (
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
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> Zero Overhead.</span>
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
              <div className="space-y-10">
                {[
                  { num: '01', icon: Users, title: 'Sign Up & Get Approved', desc: 'Create your auctioneer account with your business details. Our team verifies your credentials quickly so you can start selling.' },
                  { num: '02', icon: Layers, title: 'List Your Lots', desc: 'Upload items individually or in bulk. Add high-quality photos, detailed descriptions, starting bids, and estimates.' },
                  { num: '03', icon: Gavel, title: 'Run Your Auction', desc: 'Go live and watch bids roll in. Our platform handles all bidding logic, anti-sniping, and real-time notifications.' },
                  { num: '04', icon: Wallet, title: 'Get Paid Automatically', desc: 'When buyers confirm receipt, funds are released from escrow directly to you. Just 1.2% platform commission.' },
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
              Transparent Pricing
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-display font-bold text-slate-900 leading-tight">
              No Hidden Fees.
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent"> Ever.</span>
            </h2>
            <p className="mt-6 text-lg text-slate-600">
              We only make money when you make money. It&apos;s that simple.
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
                  <span className="text-5xl font-display font-bold text-slate-900">10%</span>
                  <span className="text-slate-600">buyer&apos;s premium</span>
                </div>
                <p className="text-slate-600 mb-8">Only charged when you win an item. That&apos;s it.</p>
                <ul className="space-y-4">
                  {[
                    'Free to sign up',
                    'Free to browse & bid',
                    'No monthly fees',
                    'No bidding fees',
                    'Escrow protection included',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-slate-700">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild size="lg" className="w-full mt-8 rounded-2xl h-14">
                  <Link href="/signup">
                    Start Bidding Free
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Auctioneer Pricing */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-purple-500 bg-white shadow-[0_20px_60px_rgba(76,29,149,0.12)]">
              <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-500 to-indigo-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-bl-xl">
                Best Value
              </div>
              <div className="p-8 lg:p-10">
                <Badge variant="secondary" className="mb-6 text-[10px] tracking-[0.2em] bg-purple-100 text-purple-700">
                  For Auctioneers
                </Badge>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-display font-bold text-slate-900">1.2%</span>
                  <span className="text-slate-600">platform commission</span>
                </div>
                <p className="text-slate-600 mb-8">Only charged when your item sells. Nothing else.</p>
                <ul className="space-y-4">
                  {[
                    'No monthly software fees',
                    'No per-auction charges',
                    'No per-bid fees',
                    'No listing fees',
                    'No setup or onboarding costs',
                    'Founding rate locked for life',
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
              { icon: ShieldCheck, title: 'Escrow Payments', desc: 'Funds held securely until buyer confirms receipt. Both sides protected.' },
              { icon: Clock3, title: 'Anti-Sniping', desc: 'Automatic time extensions prevent last-second bid manipulation.' },
              { icon: Users, title: 'Verified Auctioneers', desc: 'Every auctioneer is vetted with proper licensing and credentials.' },
              { icon: Smartphone, title: 'Mobile-First', desc: 'Full bidding experience on any device. No app download needed.' },
              { icon: BarChart3, title: 'Real-Time Analytics', desc: 'Track bids, views, and engagement on every lot in real time.' },
              { icon: TrendingUp, title: 'Smart Bid Increments', desc: 'Automatic bid increments based on current price for fair progression.' },
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
                Join thousands of bidders and auctioneers already using the most affordable auction platform on the market.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" variant="secondary" className="bg-white text-purple-700 hover:bg-white/90 shadow-xl h-14 px-8 rounded-2xl text-base">
                  <Link href="/signup">
                    Start Bidding Free
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
