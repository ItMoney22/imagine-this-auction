import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Rewritten 2026-08-12 against the LIVE schema:
//   notifications(id, user_id, title, message, type, is_read, batch_id,
//                 created_at, email_sent_at, push_sent_at)
//   user_device_tokens(id, user_id, endpoint, p256dh, auth, last_used, created_at)
// Subscriptions are registered by POST /api/notifications/push/subscribe.

// trim(): the Vercel-stored NEXT_PUBLIC_APP_URL carries a trailing newline
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://imaginethisauction.com'
).trim()

const VAPID_CONFIGURED = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

if (VAPID_CONFIGURED) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'noreply@imaginethisauction.com'}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
}

const PushRequestSchema = z.object({
  user_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(50),
  dry_run: z.boolean().default(false),
})

const MAX_AGE_HOURS = 72

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin'
}

async function runBatch(opts: { user_id?: string; limit: number; dry_run: boolean }) {
  const admin: SupabaseClient = createAdminClient()

  const { data: flag } = await admin
    .from('feature_flags')
    .select('is_enabled')
    .eq('flag_name', 'push_notifications')
    .single()

  if (!flag?.is_enabled) {
    return { success: true, skipped: 'push_notifications feature flag is disabled', processed: 0, successful: 0, failed: 0 }
  }

  if (!VAPID_CONFIGURED) {
    return { success: false, error: 'VAPID keys are not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)', processed: 0, successful: 0, failed: 0 }
  }

  const since = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString()

  let query = admin
    .from('notifications')
    .select('id, user_id, title, message, type, created_at')
    .is('push_sent_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(opts.limit)

  if (opts.user_id) {
    query = query.eq('user_id', opts.user_id)
  }

  const { data: notifications, error: fetchError } = await query

  if (fetchError) {
    const hint = fetchError.message.includes('push_sent_at')
      ? 'Run migration 014_notification_delivery.sql (adds email_sent_at/push_sent_at)'
      : undefined
    return { success: false, error: `Failed to fetch notifications: ${fetchError.message}`, hint, processed: 0, successful: 0, failed: 0 }
  }

  if (!notifications || notifications.length === 0) {
    return { success: true, message: 'No pending push notifications', processed: 0, successful: 0, failed: 0 }
  }

  // All device tokens for the affected users in one query
  const userIds = [...new Set(notifications.map((n) => n.user_id))]
  const { data: tokens } = await admin
    .from('user_device_tokens')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  const tokensByUser = new Map<string, NonNullable<typeof tokens>>()
  for (const t of tokens ?? []) {
    const list = tokensByUser.get(t.user_id) ?? []
    list.push(t)
    tokensByUser.set(t.user_id, list)
  }

  let successful = 0
  let failed = 0
  const errors: Array<{ notification_id: string; error: string }> = []

  for (const notification of notifications) {
    const devices = tokensByUser.get(notification.user_id) ?? []

    if (opts.dry_run) {
      successful += devices.length > 0 ? 1 : 0
      continue
    }

    let delivered = 0
    for (const device of devices) {
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          },
          JSON.stringify({
            title: notification.title,
            body: notification.message,
            icon: '/icon-192x192.png',
            data: { type: notification.type, url: `${SITE_URL}/dashboard` },
          })
        )
        delivered++
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired/revoked — prune it
          await admin.from('user_device_tokens').delete().eq('id', device.id)
        } else {
          errors.push({
            notification_id: notification.id,
            error: error instanceof Error ? error.message : 'Push send failed',
          })
        }
      }
    }

    // Mark processed either way: users without devices shouldn't be
    // rescanned forever, and per-device failures were logged above.
    await admin
      .from('notifications')
      .update({ push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    if (devices.length === 0 || delivered > 0) {
      successful++
    } else {
      failed++
    }
  }

  return {
    success: true,
    processed: notifications.length,
    successful,
    failed,
    dry_run: opts.dry_run,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Admin or cron authorization required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = PushRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const result = await runBatch(parsed.data)
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error) {
    console.error('Push batch delivery failed:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET doubles as the Vercel cron entrypoint (Authorization: Bearer CRON_SECRET)
// and as a health/VAPID-key endpoint otherwise.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')

  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    const result = await runBatch({ limit: 50, dry_run: false })
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  }

  return NextResponse.json({
    status: 'healthy',
    vapid_configured: VAPID_CONFIGURED,
    cron_configured: !!cronSecret,
    public_key: process.env.VAPID_PUBLIC_KEY || null,
  })
}
