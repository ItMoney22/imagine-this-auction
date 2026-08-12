import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  appendEvent,
  deliveryAdmin,
  getSessionActor,
  notifyUser,
  transitionDelivery,
} from '@/lib/delivery/service'
import type { DeliveryStatus } from '@/lib/delivery/state'

const ActionSchema = z.object({
  action: z.enum(['offer', 'assign', 'reassign', 'handoff', 'cancel', 'resolve', 'set_eta', 'note']),
  driver_id: z.string().uuid().optional(),
  driver_ids: z.array(z.string().uuid()).optional(),
  resolution: z.enum(['returned', 'cancelled', 'reoffer', 'resume']).optional(),
  notes: z.string().max(2000).optional(),
  offer_expires_minutes: z.number().int().min(15).max(1440).optional(),
  eta_window_start: z.string().optional(),
  eta_window_end: z.string().optional(),
})

// POST /api/delivery/[id]/actions — admin/warehouse operations.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const actor = await getSessionActor()
    if (!actor || actor.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = ActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const admin = deliveryAdmin()
    const { data: delivery } = await admin
      .from('deliveries')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    const current = { id: delivery.id, status: delivery.status as DeliveryStatus }
    const actorFields = { actor_user_id: actor.userId, actor_role: 'admin' }
    const { action } = parsed.data

    if (action === 'offer') {
      // Send the job to eligible (active, consent irrelevant here) drivers
      let driversQuery = admin.from('drivers').select('id, user_id').eq('status', 'active')
      if (parsed.data.driver_ids?.length) {
        driversQuery = driversQuery.in('id', parsed.data.driver_ids)
      }
      const { data: drivers } = await driversQuery
      if (!drivers || drivers.length === 0) {
        return NextResponse.json({ error: 'No eligible active drivers found' }, { status: 400 })
      }

      const expiresAt = new Date(
        Date.now() + (parsed.data.offer_expires_minutes ?? 120) * 60_000
      ).toISOString()

      const result = await transitionDelivery(
        admin,
        current,
        'offered',
        { offer_expires_at: expiresAt, driver_id: null },
        { ...actorFields, notes: `Offer sent to ${drivers.length} driver(s)` }
      )
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

      await admin.from('delivery_offers').upsert(
        drivers.map((d) => ({ delivery_id: id, driver_id: d.id, status: 'sent' })),
        { onConflict: 'delivery_id,driver_id' }
      )
      for (const d of drivers) {
        await notifyUser(
          admin,
          d.user_id,
          'New delivery offer available',
          `Delivery ${delivery.tracking_number} is available to claim. Open your driver dashboard to accept.`,
          'delivery_offer'
        )
      }
      return NextResponse.json({ delivery: result.data, offered_to: drivers.length })
    }

    if (action === 'assign') {
      if (!parsed.data.driver_id) {
        return NextResponse.json({ error: 'driver_id is required' }, { status: 400 })
      }
      const { data: driver } = await admin
        .from('drivers')
        .select('id, user_id, status')
        .eq('id', parsed.data.driver_id)
        .maybeSingle()
      if (!driver || driver.status !== 'active') {
        return NextResponse.json({ error: 'Driver not found or not active' }, { status: 400 })
      }

      // Direct assignment walks the honest path: offered → claimed
      let working = current
      if (working.status === 'created' || working.status === 'exception') {
        const step = await transitionDelivery(admin, working, 'offered', { driver_id: null }, {
          ...actorFields,
          notes: 'Direct assignment by admin',
        })
        if (step.error) return NextResponse.json({ error: step.error }, { status: 409 })
        working = { id, status: 'offered' }
      }

      const result = await transitionDelivery(
        admin,
        working,
        'claimed',
        { driver_id: driver.id },
        { ...actorFields, notes: 'Assigned by admin', metadata: { driver_id: driver.id } }
      )
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

      await admin
        .from('delivery_offers')
        .upsert([{ delivery_id: id, driver_id: driver.id, status: 'claimed', responded_at: new Date().toISOString() }], {
          onConflict: 'delivery_id,driver_id',
        })
      await notifyUser(
        admin,
        driver.user_id,
        'A delivery was assigned to you',
        `Delivery ${delivery.tracking_number} has been assigned to you by dispatch.`,
        'delivery_offer'
      )
      await notifyUser(
        admin,
        delivery.customer_user_id,
        'A driver has been assigned',
        `A driver has been assigned to deliver your package ${delivery.tracking_number}.`,
        'delivery_update'
      )
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'reassign') {
      // Pull the job back from the current driver and put it back on offer
      const previousDriver = delivery.driver_id
      const result = await transitionDelivery(
        admin,
        current,
        'offered',
        { driver_id: null },
        { ...actorFields, notes: parsed.data.notes ?? 'Reassigned by admin', metadata: { previous_driver_id: previousDriver } }
      )
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

      await appendEvent(admin, {
        delivery_id: id,
        event_type: 'reassigned',
        ...actorFields,
        notes: parsed.data.notes ?? null,
        metadata: { previous_driver_id: previousDriver },
      })
      if (previousDriver) {
        const { data: prev } = await admin
          .from('drivers')
          .select('user_id')
          .eq('id', previousDriver)
          .maybeSingle()
        if (prev) {
          await notifyUser(
            admin,
            prev.user_id,
            'Delivery unassigned',
            `Delivery ${delivery.tracking_number} was reassigned by dispatch.`,
            'delivery_offer'
          )
        }
      }
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'handoff') {
      // Warehouse-side confirmation of the physical handoff (fallback when
      // the driver's own scan isn't possible)
      const result = await transitionDelivery(admin, current, 'picked_up', {}, {
        ...actorFields,
        notes: parsed.data.notes ?? 'Handoff confirmed by warehouse scan',
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'cancel') {
      const result = await transitionDelivery(admin, current, 'cancelled', {}, {
        ...actorFields,
        notes: parsed.data.notes ?? 'Cancelled by admin',
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
      await notifyUser(
        admin,
        delivery.customer_user_id,
        'Your delivery was cancelled',
        `Delivery ${delivery.tracking_number} has been cancelled. Our team will follow up about your item.`,
        'delivery_update'
      )
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'resolve') {
      const map: Record<string, DeliveryStatus> = {
        returned: 'returned',
        cancelled: 'cancelled',
        reoffer: 'offered',
        resume: 'out_for_delivery',
      }
      const target = map[parsed.data.resolution ?? '']
      if (!target) {
        return NextResponse.json({ error: 'resolution must be returned, cancelled, reoffer, or resume' }, { status: 400 })
      }
      const updates: Record<string, unknown> = {}
      if (parsed.data.resolution === 'reoffer') updates.driver_id = null

      const result = await transitionDelivery(admin, current, target, updates, {
        ...actorFields,
        notes: parsed.data.notes ?? `Exception resolved: ${parsed.data.resolution}`,
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json({ delivery: result.data })
    }

    if (action === 'set_eta') {
      const { error } = await admin
        .from('deliveries')
        .update({
          eta_window_start: parsed.data.eta_window_start ?? null,
          eta_window_end: parsed.data.eta_window_end ?? null,
        })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await appendEvent(admin, {
        delivery_id: id,
        event_type: 'note',
        ...actorFields,
        notes: 'Estimated delivery window updated',
      })
      return NextResponse.json({ ok: true })
    }

    // action === 'note'
    await appendEvent(admin, {
      delivery_id: id,
      event_type: 'note',
      ...actorFields,
      notes: parsed.data.notes ?? '',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Delivery action failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
