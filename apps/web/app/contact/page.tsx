import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Clock3, Mail, MapPin, type LucideIcon } from 'lucide-react'
import { LegalHero, LegalLink, LegalPlaceholder } from '@/components/legal/legal-page'
import { MAILING_ADDRESS, SUPPORT_EMAIL } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: 'Contact | Imagine This Auction',
  description: 'How to reach Imagine This Auction support. We respond within one business day.',
}

interface ContactMethod {
  icon: LucideIcon
  label: string
  value: ReactNode
  /** Secondary line under the value; rendered as a second `<dd>`. */
  note?: ReactNode
}

const CONTACT_METHODS: ContactMethod[] = [
  {
    icon: Mail,
    label: 'Email',
    value: (
      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-600 hover:text-indigo-700">
        {SUPPORT_EMAIL}
      </a>
    ),
    note: 'Include your invoice or delivery number if your question is about a specific order.',
  },
  {
    icon: Clock3,
    label: 'Response time',
    value: 'Within one business day',
    note: 'Monday through Friday, excluding US federal holidays.',
  },
  {
    icon: MapPin,
    label: 'Mailing address',
    value: (
      <>
        Imagine This Auction
        <br />
        <LegalPlaceholder value={MAILING_ADDRESS} />
      </>
    ),
  },
]

export default function ContactPage() {
  return (
    <div className="relative overflow-hidden">
      <LegalHero badge="Support" title="Contact Us">
        <p className="mt-4 max-w-2xl text-lg text-white/70">
          Questions about a bid, an invoice, a delivery, or an auctioneer application: we answer every message within one business day.
        </p>
      </LegalHero>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.06)] lg:p-10">
            {/*
              A description list may contain only dt/dd (optionally grouped in
              a div), so the icon lives inside the <dt> and the secondary line
              is a second <dd> rather than a stray <p>.
            */}
            <dl className="space-y-8">
              {CONTACT_METHODS.map(({ icon: Icon, label, value, note }) => (
                <div key={label} className="relative pl-[4.25rem]">
                  <dt className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {label}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
                  {note && <dd className="mt-1 text-sm text-slate-600">{note}</dd>}
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-10 space-y-4 leading-relaxed text-slate-600">
            <p>
              <strong className="text-slate-900">Problem with an item you won?</strong> Contact the auctioneer first; you can reach them from the auction page or your invoice. If that does not resolve it, email us and we will mediate. See the{' '}
              <LegalLink href="/refunds">Refund Policy</LegalLink>.
            </p>
            <p>
              <strong className="text-slate-900">Want to sell on the platform?</strong> Create an account and{' '}
              <LegalLink href="/become-auctioneer">submit your auctioneer license</LegalLink>. Pricing is on the{' '}
              <LegalLink href="/pricing">pricing page</LegalLink>.
            </p>
            <p>
              <strong className="text-slate-900">Want to drive for us?</strong> See{' '}
              <LegalLink href="/drive">Drive for us</LegalLink>.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
