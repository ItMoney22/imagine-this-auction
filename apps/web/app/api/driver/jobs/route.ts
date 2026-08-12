import { NextResponse } from 'next/server'

import { deliveryAdmin, getDriverProfile, getSessionActor } from '@/lib/delivery/service'
import { TERMINAL_STATUSES } from '@/lib/delivery/state'

// GET /api/driver/jobs — open offers + my active deliveries.
export async function GET() {
  try {
    const actor = await getSessionActor()
    if (!actor || actor.role !== 'driver') {
      return NextResponse.json({ error: 'Driver access required' }, { status: 403 })
    }

    const admin = deliveryAdmin()
    const driver = await getDriverProfile(admin, actor.userId)
    if (!driver) {
      return NextResponse.json({ error: 'No driver profile — contact dispatch' }, { status: 403 })
    }

    const nowIso = new Date().toISOString()

    const [{ data: offers }, { data: active }] = await Promise.all([
      admin
        .from('delivery_offers')
        .select('id, sent_at, delivery:deliveries(id, tracking_number, status, pickup_address, dropoff_address, weight_g, eta_window_start, eta_window_end, offer_expires_at, lot:lots(title))')
        .eq('driver_id', driver.id)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false }),
      admin
        .from('deliveries')
        .select('id, tracking_number, status, pickup_address, dropoff_address, weight_g, signature_required, eta_window_start, eta_window_end, lot:lots(title)')
        .eq('driver_id', driver.id)
        .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
        .order('updated_at', { ascending: false }),
    ])

    // Show only offers that are still claimable
    const openOffers = (offers ?? []).filter((o) => {
      const d = o.delivery as unknown as { status: string; offer_expires_at: string | null } | null
      if (!d || d.status !== 'offered') return false
      if (d.offer_expires_at && d.offer_expires_at < nowIso) return false
      return true
    })

    return NextResponse.json({
      driver: {
        id: driver.id,
        status: driver.status,
        location_consent_at: driver.location_consent_at,
      },
      offers: openOffers,
      active: active ?? [],
    })
  } catch (error) {
    console.error('Driver jobs fetch failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
