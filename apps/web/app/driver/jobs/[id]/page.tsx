import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { DriverDeliveryScreen } from '@/components/delivery/driver-delivery-screen'

export default async function DriverJobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectedFrom=/driver')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'driver') redirect('/')

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <DriverDeliveryScreen deliveryId={id} />
      </div>
    </main>
  )
}
