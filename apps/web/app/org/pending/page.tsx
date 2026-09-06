import { redirect } from 'next/navigation'

import { canAccessOrg, pendingVariantFor } from '@/lib/auth/org-gate'
import { createClient } from '@/lib/supabase/server'
import { PendingNotice } from '@/components/org/org-pending-notice'

export const metadata = {
  title: 'Application under review',
}

/**
 * /org/pending — where unapproved auctioneers land.
 *
 * app/org/layout.tsx already swaps `children` for the pending gate when the
 * account is unapproved, so this page body is only reached by accounts the
 * layout let through. It checks again anyway so the URL is correct on its own:
 * an approved auctioneer who wanders here is sent to the vendor center.
 */
export default async function OrgPendingPage() {
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

  if (profile && canAccessOrg(profile)) {
    redirect('/org')
  }

  const { data: licenseDocument } = await supabase
    .from('user_documents')
    .select('verification_status')
    .eq('user_id', user.id)
    .eq('document_type', 'auctioneer_license')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return <PendingNotice variant={pendingVariantFor(licenseDocument?.verification_status)} />
}
