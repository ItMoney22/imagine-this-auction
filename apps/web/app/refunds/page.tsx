import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = {
  title: 'Refund Policy | Imagine This Auction',
  description:
    'When a winning-bid charge or a delivery fee is refunded on Imagine This Auction, and how to request one.',
}

const LAST_UPDATED = 'September 4, 2026'

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-slate-100 pt-10 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl font-bold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4 text-slate-600 leading-relaxed">{children}</div>
    </section>
  )
}

export default function RefundsPage() {
  return (
    <div className="relative overflow-hidden">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f0520] via-[#1a0b3e] to-[#0f0520] py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] top-[20%] h-[400px] w-[400px] rounded-full bg-purple-600/20 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Badge className="mb-6 border border-white/20 bg-white/10 px-5 py-2 text-[11px] tracking-[0.25em] text-white/90 backdrop-blur-md">
            Legal
          </Badge>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Refund Policy
          </h1>
          <p className="mt-4 text-white/70">Last updated {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <p className="text-lg leading-relaxed text-slate-600">
            A bidder&apos;s card is charged only for lots the bidder has won. Because a winning bid is a binding purchase, those charges are final except in the cases described below. Delivery fees follow their own rules, also below.
          </p>

          <div className="mt-14 space-y-10">
            <Section id="charges" title="1. What you are charged">
              <p>
                When you win a lot, the card you keep on file is charged the hammer price, the auctioneer&apos;s stated buyer&apos;s premium, sales tax where the auctioneer collects it, and shipping or local delivery if you chose it. The amount is shown on your invoice. Charges for won lots are final except as set out in Section 2.
              </p>
            </Section>

            <Section id="exceptions" title="2. When a winning-bid charge is refunded">
              <p>
                <strong className="text-slate-900">Item not as described.</strong> If the item you receive is materially different from its listing, contact the auctioneer within 7 days of receiving it. The auctioneer&apos;s contact details are on your invoice. If the auctioneer confirms the problem, you will be refunded to the original card once the item is returned as the auctioneer directs, or without a return if the auctioneer waives it. If you and the auctioneer cannot agree, either of you may ask ITA to mediate as described in our{' '}
                <Link href="/terms#disputes" className="font-medium text-indigo-600 hover:text-indigo-700">Terms of Service</Link>.
              </p>
              <p>
                <strong className="text-slate-900">Auctioneer cancels.</strong> If the auctioneer cancels the sale after you have won, for example because the item is withdrawn or cannot be fulfilled, you receive a full refund of everything charged for that lot.
              </p>
              <p>
                <strong className="text-slate-900">Duplicate charge.</strong> If your card is charged more than once for the same invoice, email support@imaginethisauction.com with the invoice number. The duplicate is refunded to the original card, normally within 5 business days of our confirming it.
              </p>
              <p>
                Refunds are issued to the card that was charged. Depending on your bank, a refund can take 5 to 10 business days to appear on your statement.
              </p>
            </Section>

            <Section id="chargebacks" title="3. Chargebacks">
              <p>
                Please contact the auctioneer and then ITA before disputing a charge with your card issuer. We can usually resolve the problem faster than a dispute can. A chargeback filed against a valid winning-bid charge, without first using the process above, may result in your account being suspended and the amount being referred for collection. We will provide the bid history, listing, and invoice to the card network in response to a dispute.
              </p>
            </Section>

            <Section id="delivery" title="4. Delivery fee refunds">
              <p>
                Local delivery is an Imagine This Auction service, and its fee is charged separately from the lot.
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-slate-900">Before pickup:</strong> cancel any time before the driver has picked up the package for a full refund of the delivery fee.
                </li>
                <li>
                  <strong className="text-slate-900">After pickup:</strong> the request goes to admin review. If the delivery failed for reasons within our control, such as a driver no-show or damage in transit, the fee is refunded in full. If it failed because the delivery address was inaccurate or no one was available to receive the package, the fee may be refunded in part or not at all, and a redelivery fee may apply.
                </li>
                <li>
                  <strong className="text-slate-900">Damage or loss:</strong> claims must be reported within 48 hours of the recorded delivery time and are paid up to the declared value, as described in our Terms of Service.
                </li>
              </ul>
            </Section>

            <Section id="auctioneers" title="5. Auctioneer statements">
              <p>
                Platform fees and AI tool charges on an auctioneer&apos;s monthly statement are not refundable, except for billing errors. If you believe a statement is wrong, email support@imaginethisauction.com within 30 days of the statement date with the statement and the lots in question.
              </p>
            </Section>

            <Section id="request" title="6. How to request a refund">
              <p>
                Email support@imaginethisauction.com with the invoice or delivery number, the card&apos;s last four digits, and a short description of the problem. We respond within one business day. You can also reach us through our{' '}
                <Link href="/contact" className="font-medium text-indigo-600 hover:text-indigo-700">contact page</Link>.
              </p>
            </Section>
          </div>
        </div>
      </section>
    </div>
  )
}
