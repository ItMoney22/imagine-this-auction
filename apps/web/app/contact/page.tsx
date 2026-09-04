import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock3, Mail, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = {
  title: 'Contact | Imagine This Auction',
  description: 'How to reach Imagine This Auction support. We respond within one business day.',
}

const SUPPORT_EMAIL = 'support@imaginethisauction.com'

export default function ContactPage() {
  return (
    <div className="relative overflow-hidden">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f0520] via-[#1a0b3e] to-[#0f0520] py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] top-[20%] h-[400px] w-[400px] rounded-full bg-purple-600/20 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Badge className="mb-6 border border-white/20 bg-white/10 px-5 py-2 text-[11px] tracking-[0.25em] text-white/90 backdrop-blur-md">
            Support
          </Badge>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Contact Us
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Questions about a bid, an invoice, a delivery, or an auctioneer application: we answer every message within one business day.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.06)] lg:p-10">
            <dl className="space-y-8">
              <div className="flex gap-5">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Email</dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="text-lg font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      {SUPPORT_EMAIL}
                    </a>
                    <p className="mt-1 text-sm text-slate-600">
                      Include your invoice or delivery number if your question is about a specific order.
                    </p>
                  </dd>
                </div>
              </div>

              <div className="flex gap-5">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Response time</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">Within one business day</dd>
                  <p className="mt-1 text-sm text-slate-600">Monday through Friday, excluding US federal holidays.</p>
                </div>
              </div>

              <div className="flex gap-5">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <dt className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Mailing address</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">
                    Imagine This Auction
                    <br />
                    [MAILING ADDRESS]
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="mt-10 space-y-4 text-slate-600 leading-relaxed">
            <p>
              <strong className="text-slate-900">Problem with an item you won?</strong> Contact the auctioneer first; their details are on your invoice. If that does not resolve it, email us and we will mediate. See the{' '}
              <Link href="/refunds" className="font-medium text-indigo-600 hover:text-indigo-700">Refund Policy</Link>.
            </p>
            <p>
              <strong className="text-slate-900">Want to sell on the platform?</strong> Create an account and{' '}
              <Link href="/become-auctioneer" className="font-medium text-indigo-600 hover:text-indigo-700">submit your auctioneer license</Link>. Pricing is on the{' '}
              <Link href="/pricing" className="font-medium text-indigo-600 hover:text-indigo-700">pricing page</Link>.
            </p>
            <p>
              <strong className="text-slate-900">Want to drive for us?</strong> See{' '}
              <Link href="/drive" className="font-medium text-indigo-600 hover:text-indigo-700">Drive for us</Link>.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
