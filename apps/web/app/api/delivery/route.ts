import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  appendEvent,
  deliveryAdmin,
  getSessionActor,
  notifyUser,
} from '@/lib/delivery/service'
import { generateTrackingNumber, generateTrackingToken } from '@/lib/delivery/tracking'

const AddressSchema = z.object({
  name: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  phone: z.string().optional(),
  instructions: z.string().optional(),
})

const CreateDeliverySchema = z.object({
  invoice_id: z.string().uuid(),
  package_barcode: z.string().min(3).max(120).optional(),
  weight_g: z.number().int().positive().optional(),
  length_mm: z.number().int().positive().optional(),
  width_mm: z.number().int().positive().optional(),
  height_mm: z.number().int().positive().optional(),
  pickup_address: AddressSchema.optional(),
  dropoff_address: AddressSchema.optional(),
  signature_required: z.boolean().default(false),
  eta_window_start: z.string().optional(),
  eta_window_end: z.string().optional(),
})

// POST /api/delivery — warehouse scan-and-measure: creates the delivery for a
// paid invoice. Allowed for admins and the auctioneer who owns the lot.
export async function POST(request: NextRequest) {
  try {
    const actor = await getSessionActor()
    if (!actor || (actor.role !== 'admin' && actor.role !== 'auctioneer')) {
      return NextResponse.json({ error: 'Admin or auctioneer access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = CreateDeliverySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const admin = deliveryAdmin()
    const { data: invoice } = await admin
      .from('invoices')
      .select('id, lot_id, buyer_id, is_paid, shipping_address, lots(id, title, auction_id, auctions(auctioneer_id))')
      .eq('id', parsed.data.invoice_id)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (!invoice.is_paid) {
      return NextResponse.json({ error: 'Invoice must be paid before arranging delivery' }, { status: 400 })
    }

    const lot = invoice.lots as unknown as
      | { id: string; title: string; auctions: { auctioneer_id: string } | null }
      | null
    const auctioneerId = lot?.auctions?.auctioneer_id ?? null

    // Auctioneers may only create deliveries for their own lots
    if (actor.role === 'auctioneer') {
      const { data: ownAuctioneer } = await admin
        .from('auctioneers')
        .select('id')
        .eq('user_id', actor.userId)
        .maybeSingle()
      if (!ownAuctioneer || ownAuctioneer.id !== auctioneerId) {
        return NextResponse.json({ error: 'This invoice is not for one of your lots' }, { status: 403 })
      }
    }

    const { data: existing } = await admin
      .from('deliveries')
      .select('id, tracking_number')
      .eq('invoice_id', invoice.id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: 'A delivery already exists for this invoice', delivery: existing },
        { status: 409 }
      )
    }

    const trackingNumber = generateTrackingNumber()
    const trackingToken = generateTrackingToken()

    const { data: delivery, error: insertError } = await admin
      .from('deliveries')
      .insert({
        invoice_id: invoice.id,
        lot_id: invoice.lot_id,
        customer_user_id: invoice.buyer_id,
        auctioneer_id: auctioneerId,
        tracking_number: trackingNumber,
        tracking_token: trackingToken,
        package_barcode: parsed.data.package_barcode || trackingNumber,
        weight_g: parsed.data.weight_g ?? null,
        length_mm: parsed.data.length_mm ?? null,
        width_mm: parsed.data.width_mm ?? null,
        height_mm: parsed.data.height_mm ?? null,
        pickup_address: parsed.data.pickup_address ?? null,
        dropoff_address: parsed.data.dropoff_address ?? invoice.shipping_address ?? null,
        signature_required: parsed.data.signature_required,
        eta_window_start: parsed.data.eta_window_start ?? null,
        eta_window_end: parsed.data.eta_window_end ?? null,
        status: 'created',
      })
      .select()
      .single()

    if (insertError || !delivery) {
      console.error('Failed to create delivery:', insertError?.message)
      return NextResponse.json({ error: 'Failed to create delivery' }, { status: 500 })
    }

    await appendEvent(admin, {
      delivery_id: delivery.id,
      event_type: 'created',
      actor_user_id: actor.userId,
      actor_role: actor.role,
      notes: 'Package scanned and measured at warehouse',
      metadata: {
        weight_g: parsed.data.weight_g ?? null,
        dimensions_mm: {
          length: parsed.data.length_mm ?? null,
          width: parsed.data.width_mm ?? null,
          height: parsed.data.height_mm ?? null,
        },
      },
    })

    // Keep the existing invoice UI coherent
    await admin
      .from('invoices')
      .update({ fulfillment_method: 'local_delivery', tracking_number: trackingNumber })
      .eq('id', invoice.id)

    await notifyUser(
      admin,
      invoice.buyer_id,
      `Your item is being prepared for local delivery`,
      `${lot?.title ?? 'Your won lot'} has been scanned at the warehouse. Tracking number: ${trackingNumber}.`,
      'delivery_update'
    )

    return NextResponse.json({ delivery }, { status: 201 })
  } catch (error) {
    console.error('Create delivery failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/delivery?q=&status= — admin search across order number, barcode,
// tracking number, customer, or driver.
export async function GET(request: NextRequest) {
  try {
    const actor = await getSessionActor()
    if (!actor || actor.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const status = request.nextUrl.searchParams.get('status')?.trim() ?? ''
    const admin = deliveryAdmin()

    let query = admin
      .from('deliveries')
      .select(
        `*,
         customer:users!deliveries_customer_user_id_fkey(id, email, first_name, last_name),
         driver:drivers(id, phone, vehicle_type, status, users(id, email, first_name, last_name)),
         lot:lots(id, title)`
      )
      .order('created_at', { ascending: false })
      .limit(50)

    if (status) query = query.eq('status', status)

    if (q) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)
      // Match users (customer or driver) by name/email first, then search
      const { data: matchedUsers } = await admin
        .from('users')
        .select('id')
        .or(`email.ilike.%${q.replace(/[,()]/g, '')}%,first_name.ilike.%${q.replace(/[,()]/g, '')}%,last_name.ilike.%${q.replace(/[,()]/g, '')}%`)
        .limit(20)
      const userIds = (matchedUsers ?? []).map((u) => u.id)

      let driverIds: string[] = []
      if (userIds.length > 0) {
        const { data: matchedDrivers } = await admin
          .from('drivers')
          .select('id')
          .in('user_id', userIds)
        driverIds = (matchedDrivers ?? []).map((d) => d.id)
      }

      const clauses = [
        `tracking_number.ilike.%${q.replace(/[,()]/g, '')}%`,
        `package_barcode.ilike.%${q.replace(/[,()]/g, '')}%`,
      ]
      if (isUuid) {
        clauses.push(`invoice_id.eq.${q}`, `id.eq.${q}`)
      }
      if (userIds.length > 0) clauses.push(`customer_user_id.in.(${userIds.join(',')})`)
      if (driverIds.length > 0) clauses.push(`driver_id.in.(${driverIds.join(',')})`)

      query = query.or(clauses.join(','))
    }

    const { data, error } = await query
    if (error) {
      console.error('Delivery search failed:', error.message)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    return NextResponse.json({ deliveries: data ?? [] })
  } catch (error) {
    console.error('Delivery search failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
