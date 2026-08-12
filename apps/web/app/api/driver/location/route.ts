import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deliveryAdmin, getDriverProfile, getSessionActor } from '@/lib/delivery/service'
import { LOCATION_ACTIVE_STATUSES } from '@/lib/delivery/state'

const PingSchema = z.object({
  delivery_id: z.string().uuid(),
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy_m: z.number().nonnegative().optional(),
      })
    )
    .min(1)
    .max(20),
})

// POST /api/driver/location — location pings, accepted ONLY while the driver
// has granted consent AND is actively on this delivery. A 410 response tells
// the client to stop sending. Rows are retained as audit records.
export async function POST(request: NextRequest) {
  try {
    const actor = await getSessionActor()
    if (!actor || actor.role !== 'driver') {
      return NextResponse.json({ error: 'Driver access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = PingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const admin = deliveryAdmin()
    const driver = await getDriverProfile(admin, actor.userId)
    if (!driver) {
      return NextResponse.json({ error: 'No driver profile' }, { status: 403 })
    }

    // Explicit consent required — stop condition #1
    if (!driver.location_consent_at) {
      return NextResponse.json({ stop: true, reason: 'Location consent not granted' }, { status: 410 })
    }

    const { data: delivery } = await admin
      .from('deliveries')
      .select('id, driver_id, status')
      .eq('id', parsed.data.delivery_id)
      .maybeSingle()

    // Must be actively assigned to this delivery — stop conditions #2 and #3
    if (!delivery || delivery.driver_id !== driver.id) {
      return NextResponse.json({ stop: true, reason: 'Not assigned to this delivery' }, { status: 410 })
    }
    if (!LOCATION_ACTIVE_STATUSES.includes(delivery.status)) {
      return NextResponse.json({ stop: true, reason: 'Delivery is not active' }, { status: 410 })
    }

    const { error } = await admin.from('driver_locations').insert(
      parsed.data.points.map((p) => ({
        delivery_id: delivery.id,
        driver_id: driver.id,
        lat: p.lat,
        lng: p.lng,
        accuracy_m: p.accuracy_m ?? null,
      }))
    )
    if (error) {
      console.error('Failed to store location pings:', error.message)
      return NextResponse.json({ error: 'Failed to store pings' }, { status: 500 })
    }

    return NextResponse.json({ accepted: parsed.data.points.length })
  } catch (error) {
    console.error('Location ping failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
