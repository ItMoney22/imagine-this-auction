import { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { canAccessOrg, pendingVariantFor } from '@/lib/auth/org-gate'
import { createClient } from '@/lib/supabase/server'
import { OrgPendingGate } from '@/components/org/org-pending-gate'
import { OrgSidebar } from '@/components/org/org-sidebar'

interface OrgLayoutProps {
  children: ReactNode
}

export default async function OrgLayout({ children }: OrgLayoutProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  // Non-auctioneers (bidders, drivers, admins) have never had access to /org.
  if (!profile || profile.role !== 'auctioneer') {
    redirect('/dashboard')
  }

  // Auctioneers whose application is still under review (or was rejected) get
  // the pending notice instead of the vendor center. The gate is a client
  // component so it can see the pathname and send /org/* to /org/pending
  // without redirect-looping through this same layout (server layouts cannot
  // read the request path). `children` is deliberately not rendered on this
  // branch, so nothing from the vendor center reaches an unapproved account.
  if (!canAccessOrg(profile)) {
    // Same lookup app/become-auctioneer/page.tsx does; RLS limits it to the
    // caller's own documents. A rejected license changes the copy.
    const { data: licenseDocument } = await supabase
      .from('user_documents')
      .select('verification_status')
      .eq('user_id', user.id)
      .eq('document_type', 'auctioneer_license')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return <OrgPendingGate variant={pendingVariantFor(licenseDocument?.verification_status)} />
  }

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!auctioneer) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)]">
        <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)] lg:flex-row">
      <OrgSidebar auctioneer={auctioneer} />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
