import { NextRequest, NextResponse } from 'next/server'

import {
  deliveryAdmin,
  getSessionActor,
  sanitizeForCustomer,
  signedProofUrl,
} from '@/lib/delivery/service'

// GET /api/delivery/[id] — full detail for admin; job view for the assigned
// driver; sanitized tracking view for the buying customer.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const actor = await getSessionActor()
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const admin = deliveryAdmin()
    const { data: delivery } = await admin
      .from('deliveries')
      .select(
        `*,
         customer:users!deliveries_customer_user_id_fkey(id, email, first_name, last_name),
         driver:drivers(id, phone, vehicle_type, status, location_consent_at, users(id, email, first_name, last_name)),
         lot:lots(id, title),
         invoice:invoices(id, total_amount, is_paid)`
      )
      .eq('id', id)
      .maybeSingle()

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    const { data: events } = await admin
      .from('delivery_events')
      .select('*')
      .eq('delivery_id', id)
      .order('created_at', { ascending: true })

    // Customer: sanitized view only
    if (actor.role !== 'admin') {
      const isCustomer = delivery.customer_user_id === actor.userId
      const isAssignedDriver =
        actor.role === 'driver' && delivery.driver?.users?.id === actor.userId

      if (isCustomer && !isAssignedDriver) {
        return NextResponse.json({
          delivery: sanitizeForCustomer(delivery, events ?? []),
          view: 'customer',
        })
      }

      if (!isAssignedDriver) {
        return NextResponse.json({ error: 'Not authorized for this delivery' }, { status: 403 })
      }

      // Driver: job details without customer account info beyond the dropoff
      const { customer: _customer, tracking_token: _token, ...driverView } = delivery
      return NextResponse.json({
        delivery: driverView,
        events: events ?? [],
        view: 'driver',
      })
    }

    // Admin: everything, including proof URLs and the location history
    const { data: locations } = await admin
      .from('driver_locations')
      .select('lat, lng, accuracy_m, recorded_at')
      .eq('delivery_id', id)
      .order('recorded_at', { ascending: true })
      .limit(500)

    const [proofUrl, signatureUrl] = await Promise.all([
      signedProofUrl(admin, delivery.proof_photo_path),
      signedProofUrl(admin, delivery.signature_path),
    ])

    const eventPhotoUrls: Record<string, string> = {}
    for (const event of events ?? []) {
      if (event.photo_path) {
        const url = await signedProofUrl(admin, event.photo_path)
        if (url) eventPhotoUrls[event.id] = url
      }
    }

    return NextResponse.json({
      delivery,
      events: events ?? [],
      locations: locations ?? [],
      proof_photo_url: proofUrl,
      signature_url: signatureUrl,
      event_photo_urls: eventPhotoUrls,
      view: 'admin',
    })
  } catch (error) {
    console.error('Delivery detail failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
