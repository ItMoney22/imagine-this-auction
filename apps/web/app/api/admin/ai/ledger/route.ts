import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { assertAdminOrThrow } from '@/lib/api/admin-auth'
import { adminRpc, createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RefundSchema = z.object({
  ledger_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(400),
})

/**
 * The AI credit audit trail: user, action, cost, listing/item, timestamp,
 * provider job id, status and refund details.
 */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const actionKey = url.searchParams.get('action_key')
    const userId = url.searchParams.get('user_id')
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100) || 100, 500)

    const admin = createAdminClient()

    let query = admin
      .from('ai_credit_ledger')
      .select(
        `id, user_id, auctioneer_id, action_key, credit_cost, status, idempotency_key,
         draft_id, lot_id, image_job_id, provider, provider_job_id,
         wallet_ledger_id, refund_wallet_ledger_id, refunded_at, refund_reason,
         failure_reason, charged_at, created_at,
         users:user_id (email, first_name, last_name)`
      )
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)
    if (actionKey) query = query.eq('action_key', actionKey)
    if (userId) query = query.eq('user_id', userId)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const { data: totals } = await admin
      .from('ai_credit_ledger')
      .select('status, credit_cost')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())

    const summary = { charged: 0, refunded: 0, voided: 0, pending: 0, net_credits: 0 }

    for (const row of (totals ?? []) as Array<{ status: string; credit_cost: number }>) {
      if (row.status === 'charged') {
        summary.charged += 1
        summary.net_credits += row.credit_cost
      } else if (row.status === 'refunded') {
        summary.refunded += 1
      } else if (row.status === 'voided' || row.status === 'failed') {
        summary.voided += 1
      } else if (row.status === 'pending') {
        summary.pending += 1
      }
    }

    return NextResponse.json({ entries: data ?? [], summary_30d: summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load AI ledger'
    const status = message.includes('Admin') || message.includes('Authentication') ? 403 : 500

    return NextResponse.json({ error: message }, { status })
  }
}

/** Manual admin refund for a charged AI action. */
export async function POST(request: NextRequest) {
  try {
    const { user } = await assertAdminOrThrow(request)

    const parsed = RefundSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data, error } = await adminRpc<Record<string, unknown>>('ai_refund_action', {
      p_ledger_id: parsed.data.ledger_id,
      p_reason: `admin:${user.email ?? user.id} — ${parsed.data.reason}`,
    })

    if (error) throw new Error(error.message)

    const result = (data ?? {}) as Record<string, unknown>

    if (result.ok !== true) {
      return NextResponse.json(
        { error: String(result.error ?? 'Refund failed') },
        { status: 400 }
      )
    }

    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'refund_ai_credits',
      table_name: 'ai_credit_ledger',
      record_id: parsed.data.ledger_id,
      new_values: { reason: parsed.data.reason, refunded: result.refunded } as never,
    } as never)

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Refund failed'
    const status = message.includes('Admin') || message.includes('Authentication') ? 403 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
