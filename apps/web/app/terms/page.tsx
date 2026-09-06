import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  LegalHero,
  LegalLink,
  LegalList,
  LegalPlaceholder,
  LegalSection,
  SupportEmailLink,
} from '@/components/legal/legal-page'
import { GOVERNING_LAW_STATE, LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_LABEL } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: 'Terms of Service | Imagine This Auction',
  description:
    'The terms that govern bidding, selling, and local delivery on Imagine This Auction.',
}

/**
 * The sections in document order. The table of contents, every section
 * heading, and every "see Section N" cross-reference are rendered from this
 * list, with the number taken from the position, so none of them can drift.
 */
const SECTIONS = [
  { id: 'acceptance', title: 'Acceptance of these Terms' },
  { id: 'accounts', title: 'Accounts' },
  { id: 'bidders', title: 'Bidder terms' },
  { id: 'auctioneers', title: 'Auctioneer terms' },
  { id: 'conduct', title: 'Auction conduct' },
  { id: 'as-is', title: 'Items are sold as-is' },
  { id: 'disputes', title: 'Disputes' },
  { id: 'delivery', title: 'Local delivery service terms' },
  { id: 'prohibited', title: 'Prohibited items' },
  { id: 'liability', title: 'Limitation of liability' },
  { id: 'law', title: 'Governing law' },
  { id: 'changes', title: 'Changes to these Terms' },
  { id: 'contact', title: 'Contact' },
] as const satisfies ReadonlyArray<{ id: string; title: string }>

type SectionId = (typeof SECTIONS)[number]['id']

/** 1-based number of a section, from its position in SECTIONS. */
function sectionNumber(id: SectionId): number {
  return SECTIONS.findIndex((section) => section.id === id) + 1
}

/** The heading text of a section as it appears in both the TOC and the body. */
function sectionHeading(id: SectionId): string {
  const section = SECTIONS.find((candidate) => candidate.id === id)
  return `${sectionNumber(id)}. ${section?.title ?? id}`
}

function TermsSection({ id, children }: { id: SectionId; children: ReactNode }) {
  return (
    <LegalSection id={id} title={sectionHeading(id)}>
      {children}
    </LegalSection>
  )
}

export default function TermsPage() {
  return (
    <div className="relative overflow-hidden">
      <LegalHero
        badge="Legal"
        title="Terms of Service"
        lastUpdated={LEGAL_LAST_UPDATED}
        lastUpdatedLabel={LEGAL_LAST_UPDATED_LABEL}
      />

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <p className="text-lg leading-relaxed text-slate-600">
            These Terms of Service (the &ldquo;Terms&rdquo;) govern your use of imaginethisauction.com and the services offered through it (together, the &ldquo;Platform&rdquo;), operated by Imagine This Auction (&ldquo;ITA&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). Please read them carefully. They set out what bidders, auctioneers, and delivery customers agree to when they use the Platform.
          </p>

          <nav aria-label="Sections" className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Contents</p>
            <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-indigo-600 hover:text-indigo-700">
                    {sectionHeading(section.id)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-14 space-y-10">
            <TermsSection id="acceptance">
              <p>
                By creating an account, placing a bid, listing an item, booking a delivery, or otherwise using the Platform, you agree to these Terms and to our{' '}
                <LegalLink href="/privacy">Privacy Policy</LegalLink>. If you do not agree, do not use the Platform.
              </p>
              <p>
                You must be at least 18 years old and legally able to enter into a binding contract to use the Platform. If you use the Platform on behalf of a business, you represent that you are authorized to bind that business to these Terms.
              </p>
            </TermsSection>

            <TermsSection id="accounts">
              <LegalList
                items={[
                  'You must provide accurate, complete information when you register and keep it current.',
                  <>
                    You are responsible for everything that happens under your account and for keeping your login credentials confidential. Tell us immediately at <SupportEmailLink /> if you believe your account has been accessed without permission.
                  </>,
                  'One account per person or business. Auctioneer accounts are activated only after we review the licensing information you submit. Driver accounts are activated only after vetting.',
                  'We may suspend or close an account that violates these Terms, appears fraudulent, fails to pay amounts owed, or puts other users at risk.',
                ]}
              />
            </TermsSection>

            <TermsSection id="bidders">
              <p>
                <strong className="text-slate-900">Bids are binding.</strong> A bid is an offer to buy the lot at that amount. If you are the high bidder when a lot closes, you have bought the item and must complete the purchase. Bids cannot be retracted once placed. If you use a maximum (proxy) bid, the Platform places bids on your behalf up to that maximum and each of those bids is binding.
              </p>
              <p>
                <strong className="text-slate-900">Card on file.</strong> To bid you must keep a valid payment card on file. The card is tokenized by our payment processor; we never store full card numbers. You are responsible for keeping a working card on file while you have open bids or unpaid invoices.
              </p>
              <p>
                <strong className="text-slate-900">What you pay.</strong> When you win, you pay the hammer price plus:
              </p>
              <LegalList
                items={[
                  "the buyer's premium set by the auctioneer, which is stated on every lot before you bid (typically 10%);",
                  'sales tax where the auctioneer collects it; and',
                  'shipping or local delivery, if you choose it.',
                ]}
              />
              <p>
                <strong className="text-slate-900">Charging.</strong> After the auction closes, the winning bidder&apos;s card on file is charged the invoice total. By placing a bid you authorize that charge and any applicable delivery charge you book.
              </p>
              <p>
                <strong className="text-slate-900">Non-payment.</strong> If a charge fails, we and the auctioneer may retry the card, ask you for another payment method, cancel the sale, or relist the item. Failed charges may result in your account being suspended until the balance is paid. You remain responsible for the amount owed, and the auctioneer may pursue collection.
              </p>
            </TermsSection>

            <TermsSection id="auctioneers">
              <p>
                <strong className="text-slate-900">Your own merchant account.</strong> You process card payments from your buyers through your own merchant account with our payment partner at the rate you negotiated. You are the merchant of record for your sales and are responsible for your merchant agreement, for chargebacks on your sales, and for collecting and remitting any sales tax you owe.
              </p>
              <p>
                <strong className="text-slate-900">Accurate descriptions.</strong> You must describe every lot accurately and completely, including its condition, any known defects, provenance claims, the buyer&apos;s premium, reserve status, and your shipping, pickup, and return terms. Photos must be of the actual item.
              </p>
              <p>
                <strong className="text-slate-900">Fulfillment.</strong> You must deliver each sold item to its winning bidder in the condition described, within the time stated in the listing, and resolve buyer issues in good faith.
              </p>
              <p>
                <strong className="text-slate-900">Platform fee.</strong> ITA charges a platform fee on the hammer price of each lot you sell: 1.2% for founding accounts (accounts approved before the standard rate takes effect; this rate is locked for the life of the account) and 2% at the standard rate. There are no monthly, listing, per-bid, per-auction, or webcast fees. AI listing tools are billed per use, in dollars, at the prices shown in your dashboard at the time of use.
              </p>
              <p>
                <strong className="text-slate-900">Monthly statement.</strong> Platform fees and AI tool charges are totaled on a monthly statement and charged to the card you keep on file. If that charge fails, we may suspend your ability to list until the statement is paid.
              </p>
              <p>
                <strong className="text-slate-900">Licensing.</strong> You represent that you hold, and will maintain, every auctioneer license, permit, and bond required in each jurisdiction where you conduct auctions, and that you will provide proof on request. You are solely responsible for complying with the laws that apply to your auctions.
              </p>
            </TermsSection>

            <TermsSection id="conduct">
              <LegalList
                items={[
                  'Anti-sniping extension: a bid placed inside the closing window of a lot extends that lot’s closing time by the auction’s stated extension period (60 seconds unless the auctioneer sets otherwise) so other bidders can respond. Extensions can repeat until no further bids are placed.',
                  'Reserves: some lots carry a reserve price set by the auctioneer. Where a reserve is shown, the lot does not sell unless bidding reaches it.',
                  'The auctioneer may withdraw a lot or cancel an auction before it closes, and may reject a bid it reasonably believes is fraudulent or placed in bad faith.',
                  'Closing times are determined by our servers. We are not responsible for bids that do not reach us because of connectivity, device, or browser problems.',
                  'Shill bidding, collusion, bid manipulation, and the use of automated bidding tools other than the Platform’s own proxy bidding are prohibited and will result in account closure.',
                ]}
              />
            </TermsSection>

            <TermsSection id="as-is">
              <p>
                Every item is sold &ldquo;as-is, where-is&rdquo; with all faults and without warranty of any kind, express or implied, including any warranty of merchantability, fitness for a particular purpose, authenticity, or title, except to the extent the auctioneer expressly states otherwise in the listing. Estimates are opinions, not guarantees. You are responsible for reviewing the description, photos, and condition report and for asking the auctioneer questions before you bid.
              </p>
              <p>
                ITA does not inspect, authenticate, store, or ship items and makes no representation about any item listed on the Platform.
              </p>
            </TermsSection>

            <TermsSection id="disputes">
              <p>
                Disputes about an item, its description, shipping, or a charge go first to the auctioneer who sold it. You can reach the auctioneer from the auction page or your invoice. Contact them within 7 days of receiving the item. Most issues are resolved this way.
              </p>
              <p>
                If you and the auctioneer cannot reach a resolution, either of you may ask ITA to mediate by emailing <SupportEmailLink />. ITA may review the listing, bid history, and messages and recommend a resolution. ITA is not a party to the sale and mediation is not binding. Our{' '}
                <LegalLink href="/refunds">Refund Policy</LegalLink>{' '}
                explains when a charge is refunded.
              </p>
            </TermsSection>

            <TermsSection id="delivery">
              <p>
                Local delivery is a service provided by ITA. When you book local delivery for a lot, you are contracting with ITA as the delivery provider, and the delivery fee is charged by ITA in addition to the lot invoice.
              </p>
              <LegalList
                items={[
                  'Drivers are vetted independent contractors. They are not employees or agents of ITA or of the auctioneer.',
                  'Declared value: when you book, you declare the value of the package. ITA’s liability for loss of or damage to a package during delivery is limited to the declared value, up to the declared-value limit stated when delivery is offered. Items worth more than that limit should be shipped through an insured carrier instead.',
                  <>
                    Damage claims: report loss or damage to <SupportEmailLink /> within 48 hours of the recorded delivery time, with photos. Claims made after that 48-hour window are not eligible.
                  </>,
                  'The auctioneer must have the item packaged for transport and available at the pickup address during the pickup window. The buyer must provide an accurate delivery address and be available to receive the package during the delivery window.',
                  'A failed delivery attempt caused by an inaccurate address or an unavailable recipient may incur a redelivery fee. Cancellations are handled under our Refund Policy.',
                  'A driver’s location is shared with the buyer and the auctioneer only while a delivery is active.',
                ]}
              />
            </TermsSection>

            <TermsSection id="prohibited">
              <p>The following may not be listed or sold on the Platform:</p>
              <LegalList
                items={[
                  'anything illegal to sell or possess under federal, state, or local law;',
                  'firearms, ammunition, and explosives, unless the auctioneer holds the required licenses and the sale complies with all applicable transfer laws;',
                  'controlled substances, prescription drugs, and drug paraphernalia;',
                  'counterfeit, stolen, or otherwise unlawfully obtained goods, and items that infringe someone else’s intellectual property;',
                  'recalled products and hazardous materials that cannot be lawfully shipped or delivered;',
                  'live animals, and human remains or body parts;',
                  'items that promote hatred, violence, or discrimination.',
                ]}
              />
              <p>
                We may remove any listing at our discretion and may report unlawful activity to the appropriate authorities.
              </p>
            </TermsSection>

            <TermsSection id="liability">
              <p>
                The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the fullest extent permitted by law, ITA is not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, lost data, or business interruption arising from your use of the Platform, from any item bought or sold through it, or from any delay or failure of the Platform. ITA&apos;s total liability to you for any claim arising from the Platform will not exceed the greater of one hundred dollars ($100.00) or the platform fees you paid to ITA in the twelve months before the claim arose. Liability for local delivery is separately limited as described in Section {sectionNumber('delivery')}.
              </p>
              <p>
                ITA is not a party to the contract of sale between a bidder and an auctioneer. Some jurisdictions do not allow certain limitations, so some of the above may not apply to you.
              </p>
            </TermsSection>

            <TermsSection id="law">
              <p>
                These Terms are governed by the laws of the State of <LegalPlaceholder value={GOVERNING_LAW_STATE} />, without regard to its conflict-of-law rules. Any dispute that is not resolved through the process in Section {sectionNumber('disputes')} will be brought exclusively in the state or federal courts located there, and you consent to their jurisdiction.
              </p>
            </TermsSection>

            <TermsSection id="changes">
              <p>
                We may update these Terms from time to time. If a change is material, we will notify you by email or by a notice on the Platform at least 14 days before it takes effect. The date at the top of this page shows when the Terms were last updated. Continuing to use the Platform after a change takes effect means you accept the updated Terms.
              </p>
            </TermsSection>

            <TermsSection id="contact">
              <p>
                Questions about these Terms: email <SupportEmailLink /> or use the details on our{' '}
                <LegalLink href="/contact">contact page</LegalLink>.
              </p>
            </TermsSection>
          </div>
        </div>
      </section>
    </div>
  )
}
