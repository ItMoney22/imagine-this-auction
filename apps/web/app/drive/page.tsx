import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = {
  title: 'Drive for us | Imagine This Auction',
  description: 'Deliver auction wins locally as a vetted independent contractor driver for Imagine This Auction.',
}

export default function DrivePage() {
  return (
    <div className="relative overflow-hidden">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f0520] via-[#1a0b3e] to-[#0f0520] py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] top-[20%] h-[400px] w-[400px] rounded-full bg-purple-600/20 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Badge className="mb-6 border border-white/20 bg-white/10 px-5 py-2 text-[11px] tracking-[0.25em] text-white/90 backdrop-blur-md">
            Local Delivery
          </Badge>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Drive for us
          </h1>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[70ch]">
          <p className="text-lg leading-relaxed text-slate-600">
            Imagine This Auction delivers auction wins locally through vetted independent contractor drivers. Drivers are offered nearby pickups, see the buyer&apos;s name and delivery address only for the delivery they accept, and are paid per completed delivery. Applications require a valid driver license, current vehicle insurance, and a background check. Driver onboarding opens soon; to be notified, email{' '}
            <a href="mailto:support@imaginethisauction.com" className="font-medium text-indigo-600 hover:text-indigo-700">
              support@imaginethisauction.com
            </a>{' '}
            or see our{' '}
            <Link href="/contact" className="font-medium text-indigo-600 hover:text-indigo-700">
              contact page
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  )
}
