import { createClient } from '@/lib/supabase/server'
import InvoicesDashboard from '@/components/bidder/invoices-dashboard'

export default async function InvoicesPage() {
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

  return <InvoicesDashboard />
}