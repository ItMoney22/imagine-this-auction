import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Rewritten 2026-08-12 against the LIVE notifications schema:
//   notifications(id, user_id, title, message, type, is_read, batch_id,
//                 created_at, email_sent_at, push_sent_at)
// Rows are created by DB functions (place_bid → 'outbid',
// send_watchlist_ending_alerts → 'watchlist_ending') and admin announcements.
// This route emails every notification not yet delivered (email_sent_at NULL).

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://imaginethisauction.com'

const BatchRequestSchema = z.object({
  user_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(50),
  dry_run: z.boolean().default(false),
})

// Only deliver notifications younger than this — avoids blasting a stale
// backlog if the cron was ever paused.
const MAX_AGE_HOURS = 72

const CTA_BY_TYPE: Record<string, { label: string; path: string }> = {
  outbid: { label: 'Bid Again', path: '/dashboard' },
  watchlist_ending: { label: 'View Your Watchlist', path: '/dashboard' },
  announcement: { label: 'Open ImagineThisAuction', path: '/' },
}

function buildEmail(notification: { title: string; message: string; type: string | null }) {
  const cta = CTA_BY_TYPE[notification.type ?? ''] ?? {
    label: 'Open ImagineThisAuction',
    path: '/dashboard',
  }
  const link = `${SITE_URL}${cta.path}`

  return {
    subject: notification.title,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f7fafc;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 26px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 22px; font-weight: bold;">🔨 ImagineThisAuction</h1>
    </div>
    <div style="padding: 30px 24px;">
      <h2 style="margin: 0 0 12px 0; color: #1a202c; font-size: 20px;">${notification.title}</h2>
      <p style="margin: 0 0 24px 0; color: #4a5568; font-size: 15px;">${notification.message}</p>
      <div style="text-align: center;">
        <a href="${link}" style="background: #667eea; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">${cta.label}</a>
      </div>
    </div>
    <div style="background: #f8f9fa; padding: 18px; text-align: center; color: #6c757d; font-size: 12px;">
      <p style="margin: 0;">
        <a href="${SITE_URL}/settings/notifications" style="color: #6c757d;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`,
    text: `${notification.title}\n\n${notification.message}\n\n${cta.label}: ${link}\n\nManage preferences: ${SITE_URL}/settings/notifications`,
  }
}

// Caller must be an admin session or a cron request bearing CRON_SECRET.
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

  // Feature flag gate
  const { data: flag } = await admin
    .from('feature_flags')
    .select('is_enabled')
    .eq('flag_name', 'email_notifications')
    .single()

  if (!flag?.is_enabled) {
    return { success: true, skipped: 'email_notifications feature flag is disabled', processed: 0, successful: 0, failed: 0 }
  }

  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY is not configured', processed: 0, successful: 0, failed: 0 }
  }

  const since = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString()

  let query = admin
    .from('notifications')
    .select('id, user_id, title, message, type, created_at')
    .is('email_sent_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(opts.limit)

  if (opts.user_id) {
    query = query.eq('user_id', opts.user_id)
  }

  const { data: notifications, error: fetchError } = await query

  if (fetchError) {
    // Missing column = migration 014 not applied yet — say so plainly
    const hint = fetchError.message.includes('email_sent_at')
      ? 'Run migration 014_notification_delivery.sql (adds email_sent_at/push_sent_at)'
      : undefined
    return { success: false, error: `Failed to fetch notifications: ${fetchError.message}`, hint, processed: 0, successful: 0, failed: 0 }
  }

  if (!notifications || notifications.length === 0) {
    return { success: true, message: 'No pending email notifications', processed: 0, successful: 0, failed: 0 }
  }

  // Resolve recipient emails in one query
  const userIds = [...new Set(notifications.map((n) => n.user_id))]
  const { data: users } = await admin
    .from('users')
    .select('id, email, first_name')
    .in('id', userIds)
  const usersById = new Map((users ?? []).map((u) => [u.id, u]))

  const resend = new Resend(process.env.RESEND_API_KEY)
  let successful = 0
  let failed = 0
  const errors: Array<{ notification_id: string; error: string }> = []

  for (const notification of notifications) {
    const recipient = usersById.get(notification.user_id)
    if (!recipient?.email) {
      // No deliverable address — mark handled so it isn't retried forever
      if (!opts.dry_run) {
        await admin
          .from('notifications')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', notification.id)
      }
      failed++
      errors.push({ notification_id: notification.id, error: 'No email address for user' })
      continue
    }

    if (opts.dry_run) {
      successful++
      continue
    }

    try {
      const email = buildEmail(notification)
      const result = await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@imaginethisauction.com',
        to: recipient.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: { 'X-Notification-ID': notification.id },
      })

      if (result.error) {
        throw new Error(result.error.message)
      }

      await admin
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', notification.id)

      successful++
      // Light throttle for provider rate limits
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      // Leave email_sent_at NULL — retried on the next batch run
      failed++
      errors.push({
        notification_id: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
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
    const parsed = BatchRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const result = await runBatch(parsed.data)
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error) {
    console.error('Email batch delivery failed:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET doubles as the Vercel cron entrypoint (crons issue GET with
// Authorization: Bearer CRON_SECRET) and as a health check otherwise.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')

  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    const result = await runBatch({ limit: 50, dry_run: false })
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  }

  return NextResponse.json({
    status: 'healthy',
    provider: 'resend',
    api_key_configured: !!process.env.RESEND_API_KEY,
    cron_configured: !!cronSecret,
    from_email: process.env.FROM_EMAIL || 'noreply@imaginethisauction.com',
    site_url: SITE_URL,
  })
}
