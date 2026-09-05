import type { Metadata } from 'next'
import { LegalHero, LegalLink, SupportEmailLink } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Drive for us | Imagine This Auction',
  description: 'Deliver auction wins locally as a vetted independent contractor driver for Imagine This Auction.',
}

export default function DrivePage() {
  return (
    <div className="relative overflow-hidden">
      <LegalHero badge="Local Delivery" title="Drive for us" />

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <p className="text-lg leading-relaxed text-slate-600">
            Imagine This Auction delivers auction wins locally through vetted independent contractor drivers. Drivers are offered nearby pickups, see only the buyer&apos;s name, delivery address, and contact phone for the delivery they accept, and are paid per completed delivery. Applications require a valid driver license and current vehicle insurance. Driver onboarding opens soon; to be notified, email <SupportEmailLink /> or see our{' '}
            <LegalLink href="/contact">contact page</LegalLink>.
          </p>
        </div>
      </section>
    </div>
  )
}
