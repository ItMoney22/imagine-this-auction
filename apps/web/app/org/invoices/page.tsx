import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuctioneerInvoiceManager from '@/components/org/auctioneer-invoice-manager'

export default async function OrgInvoicesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!userData || userData.role !== 'auctioneer') {
    redirect('/dashboard')
  }

  return <AuctioneerInvoiceManager />
}
