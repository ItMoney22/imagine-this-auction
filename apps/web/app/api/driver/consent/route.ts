import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deliveryAdmin, getDriverProfile, getSessionActor } from '@/lib/delivery/service'

const ConsentSchema = z.object({ consent: z.boolean() })

// POST /api/driver/consent — grant or revoke location-tracking consent.
// Granting stamps the time; revoking clears it, which immediately stops the
// location endpoint from accepting pings.
export async function POST(request: NextRequest) {
  try {
    const actor = await getSessionActor()
    if (!actor || actor.role !== 'driver') {
      return NextResponse.json({ error: 'Driver access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = ConsentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    const admin = deliveryAdmin()
    const driver = await getDriverProfile(admin, actor.userId)
    if (!driver) {
      return NextResponse.json({ error: 'No driver profile' }, { status: 403 })
    }

    const consentAt = parsed.data.consent ? new Date().toISOString() : null
    const { error } = await admin
      .from('drivers')
      .update({ location_consent_at: consentAt })
      .eq('id', driver.id)
    if (error) {
      return NextResponse.json({ error: 'Failed to update consent' }, { status: 500 })
    }

    return NextResponse.json({ location_consent_at: consentAt })
  } catch (error) {
    console.error('Consent update failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
