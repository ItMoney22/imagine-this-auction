import { redirect } from 'next/navigation'

import { AuctioneerApplicationForm } from '@/components/auth/auctioneer-application-form'
import { createClient } from '@/lib/supabase/server'

export default async function BecomeAuctioneerPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirectedFrom=/become-auctioneer')
  }

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('company_name, business_license, is_approved, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: licenseDocument } = await supabase
    .from('user_documents')
    .select('verification_status')
    .eq('user_id', user.id)
    .eq('document_type', 'auctioneer_license')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Seller Verification
          </p>
          <h1 className="font-display text-4xl text-slate-950 sm:text-5xl">
            Become an Auctioneer
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-600">
            Submit your business details and upload a license document. Admins must verify
            the license before marketplace access is approved.
          </p>
        </div>

        <AuctioneerApplicationForm
          initialEmail={user.email ?? ''}
          existingApplication={
            auctioneer
              ? {
                  companyName: auctioneer.company_name,
                  isApproved: auctioneer.is_approved,
                  businessLicense: auctioneer.business_license,
                  createdAt: auctioneer.created_at,
                  licenseDocumentStatus: licenseDocument?.verification_status ?? null,
                }
              : null
          }
        />
      </div>
    </main>
  )
}
