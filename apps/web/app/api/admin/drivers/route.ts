import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { deliveryAdmin, getSessionActor } from '@/lib/delivery/service'

const CreateDriverSchema = z.object({
  action: z.literal('create'),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  vehicle_type: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
})

const UpdateDriverSchema = z.object({
  action: z.literal('update'),
  driver_id: z.string().uuid(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  phone: z.string().max(40).optional(),
  vehicle_type: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
})

const DriverRequestSchema = z.discriminatedUnion('action', [CreateDriverSchema, UpdateDriverSchema])

// GET /api/admin/drivers — roster with user info.
export async function GET() {
  const actor = await getSessionActor()
  if (!actor || actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const admin = deliveryAdmin()
  const { data, error } = await admin
    .from('drivers')
    .select('*, users(id, email, first_name, last_name)')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ drivers: data ?? [] })
}

// POST /api/admin/drivers — create a driver from an existing user account, or
// update a driver's status/details.
export async function POST(request: NextRequest) {
  try {
    const actor = await getSessionActor()
    if (!actor || actor.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = DriverRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const admin = deliveryAdmin()

    if (parsed.data.action === 'create') {
      const { data: user } = await admin
        .from('users')
        .select('id, role, email')
        .eq('email', parsed.data.email.toLowerCase())
        .maybeSingle()
      if (!user) {
        return NextResponse.json(
          { error: 'No account with that email — the driver must sign up first' },
          { status: 404 }
        )
      }
      if (user.role === 'admin' || user.role === 'auctioneer') {
        return NextResponse.json(
          { error: `That account is an ${user.role} — pick a different account` },
          { status: 400 }
        )
      }

      const { data: driver, error: insertError } = await admin
        .from('drivers')
        .insert({
          user_id: user.id,
          status: 'active',
          phone: parsed.data.phone ?? null,
          vehicle_type: parsed.data.vehicle_type ?? null,
          notes: parsed.data.notes ?? null,
        })
        .select()
        .single()
      if (insertError) {
        const conflict = insertError.message.includes('duplicate')
        return NextResponse.json(
          { error: conflict ? 'That user is already a driver' : insertError.message },
          { status: conflict ? 409 : 500 }
        )
      }

      // Direct role update (the change_user_role RPC does not exist in the live DB)
      const { error: roleError } = await admin
        .from('users')
        .update({ role: 'driver' })
        .eq('id', user.id)
      if (roleError) {
        return NextResponse.json(
          { error: `Driver created but role update failed: ${roleError.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({ driver }, { status: 201 })
    }

    // action === 'update'
    const updates: Record<string, unknown> = {}
    if (parsed.data.status) updates.status = parsed.data.status
    if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone
    if (parsed.data.vehicle_type !== undefined) updates.vehicle_type = parsed.data.vehicle_type
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes

    const { data: driver, error } = await admin
      .from('drivers')
      .update(updates)
      .eq('id', parsed.data.driver_id)
      .select()
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ driver })
  } catch (error) {
    console.error('Driver management failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
