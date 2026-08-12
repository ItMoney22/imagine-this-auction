import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { deliveryAdmin, sanitizeForCustomer } from '@/lib/delivery/service'
import { isValidTrackingNumber } from '@/lib/delivery/tracking'

// GET /api/track/[trackingNumber]?t=<token> — public tracking endpoint.
// Authorized by the secret link token, or by the buyer's/admin's session.
// Always returns the sanitized customer view (no driver identity, no live GPS).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingNumber: string }> }
) {
  const { trackingNumber } = await params
  try {
    if (!isValidTrackingNumber(trackingNumber)) {
      return NextResponse.json({ error: 'Invalid tracking number' }, { status: 400 })
    }

    const admin = deliveryAdmin()
    const { data: delivery } = await admin
      .from('deliveries')
      .select('*')
      .eq('tracking_number', trackingNumber.toUpperCase())
      .maybeSingle()

    if (!delivery) {
      return NextResponse.json({ error: 'Tracking number not found' }, { status: 404 })
    }

    const token = request.nextUrl.searchParams.get('t')
    let authorized = !!token && token === delivery.tracking_token

    if (!authorized) {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        if (user.id === delivery.customer_user_id) {
          authorized = true
        } else {
          const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()
          authorized = profile?.role === 'admin'
        }
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { error: 'Use your secure tracking link or sign in to view this delivery' },
        { status: 403 }
      )
    }

    const { data: events } = await admin
      .from('delivery_events')
      .select('event_type, created_at')
      .eq('delivery_id', delivery.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ delivery: sanitizeForCustomer(delivery, events ?? []) })
  } catch (error) {
    console.error('Tracking lookup failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
