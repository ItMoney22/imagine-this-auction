import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InvoicesDashboard from '@/components/bidder/invoices-dashboard'

export default async function InvoicesPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login?redirectedFrom=/invoices')
  }

  return <InvoicesDashboard />
}
