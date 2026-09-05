import type { Metadata } from 'next'
import { LegalHero, LegalLink, LegalList, LegalSection, SupportEmailLink } from '@/components/legal/legal-page'
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_LABEL } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: 'Privacy Policy | Imagine This Auction',
  description:
    'What Imagine This Auction collects, how it is used, who it is shared with, and the choices you have.',
}

export default function PrivacyPage() {
  return (
    <div className="relative overflow-hidden">
      <LegalHero
        badge="Legal"
        title="Privacy Policy"
        lastUpdated={LEGAL_LAST_UPDATED}
        lastUpdatedLabel={LEGAL_LAST_UPDATED_LABEL}
      />

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <p className="text-lg leading-relaxed text-slate-600">
            This policy explains what Imagine This Auction (&ldquo;ITA&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects when you use imaginethisauction.com, how we use it, who we share it with, and the choices you have. It applies to bidders, auctioneers, delivery drivers, and visitors.
          </p>

          <div className="mt-14 space-y-10">
            <LegalSection id="collect" title="1. What we collect">
              <p><strong className="text-slate-900">Account information.</strong> Your name, email address, phone number, and role. Your password is handled by our authentication provider and stored only as a hash. Auctioneers also provide a business name, address, tax ID, and auctioneer license documents.</p>
              <p><strong className="text-slate-900">Bidding and purchase activity.</strong> Bids, maximum bids, watchlists, wins, invoices, delivery bookings, and messages you send to support.</p>
              <p><strong className="text-slate-900">Payment information.</strong> Your card is tokenized by our payment processor. We store only the token, the card brand, the last four digits, and the expiration date. We never store full card numbers or security codes.</p>
              <p><strong className="text-slate-900">Driver documents.</strong> If you apply to drive for us, we collect your driver license and vehicle insurance documents.</p>
              <p><strong className="text-slate-900">Driver location.</strong> With a driver&apos;s consent, we collect the driver&apos;s location only while a delivery is active, so the buyer and auctioneer can track the package. Collection stops when the delivery is completed or cancelled.</p>
              <p><strong className="text-slate-900">Technical information.</strong> IP address, browser and device type, pages visited, and server logs, collected automatically when you use the site.</p>
            </LegalSection>

            <LegalSection id="use" title="2. How we use it">
              <LegalList
                items={[
                  'to run your account, list and run auctions, and process bids;',
                  'to charge the card on file for lots you win and deliveries you book, and to bill auctioneers their monthly statement;',
                  'to arrange and track local deliveries;',
                  'to send transactional messages such as outbid alerts, win notices, invoices, and delivery updates;',
                  'to verify auctioneer licensing and driver eligibility;',
                  'to detect and prevent fraud, shill bidding, and abuse;',
                  'to respond to support requests and mediate disputes;',
                  'to comply with legal obligations and enforce our Terms; and',
                  'to understand how the Platform is used so we can improve it.',
                ]}
              />
              <p>We do not sell your personal information.</p>
            </LegalSection>

            <LegalSection id="sharing" title="3. Who we share it with">
              <LegalList
                items={[
                  <><strong className="text-slate-900">Payment processor.</strong> Card and charge details are sent to our payment processor to tokenize cards and process charges. Auctioneers process buyer payments through their own merchant accounts.</>,
                  <><strong className="text-slate-900">Auctioneers.</strong> When you win a lot, the auctioneer receives your name, email, phone number, shipping address, and invoice so they can fulfill the sale.</>,
                  <><strong className="text-slate-900">Delivery drivers.</strong> Drivers receive only the name, delivery address, and contact phone needed to complete your delivery, and only for the delivery they are assigned. They never receive your email or payment details.</>,
                  <><strong className="text-slate-900">Email provider.</strong> Your email address and the content of transactional messages are sent to the provider that delivers our email.</>,
                  <><strong className="text-slate-900">Infrastructure providers.</strong> Hosting, database, and authentication providers that store and process data on our behalf under contract.</>,
                  <><strong className="text-slate-900">Legal.</strong> When required by law, subpoena, or court order, or to protect the rights and safety of our users and the public.</>,
                  <><strong className="text-slate-900">Business transfer.</strong> If ITA is acquired or merges, your information may transfer to the successor, who will be bound by this policy.</>,
                ]}
              />
            </LegalSection>

            <LegalSection id="retention" title="4. How long we keep it">
              <LegalList
                items={[
                  'Account information: for as long as your account is active, and for up to 90 days after you close it so we can resolve open transactions.',
                  'Bids, invoices, statements, and payment records: seven years, to meet tax and accounting requirements.',
                  'Driver license and insurance records: for as long as you are an active driver, plus the period required by law.',
                  'Driver location data: kept only as long as needed for delivery records and dispute resolution.',
                  'Server logs: up to 12 months.',
                ]}
              />
            </LegalSection>

            <LegalSection id="rights" title="5. Your rights and choices">
              <p>
                You can view and update your account information in your settings. You can ask us to provide a copy of your personal information, correct it, or delete it, subject to the records we are required to keep. You can opt out of non-essential emails from the notification settings page; transactional messages about your bids, wins, and deliveries will still be sent because they are part of the service.
              </p>
              <p>
                Residents of California and other states with privacy laws may have additional rights, including the right to know what we collect and the right not to be discriminated against for exercising those rights. To make a request, email <SupportEmailLink />. We will verify your identity before acting on it and respond within the time the applicable law allows.
              </p>
            </LegalSection>

            <LegalSection id="cookies" title="6. Cookies">
              <p>
                We use cookies and similar storage that are essential to the site: keeping you signed in and remembering basic preferences. We do not use third-party advertising cookies. You can block cookies in your browser, but you will not be able to sign in or bid without the essential ones.
              </p>
            </LegalSection>

            <LegalSection id="children" title="7. Children">
              <p>
                The Platform is for adults. You must be 18 or older to create an account, and we do not knowingly collect personal information from anyone under 13. If you believe a child has provided us information, email <SupportEmailLink /> and we will delete it.
              </p>
            </LegalSection>

            <LegalSection id="contact" title="8. Contact">
              <p>
                Questions about this policy or your data: email <SupportEmailLink /> or use the details on our{' '}
                <LegalLink href="/contact">contact page</LegalLink>. If we change this policy in a material way, we will notify you by email or by a notice on the Platform, and the date at the top of this page will be updated.
              </p>
            </LegalSection>
          </div>
        </div>
      </section>
    </div>
  )
}
