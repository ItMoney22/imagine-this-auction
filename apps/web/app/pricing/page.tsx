import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { COMPETITOR_CAPTION, COMPETITOR_ROWS } from '@/lib/pricing/competitors'

export const metadata: Metadata = {
  title: 'Pricing | Imagine This Auction',
  description:
    'Free for bidders. Auctioneers pay 1.2% of hammer at the founding rate, billed monthly, with no monthly, listing, per-bid, per-auction, or webcast fees.',
}

const BIDDER_POINTS = [
  'Free to register and free to bid',
  'Keep a card on file; it is charged only when you win',
  'No monthly fee, no per-bid fee, no registration fee',
]

const BIDDER_WIN_COSTS = [
  { label: 'Hammer price', detail: 'Your winning bid.' },
  {
    label: "Buyer's premium",
    detail: "Set and kept by the auctioneer, typically 10%. It is stated on every lot before you bid.",
  },
  { label: 'Sales tax', detail: 'Where the auctioneer collects it.' },
  { label: 'Shipping or local delivery', detail: 'Only if you choose it.' },
]

const AUCTIONEER_POINTS = [
  '$0 monthly fee',
  '$0 listing fee',
  '$0 per-bid fee',
  '$0 per-auction fee',
  '$0 webcast fee',
  'You set and keep the buyer’s premium',
]

export default function PricingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f0520] via-[#1a0b3e] to-[#0f0520] py-24 lg:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] top-[20%] h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute right-[5%] bottom-[10%] h-[400px] w-[400px] rounded-full bg-indigo-500/15 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <Badge className="mb-6 border border-white/20 bg-white/10 px-5 py-2 text-[11px] tracking-[0.25em] text-white/90 backdrop-blur-md">
            <DollarSign className="mr-2 h-3.5 w-3.5 text-yellow-400" />
            Transparent Pricing
          </Badge>
          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight text-white sm:text-6xl">
            Pricing
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/80">
            Bidders never pay us a fee. Auctioneers pay a small percentage of what they sell, and nothing else.
          </p>
        </div>
      </section>

      {/* ===== TWO COLUMNS ===== */}
      <section className="relative bg-gradient-to-b from-slate-50 to-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
          {/* Bidders */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <div className="p-8 lg:p-10">
              <Badge variant="secondary" className="mb-6 bg-indigo-100 text-[10px] tracking-[0.2em] text-indigo-700">
                For Bidders
              </Badge>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-display text-5xl font-bold text-slate-900">Free</span>
                <span className="text-slate-600">to register and bid</span>
              </div>
              <p className="mb-8 text-slate-600">
                Keep a card on file. We charge it only when you win.
              </p>
              <ul className="space-y-3">
                {BIDDER_POINTS.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <h2 className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                What you pay when you win
              </h2>
              <dl className="mt-4 divide-y divide-slate-100">
                {BIDDER_WIN_COSTS.map((cost) => (
                  <div key={cost.label} className="py-3">
                    <dt className="font-semibold text-slate-900">{cost.label}</dt>
                    <dd className="mt-0.5 text-sm text-slate-600">{cost.detail}</dd>
                  </div>
                ))}
              </dl>

              <Button asChild size="lg" className="mt-8 h-14 w-full rounded-2xl">
                <Link href="/signup">
                  Start Bidding Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Auctioneers */}
          <div className="relative overflow-hidden rounded-3xl border-2 border-purple-500 bg-white shadow-[0_20px_60px_rgba(76,29,149,0.12)]">
            <div className="absolute right-0 top-0 rounded-bl-xl bg-gradient-to-l from-purple-500 to-indigo-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
              Founding Rate
            </div>
            <div className="p-8 lg:p-10">
              <Badge variant="secondary" className="mb-6 bg-purple-100 text-[10px] tracking-[0.2em] text-purple-700">
                For Auctioneers
              </Badge>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-display text-5xl font-bold text-slate-900">1.2%</span>
                <span className="text-slate-600">of hammer</span>
              </div>
              <p className="mb-2 text-slate-600">
                Founding rate, locked for life for accounts approved before the standard rate takes effect.
              </p>
              <p className="mb-8 text-sm text-slate-500">
                Standard rate: 2% of hammer.
              </p>
              <ul className="space-y-3">
                {AUCTIONEER_POINTS.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <h2 className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                How billing works
              </h2>
              <dl className="mt-4 divide-y divide-slate-100">
                <div className="py-3">
                  <dt className="font-semibold text-slate-900">Billed monthly</dt>
                  <dd className="mt-0.5 text-sm text-slate-600">
                    Your platform fee is totaled on a monthly statement and charged to your card on file.
                  </dd>
                </div>
                <div className="py-3">
                  <dt className="font-semibold text-slate-900">Your own merchant account</dt>
                  <dd className="mt-0.5 text-sm text-slate-600">
                    You process card payments through your own PaymentCloud merchant account at your negotiated rate. Buyer payments go to you, not through us.
                  </dd>
                </div>
                <div className="py-3">
                  <dt className="font-semibold text-slate-900">AI listing tools</dt>
                  <dd className="mt-0.5 text-sm text-slate-600">
                    Billed per use, in dollars, on the same monthly statement. See current AI tool prices in{' '}
                    <Link href="/org" className="font-medium text-indigo-600 hover:text-indigo-700">
                      your dashboard
                    </Link>
                    .
                  </dd>
                </div>
              </dl>

              <Button asChild size="lg" className="mt-8 h-14 w-full rounded-2xl">
                <Link href="/become-auctioneer">
                  Apply as Auctioneer
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMPARISON ===== */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
              How we compare
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              The same auction on Imagine This Auction versus HiBid, fee by fee.
            </p>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">{COMPETITOR_CAPTION}</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="px-6 py-4 font-semibold text-slate-500">
                    Fee
                  </th>
                  <th scope="col" className="px-6 py-4 font-semibold text-purple-700">
                    Imagine This Auction
                  </th>
                  <th scope="col" className="px-6 py-4 font-semibold text-slate-700">
                    HiBid
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPETITOR_ROWS.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row" className="px-6 py-4 font-medium text-slate-900">
                      {row.feature}
                    </th>
                    <td className="px-6 py-4 font-semibold text-slate-900">{row.ita}</td>
                    <td className="px-6 py-4 text-slate-600">{row.hibid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 px-2 text-xs text-slate-500">{COMPETITOR_CAPTION}</p>
        </div>
      </section>

      {/* ===== FINE PRINT ===== */}
      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch] text-sm leading-relaxed text-slate-500">
          <p>
            The buyer&apos;s premium is set by each auctioneer and disclosed on every lot. Sales tax is collected by the auctioneer where required. Local delivery is an Imagine This Auction service priced per delivery at booking. Full terms are in our{' '}
            <Link href="/terms" className="font-medium text-indigo-600 hover:text-indigo-700">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/refunds" className="font-medium text-indigo-600 hover:text-indigo-700">
              Refund Policy
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  )
}
