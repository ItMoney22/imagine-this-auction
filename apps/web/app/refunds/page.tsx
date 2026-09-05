import type { Metadata } from 'next'
import { LegalHero, LegalLink, LegalList, LegalSection, SupportEmailLink } from '@/components/legal/legal-page'
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_LABEL } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: 'Refund Policy | Imagine This Auction',
  description:
    'When a winning-bid charge or a delivery fee is refunded on Imagine This Auction, and how to request one.',
}

export default function RefundsPage() {
  return (
    <div className="relative overflow-hidden">
      <LegalHero
        badge="Legal"
        title="Refund Policy"
        lastUpdated={LEGAL_LAST_UPDATED}
        lastUpdatedLabel={LEGAL_LAST_UPDATED_LABEL}
      />

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <p className="text-lg leading-relaxed text-slate-600">
            A bidder&apos;s card is charged only for lots the bidder has won. Because a winning bid is a binding purchase, those charges are final except in the cases described below. Delivery fees follow their own rules, also below.
          </p>

          <div className="mt-14 space-y-10">
            <LegalSection id="charges" title="1. What you are charged">
              <p>
                When you win a lot, the card you keep on file is charged the hammer price, the auctioneer&apos;s stated buyer&apos;s premium, sales tax where the auctioneer collects it, and shipping or local delivery if you chose it. The amount is shown on your invoice. Charges for won lots are final except as set out in Section 2.
              </p>
            </LegalSection>

            <LegalSection id="exceptions" title="2. When a winning-bid charge is refunded">
              <p>
                <strong className="text-slate-900">Item not as described.</strong> If the item you receive is materially different from its listing, contact the auctioneer within 7 days of receiving it. You can reach the auctioneer from the auction page or your invoice. If the auctioneer confirms the problem, you will be refunded to the original card once the item is returned as the auctioneer directs, or without a return if the auctioneer waives it. If you and the auctioneer cannot agree, either of you may ask ITA to mediate as described in our{' '}
                <LegalLink href="/terms#disputes">Terms of Service</LegalLink>.
              </p>
              <p>
                <strong className="text-slate-900">Auctioneer cancels.</strong> If the auctioneer cancels the sale after you have won, for example because the item is withdrawn or cannot be fulfilled, you receive a full refund of everything charged for that lot.
              </p>
              <p>
                <strong className="text-slate-900">Duplicate charge.</strong> If your card is charged more than once for the same invoice, email <SupportEmailLink /> with the invoice number. The duplicate is refunded to the original card, normally within 5 business days of our confirming it.
              </p>
              <p>
                Refunds are issued to the card that was charged. Depending on your bank, a refund can take 5 to 10 business days to appear on your statement.
              </p>
            </LegalSection>

            <LegalSection id="chargebacks" title="3. Chargebacks">
              <p>
                Please contact the auctioneer and then ITA before disputing a charge with your card issuer. We can usually resolve the problem faster than a dispute can. A chargeback filed against a valid winning-bid charge, without first using the process above, may result in your account being suspended and the amount being referred for collection. We will provide the bid history, listing, and invoice to the card network in response to a dispute.
              </p>
            </LegalSection>

            <LegalSection id="delivery" title="4. Delivery fee refunds">
              <p>
                Local delivery is an Imagine This Auction service, and its fee is charged separately from the lot.
              </p>
              <LegalList
                items={[
                  <>
                    <strong className="text-slate-900">Before pickup:</strong> cancel any time before the driver has picked up the package for a full refund of the delivery fee.
                  </>,
                  <>
                    <strong className="text-slate-900">After pickup:</strong> the request goes to admin review. If the delivery failed for reasons within our control, such as a driver no-show or damage in transit, the fee is refunded in full. If it failed because the delivery address was inaccurate or no one was available to receive the package, the fee may be refunded in part or not at all, and a redelivery fee may apply.
                  </>,
                  <>
                    <strong className="text-slate-900">Damage or loss:</strong> claims must be reported within 48 hours of the recorded delivery time and are paid up to the declared value, as described in our Terms of Service.
                  </>,
                ]}
              />
            </LegalSection>

            <LegalSection id="auctioneers" title="5. Auctioneer statements">
              <p>
                Platform fees and AI tool charges on an auctioneer&apos;s monthly statement are not refundable, except for billing errors. If you believe a statement is wrong, email <SupportEmailLink /> within 30 days of the statement date with the statement and the lots in question.
              </p>
            </LegalSection>

            <LegalSection id="request" title="6. How to request a refund">
              <p>
                Email <SupportEmailLink /> with the invoice or delivery number, the card&apos;s last four digits, and a short description of the problem. We respond within one business day. You can also reach us through our{' '}
                <LegalLink href="/contact">contact page</LegalLink>.
              </p>
            </LegalSection>
          </div>
        </div>
      </section>
    </div>
  )
}
