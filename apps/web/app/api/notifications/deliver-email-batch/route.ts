import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { z } from 'zod'

// Initialize email service based on provider
function getEmailService() {
  const provider = process.env.EMAIL_PROVIDER || 'resend'

  switch (provider) {
    case 'resend':
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is required')
      }
      return new Resend(process.env.RESEND_API_KEY)
    case 'ses':
      // AWS SES implementation would go here
      throw new Error('AWS SES provider not implemented yet')
    default:
      throw new Error(`Unsupported email provider: ${provider}`)
  }
}

const BatchRequestSchema = z.object({
  batch_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(50),
  dry_run: z.boolean().default(false),
})

// Email templates
function getDailyDigestTemplate(data: any) {
  const { user, recommendations, unsubscribe_url } = data

  const recommendationsHtml = recommendations.map((lot: any) => {
    const hype = lot.hype_copy || {}
    const priceDisplay = lot.start_price_itc
      ? `Starting at ${lot.start_price_itc} ITC`
      : 'Contact for pricing'

    return `
      <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: white;">
        <h3 style="margin: 0 0 10px 0; color: #1a202c; font-size: 18px;">${hype.headline || lot.title}</h3>
        <p style="margin: 0 0 10px 0; color: #4a5568; font-size: 14px;">${hype.teaser || lot.description.slice(0, 200)}...</p>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
          <span style="color: #2d3748; font-weight: bold;">${priceDisplay}</span>
          <a href="${process.env.NEXT_PUBLIC_SITE_URL}/lots/${lot.id}"
             style="background: #667eea; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;">
            ${hype.cta || 'View Details'}
          </a>
        </div>
        <p style="margin: 10px 0 0 0; color: #a0aec0; font-size: 12px;">
          Ends: ${new Date(lot.ends_at).toLocaleDateString()} | Category: ${lot.category}
        </p>
      </div>
    `
  }).join('')

  return {
    subject: `Your Daily Auction Picks - ${recommendations.length} items ending soon`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Auction Recommendations</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f7fafc;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: bold;">🔨 ImagineThis Auction</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Your personalized auction recommendations</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      <p style="margin: 0 0 20px 0; font-size: 16px;">Hi ${user.first_name || 'there'},</p>

      <p style="margin: 0 0 25px 0; color: #4a5568;">
        We've found ${recommendations.length} auction items that match your interests. These lots are ending soon, so don't miss out!
      </p>

      ${recommendationsHtml}

      <div style="text-align: center; margin-top: 30px; padding-top: 30px; border-top: 1px solid #e2e8f0;">
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/auctions"
           style="background: #48bb78; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          View All Auctions
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
      <p style="margin: 0 0 10px 0;">
        You're receiving this because you subscribed to auction recommendations.
      </p>
      <p style="margin: 0;">
        <a href="${unsubscribe_url}" style="color: #6c757d;">Unsubscribe</a> |
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/settings/notifications" style="color: #6c757d;">Manage Preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
Daily Auction Recommendations - ${recommendations.length} items

Hi ${user.first_name || 'there'},

We've found ${recommendations.length} auction items that match your interests:

${recommendations.map((lot: any, i: number) => `
${i + 1}. ${lot.title}
   ${lot.description.slice(0, 100)}...
   ${lot.start_price_itc ? `Starting at ${lot.start_price_itc} ITC` : 'Contact for pricing'}
   View: ${process.env.NEXT_PUBLIC_SITE_URL}/lots/${lot.id}
`).join('\n')}

View all auctions: ${process.env.NEXT_PUBLIC_SITE_URL}/auctions

Unsubscribe: ${unsubscribe_url}
    `.trim()
  }
}

function getLotAlertTemplate(data: any) {
  const { user, lot, interest_score, matched_tags } = data
  const hype = lot.hype_copy || {}

  return {
    subject: hype.email_subject || `New item in your interest area: ${lot.title}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auction Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f7fafc;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: bold;">🎯 Interest Match!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">A new item matches your interests</p>
    </div>

    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 15px 0; color: #1a202c; font-size: 22px;">${hype.headline || lot.title}</h2>
      <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px;">${hype.teaser || lot.description}</p>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; color: #4a5568;"><strong>Match Score:</strong> ${interest_score}/10</p>
        <p style="margin: 0; color: #4a5568;"><strong>Matched Interests:</strong> ${matched_tags.join(', ')}</p>
      </div>

      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/lots/${lot.id}"
           style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
          ${hype.cta || 'View Details'}
        </a>
      </div>
    </div>

    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
      <p style="margin: 0;">
        <a href="${data.unsubscribe_url}" style="color: #6c757d;">Unsubscribe</a> |
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/settings/notifications" style="color: #6c757d;">Manage Preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `
Interest Match Alert!

${lot.title}

${lot.description}

Match Score: ${interest_score}/10
Matched Interests: ${matched_tags.join(', ')}

View details: ${process.env.NEXT_PUBLIC_SITE_URL}/lots/${lot.id}

Unsubscribe: ${data.unsubscribe_url}
    `.trim()
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { batch_id, user_id, limit, dry_run } = BatchRequestSchema.parse(body)

    console.log('Processing email batch:', { batch_id, user_id, limit, dry_run })

    // Get pending email notifications
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('type', 'email')
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
        message: 'No pending email notifications found',
        processed: 0,
        successful: 0,
        failed: 0
      })
    }

    console.log(`Found ${notifications.length} notifications to process`)

    const emailService = getEmailService()
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
        if (dry_run) {
          console.log(`[DRY RUN] Would send email to user ${notification.user_id}:`, {
            subject: notification.subject,
            content_type: typeof notification.content
          })
          successful++
          continue
        }

        // Determine email template based on content
        let emailData
        const content = notification.content as any

        if (content.recommendations) {
          // Daily digest
          emailData = getDailyDigestTemplate(content)
        } else if (content.lot) {
          // Lot alert
          emailData = getLotAlertTemplate(content)
        } else {
          throw new Error('Unknown email template type')
        }

        // Send email via Resend
        const result = await emailService.emails.send({
          from: process.env.FROM_EMAIL || 'noreply@imaginethisauction.com',
          to: content.user.email,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          headers: {
            'X-Notification-ID': notification.id,
            'X-User-ID': notification.user_id,
          }
        })

        if (result.error) {
          throw new Error(result.error.message)
        }

        // Update notification as sent
        await supabase
          .from('notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            metadata: {
              ...notification.metadata,
              email_id: result.data?.id,
              provider: 'resend'
            }
          })
          .eq('id', notification.id)

        successful++
        results.push({
          notification_id: notification.id,
          user_id: notification.user_id,
          email_id: result.data?.id,
          status: 'sent'
        })

        console.log(`Email sent successfully: ${notification.id} -> ${content.user.email}`)

        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`Failed to send email ${notification.id}:`, error)

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
      provider: process.env.EMAIL_PROVIDER || 'resend'
    }

    console.log('Email batch completed:', result)

    return NextResponse.json(result)

  } catch (error) {
    console.error('Email batch delivery failed:', error)

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

// Health check
export async function GET() {
  try {
    const provider = process.env.EMAIL_PROVIDER || 'resend'
    const hasApiKey = !!(
      process.env.RESEND_API_KEY ||
      process.env.AWS_ACCESS_KEY_ID
    )

    return NextResponse.json({
      status: 'healthy',
      provider,
      api_key_configured: hasApiKey,
      from_email: process.env.FROM_EMAIL || 'noreply@imaginethisauction.com',
      features: {
        daily_digest: true,
        lot_alerts: true,
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
