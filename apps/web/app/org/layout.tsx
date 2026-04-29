import { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
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
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'auctioneer') {
    redirect('/dashboard')
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
