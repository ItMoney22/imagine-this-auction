import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = {
  title: 'Privacy Policy | Imagine This Auction',
  description:
    'What Imagine This Auction collects, how it is used, who it is shared with, and the choices you have.',
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

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-4 text-white/70">Last updated {LAST_UPDATED}</p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <p className="text-lg leading-relaxed text-slate-600">
            This policy explains what Imagine This Auction (&ldquo;ITA&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects when you use imaginethisauction.com, how we use it, who we share it with, and the choices you have. It applies to bidders, auctioneers, delivery drivers, and visitors.
          </p>

          <div className="mt-14 space-y-10">
            <Section id="collect" title="1. What we collect">
              <p><strong className="text-slate-900">Account information.</strong> Your name, email address, phone number, and role. Your password is handled by our authentication provider and stored only as a hash. Auctioneers also provide a business name, address, tax ID, and auctioneer license documents.</p>
              <p><strong className="text-slate-900">Bidding and purchase activity.</strong> Bids, maximum bids, watchlists, wins, invoices, delivery bookings, and messages you send to support.</p>
              <p><strong className="text-slate-900">Payment information.</strong> Your card is tokenized by our payment processor. We store only the token, the card brand, the last four digits, and the expiration date. We never store full card numbers or security codes.</p>
              <p><strong className="text-slate-900">Driver documents.</strong> If you apply to drive for us, we collect your driver license and vehicle insurance documents.</p>
              <p><strong className="text-slate-900">Driver location.</strong> With a driver&apos;s consent, we collect the driver&apos;s location only while a delivery is active, so the buyer and auctioneer can track the package. Collection stops when the delivery is completed or cancelled.</p>
              <p><strong className="text-slate-900">Technical information.</strong> IP address, browser and device type, pages visited, and server logs, collected automatically when you use the site.</p>
            </Section>

            <Section id="use" title="2. How we use it">
              <List
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
            </Section>

            <Section id="sharing" title="3. Who we share it with">
              <List
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
            </Section>

            <Section id="retention" title="4. How long we keep it">
              <List
                items={[
                  'Account information: for as long as your account is active, and for up to 90 days after you close it so we can resolve open transactions.',
                  'Bids, invoices, statements, and payment records: seven years, to meet tax and accounting requirements.',
                  'Driver license and insurance records: for as long as you are an active driver, plus the period required by law.',
                  'Driver location data: kept only as long as needed for delivery records and dispute resolution.',
                  'Server logs: up to 12 months.',
                ]}
              />
            </Section>

            <Section id="rights" title="5. Your rights and choices">
              <p>
                You can view and update your account information in your settings. You can ask us to provide a copy of your personal information, correct it, or delete it, subject to the records we are required to keep. You can opt out of non-essential emails from the notification settings page; transactional messages about your bids, wins, and deliveries will still be sent because they are part of the service.
              </p>
              <p>
                Residents of California and other states with privacy laws may have additional rights, including the right to know what we collect and the right not to be discriminated against for exercising those rights. To make a request, email support@imaginethisauction.com. We will verify your identity before acting on it and respond within the time the applicable law allows.
              </p>
            </Section>

            <Section id="cookies" title="6. Cookies">
              <p>
                We use cookies and similar storage that are essential to the site: keeping you signed in and remembering basic preferences. We do not use third-party advertising cookies. You can block cookies in your browser, but you will not be able to sign in or bid without the essential ones.
              </p>
            </Section>

            <Section id="children" title="7. Children">
              <p>
                The Platform is for adults. You must be 18 or older to create an account, and we do not knowingly collect personal information from anyone under 13. If you believe a child has provided us information, email support@imaginethisauction.com and we will delete it.
              </p>
            </Section>

            <Section id="contact" title="8. Contact">
              <p>
                Questions about this policy or your data: email support@imaginethisauction.com or use the details on our{' '}
                <Link href="/contact" className="font-medium text-indigo-600 hover:text-indigo-700">contact page</Link>. If we change this policy in a material way, we will notify you by email or by a notice on the Platform, and the date at the top of this page will be updated.
              </p>
            </Section>
          </div>
        </div>
      </section>
    </div>
  )
}
