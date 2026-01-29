import Link from 'next/link'
import {
  Sparkles,
  ShieldCheck,
  Layers,
  Clock3,
  Gem,
  Globe2,
  ArrowUpRight,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const featureHighlights = [
  {
    title: 'Curated Luxury Auctions',
    description:
      'Partnered with premiere auctioneers to showcase investment-grade art, design, and collectibles ready to be discovered.',
    icon: Gem,
  },
  {
    title: 'Concierge Escrow & Protection',
    description:
      'Funds flow through our dual-verification escrow, pairing instant wallet settlement with human concierge oversight.',
    icon: ShieldCheck,
  },
  {
    title: 'Intelligent Bid Engine',
    description:
      'Proxy bidding with anti-sniping extensions keeps every closing moment fair, thrilling, and fully transparent.',
    icon: Clock3,
  },
]

const heroStats = [
  {
    label: 'Auction houses onboarded',
    value: '32',
  },
  {
    label: 'Average lot sell-through',
    value: '94%',
  },
  {
    label: 'Top hammer price this month',
    value: '$820K',
  },
  {
    label: 'Anti-sniping extensions triggered',
    value: '418',
  },
]

const experienceMoments = [
  {
    title: 'Global access without compromise',
    description:
      'Bid live from Monaco, Miami, or your penthouse lounge—ImagineThisAuction is crafted for discerning collectors worldwide.',
    icon: Globe2,
  },
  {
    title: 'Credits that feel like currency',
    description:
      'Stripe-backed ITC credits settle instantly, unlock private sales, and let you move quickly on the lots that matter.',
    icon: Wallet,
  },
  {
    title: 'Insight-first dashboards',
    description:
      'Elegantly designed dashboards surface what matters most—real-time standings, balances, clienteling signals, and more.',
    icon: Layers,
  },
]

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <section className="relative isolate px-4 pt-24 pb-16 sm:px-6 lg:px-8 lg:pt-32">
        <div className="absolute left-[5%] top-[-8rem] h-72 w-72 rounded-full bg-indigo-300/30 blur-[160px]" />
        <div className="absolute right-[0] top-16 h-64 w-64 rounded-full bg-purple-300/30 blur-[180px]" />
        <div className="mx-auto max-w-6xl text-center">
          <Badge className="mx-auto mb-6 bg-gradient-to-r from-indigo-500 to-purple-500 text-xs uppercase tracking-[0.3em]">
            Luxury auctions, reimagined
          </Badge>
          <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
            The high-end marketplace for modern collectors &amp; auctioneers
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            ImagineThisAuction pairs couture-level presentation with real-time bidding tech—bridging auction house heritage and
            next-gen marketplace velocity.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">Join the marketplace</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="backdrop-blur">
              <Link href="/auctions">Explore live auctions</Link>
            </Button>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-3xl border border-white/60 bg-white/70 p-6 text-left shadow-[0_20px_50px_rgba(79,70,229,0.12)] backdrop-blur"
              >
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                  {stat.label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          {featureHighlights.map((feature) => (
            <Card key={feature.title} className="h-full border-white/70 bg-white/80">
              <CardHeader className="p-8 pb-4">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/90 to-purple-500/90 text-white shadow-md">
                  <feature.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-[1.55rem]">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-8 pt-0 text-base text-slate-600">
                {feature.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl grid gap-12 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="secondary" className="bg-white/80 text-xs uppercase tracking-[0.25em] text-slate-600">
              Why collectors stay
            </Badge>
            <h2 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              A gallery-grade experience with the velocity of a modern marketplace.
            </h2>
            <p className="text-lg text-slate-600">
              Every detail is curated—from cinematic lot reveals to concierge-supported settlement. ImagineThisAuction empowers
              auction houses to host immersive digital sales without sacrificing their signature touch.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {experienceMoments.map((moment) => (
                <div
                  key={moment.title}
                  className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_18px_40px_rgba(79,70,229,0.1)] backdrop-blur"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600">
                    <moment.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-base font-semibold text-slate-900">{moment.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{moment.description}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="relative overflow-hidden border-white/70 bg-gradient-to-br from-white/90 via-white/70 to-white/60 p-10">
            <div className="absolute -right-10 top-16 h-48 w-48 rounded-full bg-indigo-300/20 blur-[140px]" />
            <div className="relative">
              <Badge variant="outline" className="border-indigo-200 bg-white/40 text-indigo-600">
                Trusted Seller Journey
              </Badge>
              <h3 className="mt-6 text-2xl font-semibold text-slate-900">
                Launch your high-end catalogue in hours—not months.
              </h3>
              <ul className="mt-6 space-y-4 text-slate-600">
                <li className="flex items-start gap-3">
                  <Sparkles className="mt-1 h-5 w-5 text-indigo-500" />
                  <span>White-glove onboarding for your brand, catalogue, and payments.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 text-indigo-500" />
                  <span>Enterprise-grade fraud signals with human concierge verification.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Layers className="mt-1 h-5 w-5 text-indigo-500" />
                  <span>Role-specific workspaces for auctioneers, bidders, finance, and admins.</span>
                </li>
              </ul>
              <Button asChild className="mt-8 inline-flex items-center gap-2" size="lg">
                <Link href="/become-auctioneer">
                  Become an auction partner
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <section className="relative px-4 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Card className="relative overflow-hidden border-white/70 bg-gradient-to-br from-indigo-600 to-purple-600 p-10 text-white shadow-[0_30px_80px_rgba(79,70,229,0.3)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_60%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl space-y-3">
                <h3 className="text-3xl font-semibold lg:text-4xl">
                  Elevate your next catalogue launch.
                </h3>
                <p className="text-base text-indigo-100">
                  ImagineThisAuction is the platform preferred by auction houses designing for the next decade of collectors.
                  Let&apos;s craft your signature digital saleroom.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="outline" className="bg-white/10 text-white hover:bg-white/20">
                  <Link href="/demo">Book a private demo</Link>
                </Button>
                <Button asChild size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50">
                  <Link href="/contact">Speak with our team</Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}
