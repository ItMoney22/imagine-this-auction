import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import webpush from 'web-push'
import { z } from 'zod'

// Initialize web push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'noreply@imaginethisauction.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

const PushRequestSchema = z.object({
  user_id: z.string().uuid().optional(),
  batch_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(50),
  dry_run: z.boolean().default(false),
})

const SubscribeRequestSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    })
  }),
  user_id: z.string().uuid(),
  device_type: z.enum(['web', 'ios', 'android']).default('web'),
  user_agent: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const url = new URL(request.url)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Handle subscription endpoint
    if (url.pathname.endsWith('/subscribe')) {
      return handleSubscribe(request, supabase)
    }

    // Handle batch push delivery
    const body = await request.json()
    const { user_id, batch_id, limit, dry_run } = PushRequestSchema.parse(body)

    console.log('Processing push batch:', { user_id, batch_id, limit, dry_run })

    // Check if push notifications are enabled
    const { data: flagData } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_name', 'PUSH_NOTIFICATIONS')
      .single()

    if (!flagData?.enabled) {
      return NextResponse.json(
        { error: 'Push notifications are currently disabled' },
        { status: 503 }
      )
    }

    // Get pending push notifications
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('type', 'push')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(limit)

    if (batch_id) {
      query = query.eq('metadata->>batch_id', batch_id)
    }

    if (user_id) {
      query = query.eq('user_id', user_id)
    }

    const { data: notifications, error: fetchError } = await query

    if (fetchError) {
      throw new Error(`Failed to fetch notifications: ${fetchError.message}`)
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending push notifications found',
        processed: 0,
        successful: 0,
        failed: 0
      })
    }

    console.log(`Found ${notifications.length} push notifications to process`)

    let successful = 0
    let failed = 0
    const errors: any[] = []
    const results: any[] = []

    // Mark notifications as processing
    const notificationIds = notifications.map(n => n.id)
    await supabase
      .from('notifications')
      .update({ status: 'processing' })
      .in('id', notificationIds)

    for (const notification of notifications) {
      try {
        // Get user's device tokens
        const { data: tokens, error: tokensError } = await supabase
          .from('user_device_tokens')
          .select('*')
          .eq('user_id', notification.user_id)
          .eq('is_active', true)

        if (tokensError || !tokens || tokens.length === 0) {
          throw new Error('No active device tokens found')
        }

        if (dry_run) {
          console.log(`[DRY RUN] Would send push to ${tokens.length} devices for user ${notification.user_id}`)
          successful++
          continue
        }

        const content = notification.content as any
        const pushPayload = {
          title: content.title || notification.subject,
          body: content.body || 'New auction notification',
          icon: content.icon || '/icon-192x192.png',
          badge: content.badge || '/badge-72x72.png',
          image: content.image,
          data: {
            ...content.data,
            notification_id: notification.id,
            url: content.data?.url || '/'
          },
          tag: content.tag || `auction-${notification.id}`,
          requireInteraction: content.requireInteraction || false,
          silent: content.silent || false,
          vibrate: content.vibrate || [200, 100, 200]
        }

        let devicesSent = 0
        let devicesError = 0

        // Send to each device
        for (const token of tokens) {
          try {
            const subscription = {
              endpoint: token.token,
              keys: JSON.parse(token.user_agent || '{}')
            }

            await webpush.sendNotification(
              subscription,
              JSON.stringify(pushPayload),
              {
                TTL: 24 * 60 * 60, // 24 hours
                urgency: 'normal'
              }
            )

            devicesSent++

            // Update token last used
            await supabase
              .from('user_device_tokens')
              .update({ last_used: new Date().toISOString() })
              .eq('id', token.id)

          } catch (deviceError) {
            console.error(`Failed to send to device ${token.id}:`, deviceError)
            devicesError++

            // Deactivate token if it's invalid
            if (deviceError.statusCode === 410 || deviceError.statusCode === 404) {
              await supabase
                .from('user_device_tokens')
                .update({ is_active: false })
                .eq('id', token.id)
            }
          }
        }

        if (devicesSent > 0) {
          // Update notification as sent
          await supabase
            .from('notifications')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              metadata: {
                ...notification.metadata,
                devices_sent: devicesSent,
                devices_error: devicesError,
                provider: 'web-push'
              }
            })
            .eq('id', notification.id)

          successful++
          results.push({
            notification_id: notification.id,
            user_id: notification.user_id,
            devices_sent: devicesSent,
            devices_error: devicesError,
            status: 'sent'
          })

          console.log(`Push sent successfully: ${notification.id} -> ${devicesSent} devices`)
        } else {
          throw new Error('Failed to send to any devices')
        }

      } catch (error) {
        console.error(`Failed to send push ${notification.id}:`, error)

        // Update notification as failed
        await supabase
          .from('notifications')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', notification.id)

        failed++
        errors.push({
          notification_id: notification.id,
          user_id: notification.user_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const result = {
      success: true,
      processed: notifications.length,
      successful,
      failed,
      dry_run,
      results: results.length > 0 ? results.slice(0, 10) : undefined,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      provider: 'web-push'
    }

    console.log('Push batch completed:', result)
    return NextResponse.json(result)

  } catch (error) {
    console.error('Push batch delivery failed:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function handleSubscribe(request: NextRequest, supabase: any) {
  try {
    const body = await request.json()
    const { subscription, user_id, device_type, user_agent } = SubscribeRequestSchema.parse(body)

    console.log('Registering push subscription for user:', user_id)

    // Store device token
    const { error: insertError } = await supabase
      .from('user_device_tokens')
      .upsert({
        user_id,
        token: subscription.endpoint,
        device_type,
        user_agent: JSON.stringify(subscription.keys),
        is_active: true,
        last_used: new Date().toISOString()
      }, {
        onConflict: 'user_id,token'
      })

    if (insertError) {
      throw new Error(`Failed to store device token: ${insertError.message}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Push subscription registered successfully'
    })

  } catch (error) {
    console.error('Failed to register push subscription:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid subscription data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to register subscription' },
      { status: 500 }
    )
  }
}

// Health check and configuration
export async function GET() {
  try {
    const hasVapidKeys = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

    return NextResponse.json({
      status: 'healthy',
      vapid_configured: hasVapidKeys,
      vapid_public_key: process.env.VAPID_PUBLIC_KEY || null,
      vapid_email: process.env.VAPID_EMAIL || 'noreply@imaginethisauction.com',
      features: {
        web_push: true,
        device_management: true,
        batch_processing: true,
        dry_run: true
      }
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: 'Configuration error' },
      { status: 500 }
    )
  }
}
