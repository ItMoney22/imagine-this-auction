import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { assertAdminOrThrow } from '@/lib/api/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PriceUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        action_key: z.string().min(1).max(60),
        credit_cost: z.number().int().min(0).max(100_000).optional(),
        is_enabled: z.boolean().optional(),
        rate_limit_per_hour: z.number().int().min(1).max(10_000).optional(),
        label: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        provider: z.string().max(60).nullable().optional(),
        model: z.string().max(120).nullable().optional(),
      })
    )
    .min(1)
    .max(50),
})

/** Admin view of every configurable AI price. */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('ai_action_prices')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw new Error(error.message)

    // Rolling usage so the admin can see what a price change will affect.
    const { data: usage } = await admin
      .from('ai_credit_ledger')
      .select('action_key, credit_cost, status')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())

    const stats = new Map<string, { charged: number; credits: number; refunded: number }>()

    for (const row of (usage ?? []) as Array<{
      action_key: string
      credit_cost: number
      status: string
    }>) {
      const entry = stats.get(row.action_key) ?? { charged: 0, credits: 0, refunded: 0 }
      if (row.status === 'charged') {
        entry.charged += 1
        entry.credits += row.credit_cost
      } else if (row.status === 'refunded') {
        entry.refunded += 1
      }
      stats.set(row.action_key, entry)
    }

    return NextResponse.json({
      prices: (data ?? []).map((price: any) => ({
        ...price,
        usage_30d: stats.get(price.action_key) ?? { charged: 0, credits: 0, refunded: 0 },
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load AI pricing'
    const status = message.includes('Admin') || message.includes('Authentication') ? 403 : 500

    return NextResponse.json({ error: message }, { status })
  }
}

/** Update per-action credit prices, availability and rate limits. */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await assertAdminOrThrow(request)

    const parsed = PriceUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const results: Array<{ action_key: string; ok: boolean; error?: string }> = []

    for (const update of parsed.data.updates) {
      const { action_key, ...fields } = update

      const payload = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined)
      )

      if (Object.keys(payload).length === 0) {
        results.push({ action_key, ok: true })
        continue
      }

      const { error } = await admin
        .from('ai_action_prices')
        .update({ ...payload, updated_by: user.id } as never)
        .eq('action_key', action_key)

      results.push({ action_key, ok: !error, error: error?.message })
    }

    // Price changes are money changes — record who made them.
    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'update_ai_pricing',
      table_name: 'ai_action_prices',
      new_values: parsed.data.updates as never,
    } as never)

    const { data } = await admin
      .from('ai_action_prices')
      .select('*')
      .order('sort_order', { ascending: true })

    return NextResponse.json({ results, prices: data ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update AI pricing'
    const status = message.includes('Admin') || message.includes('Authentication') ? 403 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
