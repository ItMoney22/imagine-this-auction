import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import DeliveryManager from '@/components/admin/delivery-manager'

export default async function AdminDeliveriesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') return notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Delivery Tracking</h1>
          <p className="mt-2 text-gray-600">
            Search deliveries, audit every event, resolve exceptions, and manage drivers.
          </p>
        </div>
        <DeliveryManager />
      </div>
    </div>
  )
}
