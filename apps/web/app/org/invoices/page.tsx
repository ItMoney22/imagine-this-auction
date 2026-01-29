import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuctioneerInvoiceManager from '@/components/org/auctioneer-invoice-manager'

export default async function OrgInvoicesPage() {
  const supabase = await createClient()

  // TEMPORARY: Skip auth for development
  // Check authentication
  // const {
  //   data: { user },
  //   error: authError,
  // } = await supabase.auth.getUser()

  // if (authError || !user) {
  //   redirect('/auth')
  // }

  // Check if user is auctioneer
  // const { data: userData, error: userError } = await supabase
  //   .from('users')
  //   .select('role')
  //   .eq('id', user.id)
  //   .single()

  // if (userError || !userData || userData.role !== 'auctioneer') {
  //   redirect('/')
  // }

  return <AuctioneerInvoiceManager />
}