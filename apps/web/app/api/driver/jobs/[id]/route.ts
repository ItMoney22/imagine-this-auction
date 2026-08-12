import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  appendEvent,
  deliveryAdmin,
  getDriverProfile,
  getSessionActor,
  notifyUser,
  transitionDelivery,
  uploadProofImage,
} from '@/lib/delivery/service'
import { EXCEPTION_REASONS, EXCEPTION_REASON_LABEL, type DeliveryStatus } from '@/lib/delivery/state'

const DriverActionSchema = z.object({
  action: z.enum(['claim', 'decline', 'arrive', 'pickup_scan', 'out_for_delivery', 'deliver', 'exception']),
  barcode: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  // Proof of delivery
  photo: z.string().max(12_000_000).optional(),
  signature: z.string().max(4_000_000).optional(),
  recipient_name: z.string().max(200).optional(),
  // Exception
  reason: z.enum(EXCEPTION_REASONS).optional(),
  // Device GPS at the moment of the action
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

// POST /api/driver/jobs/[id] — all driver actions on a delivery.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const actor = await getSessionActor()
    if (!actor || actor.role !== 'driver') {
      return NextResponse.json({ error: 'Driver access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = DriverActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const admin = deliveryAdmin()
    const driver = await getDriverProfile(admin, actor.userId)
    if (!driver || driver.status !== 'active') {
      return NextResponse.json({ error: 'Driver profile inactive — contact dispatch' }, { status: 403 })
    }

    const { data: delivery } = await admin
      .from('deliveries')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    const current = { id: delivery.id, status: delivery.status as DeliveryStatus }
    const actorFields = {
      actor_user_id: actor.userId,
      actor_role: 'driver',
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
    }
    const { action } = parsed.data

    // ── Claim / decline work on offers, before assignment ──────────────────
    if (action === 'claim') {
      const { data: offer } = await admin
        .from('delivery_offers')
        .select('id, status')
        .eq('delivery_id', id)
        .eq('driver_id', driver.id)
        .maybeSingle()
      if (!offer || offer.status !== 'sent') {
        return NextResponse.json({ error: 'No open offer for this delivery' }, { status: 403 })
      }
      if (delivery.offer_expires_at && delivery.offer_expires_at < new Date().toISOString()) {
        return NextResponse.json({ error: 'This offer has expired' }, { status: 409 })
      }

      // Atomic: first driver to flip offered→claimed wins
      const result = await transitionDelivery(
        admin,
        current,
        'claimed',
        { driver_id: driver.id },
        { ...actorFields, notes: 'Driver claimed the job' }
      )
      if (result.error) {
        return NextResponse.json({ error: 'Job no longer available' }, { status: 409 })
      }

      const now = new Date().toISOString()
      await admin
        .from('delivery_offers')
        .update({ status: 'claimed', responded_at: now })
        .eq('id', offer.id)
      await admin
        .from('delivery_offers')
        .update({ status: 'expired', responded_at: now })
        .eq('delivery_id', id)
        .neq('driver_id', driver.id)
        .eq('status', 'sent')

      await notifyUser(
        admin,
        delivery.customer_user_id,
        'A driver has been assigned',
        `A driver has been assigned to deliver your package ${delivery.tracking_number}.`,
        'delivery_update'
      )
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'decline') {
      await admin
        .from('delivery_offers')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('delivery_id', id)
        .eq('driver_id', driver.id)
        .eq('status', 'sent')
      await appendEvent(admin, {
        delivery_id: id,
        event_type: 'offer_declined',
        ...actorFields,
        notes: parsed.data.notes ?? null,
      })
      return NextResponse.json({ ok: true })
    }

    // ── Everything below requires being the assigned driver ────────────────
    if (delivery.driver_id !== driver.id) {
      return NextResponse.json({ error: 'You are not assigned to this delivery' }, { status: 403 })
    }

    if (action === 'arrive') {
      const result = await transitionDelivery(admin, current, 'arrived', {}, {
        ...actorFields,
        notes: 'Driver arrived at warehouse',
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'pickup_scan') {
      // Pickup is confirmed by scanning the package — the scanned code must
      // match this delivery's barcode.
      const scanned = (parsed.data.barcode ?? '').trim().toUpperCase()
      const expected = String(delivery.package_barcode ?? '').trim().toUpperCase()
      if (!scanned) {
        return NextResponse.json({ error: 'Scan the package barcode to confirm pickup' }, { status: 400 })
      }
      if (scanned !== expected) {
        await appendEvent(admin, {
          delivery_id: id,
          event_type: 'note',
          ...actorFields,
          notes: `Pickup scan mismatch (scanned ${scanned.slice(0, 40)})`,
        })
        return NextResponse.json({ error: 'Scanned code does not match this package' }, { status: 409 })
      }

      const result = await transitionDelivery(admin, current, 'picked_up', {}, {
        ...actorFields,
        notes: 'Pickup confirmed by package scan',
        metadata: { scanned_barcode: scanned },
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'out_for_delivery') {
      // State machine already requires picked_up first (scan-gated)
      const result = await transitionDelivery(admin, current, 'out_for_delivery', {}, {
        ...actorFields,
        notes: 'Driver marked out for delivery',
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
      await notifyUser(
        admin,
        delivery.customer_user_id,
        'Your package is out for delivery',
        `Package ${delivery.tracking_number} is on its way to you now.`,
        'delivery_update'
      )
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'deliver') {
      // Proof of delivery is mandatory
      if (!parsed.data.photo) {
        return NextResponse.json({ error: 'A proof-of-delivery photo is required' }, { status: 400 })
      }
      if (delivery.signature_required && (!parsed.data.signature || !parsed.data.recipient_name)) {
        return NextResponse.json(
          { error: 'This delivery requires the recipient name and signature' },
          { status: 400 }
        )
      }

      const photoUpload = await uploadProofImage(admin, id, 'proof', parsed.data.photo)
      if (!photoUpload.path) {
        return NextResponse.json({ error: photoUpload.error ?? 'Photo upload failed' }, { status: 400 })
      }

      let signaturePath: string | null = null
      if (parsed.data.signature) {
        const signatureUpload = await uploadProofImage(admin, id, 'signature', parsed.data.signature)
        if (!signatureUpload.path) {
          return NextResponse.json({ error: signatureUpload.error ?? 'Signature upload failed' }, { status: 400 })
        }
        signaturePath = signatureUpload.path
      }

      const deliveredAt = new Date().toISOString()
      const result = await transitionDelivery(
        admin,
        current,
        'delivered',
        {
          delivered_at: deliveredAt,
          proof_photo_path: photoUpload.path,
          signature_path: signaturePath,
          recipient_name: parsed.data.recipient_name ?? null,
          delivery_notes: parsed.data.notes ?? null,
          delivered_lat: parsed.data.lat ?? null,
          delivered_lng: parsed.data.lng ?? null,
        },
        {
          ...actorFields,
          notes: parsed.data.notes ?? 'Delivered',
          photo_path: photoUpload.path,
          metadata: {
            recipient_name: parsed.data.recipient_name ?? null,
            signature_captured: !!signaturePath,
          },
        }
      )
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

      await notifyUser(
        admin,
        delivery.customer_user_id,
        'Your package was delivered',
        `Package ${delivery.tracking_number} was delivered${parsed.data.recipient_name ? ` to ${parsed.data.recipient_name}` : ''}.`,
        'delivery_update'
      )
      return NextResponse.json({ delivery: result.data })
    }

    // action === 'exception'
    if (!parsed.data.reason) {
      return NextResponse.json({ error: 'An exception reason is required' }, { status: 400 })
    }

    let exceptionPhotoPath: string | null = null
    if (parsed.data.photo) {
      const upload = await uploadProofImage(admin, id, 'exception', parsed.data.photo)
      exceptionPhotoPath = upload.path
    }

    const reasonLabel = EXCEPTION_REASON_LABEL[parsed.data.reason]
    const result = await transitionDelivery(admin, current, 'exception', {}, {
      ...actorFields,
      notes: parsed.data.notes ? `${reasonLabel}: ${parsed.data.notes}` : reasonLabel,
      photo_path: exceptionPhotoPath,
      metadata: { reason: parsed.data.reason },
    })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

    await appendEvent(admin, {
      delivery_id: id,
      event_type: 'exception_reported',
      ...actorFields,
      notes: parsed.data.notes ?? reasonLabel,
      photo_path: exceptionPhotoPath,
      metadata: { reason: parsed.data.reason },
    })
    await notifyUser(
      admin,
      delivery.customer_user_id,
      'Delivery update',
      `There was a delay delivering ${delivery.tracking_number}. Our team is on it and will follow up shortly.`,
      'delivery_update'
    )
    return NextResponse.json({ delivery: result.data })
  } catch (error) {
    console.error('Driver action failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
