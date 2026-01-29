import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface UserPreferences {
  email: boolean
  push: boolean
  sms: boolean
  quiet_hours: [number, number]
}

interface RecommendationResult {
  lot_id: string
  score: number
  reasons: string[]
}

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if this is a manual trigger or scheduled
    const isManual = req.method === 'POST'
    const { user_id: targetUserId } = isManual ? await req.json() : {}

    console.log(`Starting daily recommendations job ${isManual ? 'for user ' + targetUserId : 'for all users'}`)

    // Get all active users with notification preferences
    let userQuery = supabase
      .from('users')
      .select('id, email, notification_prefs, first_name, last_name')
      .eq('is_approved', true)

    if (targetUserId) {
      userQuery = userQuery.eq('id', targetUserId)
    }

    const { data: users, error: usersError } = await userQuery

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`)
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No eligible users found' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${users.length} users`)

    let processedUsers = 0
    let skippedUsers = 0
    let notificationsQueued = 0
    const errors: string[] = []

    // Create batch record
    const batchId = crypto.randomUUID()
    const { error: batchError } = await supabase
      .from('notification_batches')
      .insert({
        id: batchId,
        batch_type: 'daily_digest',
        user_count: users.length,
        status: 'processing',
        started_at: new Date().toISOString(),
        metadata: { trigger: isManual ? 'manual' : 'scheduled' }
      })

    if (batchError) {
      console.error('Failed to create batch record:', batchError)
    }

    for (const user of users) {
      try {
        const prefs = user.notification_prefs as UserPreferences

        // Check quiet hours
        const now = new Date()
        const currentHour = now.getHours()
        const [quietStart, quietEnd] = prefs.quiet_hours || [22, 7]

        const isQuietTime = quietStart > quietEnd
          ? (currentHour >= quietStart || currentHour < quietEnd)
          : (currentHour >= quietStart && currentHour < quietEnd)

        if (isQuietTime && !isManual) {
          console.log(`Skipping user ${user.id} - quiet hours`)
          skippedUsers++
          continue
        }

        // Get user recommendations
        const { data: recommendations, error: recError } = await supabase
          .rpc('get_user_recommendations', {
            p_user_id: user.id,
            p_limit: 3
          })

        if (recError) {
          console.error(`Failed to get recommendations for user ${user.id}:`, recError)
          errors.push(`User ${user.id}: ${recError.message}`)
          continue
        }

        if (!recommendations || recommendations.length === 0) {
          console.log(`No recommendations for user ${user.id}`)
          skippedUsers++
          continue
        }

        // Get lot details for recommendations
        const lotIds = recommendations.map((r: RecommendationResult) => r.lot_id)
        const { data: lots, error: lotsError } = await supabase
          .from('lots')
          .select(`
            id, title, description, category, brand, start_price_itc,
            estimate_low_itc, estimate_high_itc, ends_at, hype_copy,
            auctions!inner(id, title, status, ends_at)
          `)
          .in('id', lotIds)
          .eq('auctions.status', 'live')

        if (lotsError || !lots || lots.length === 0) {
          console.log(`No valid lots found for user ${user.id}`)
          skippedUsers++
          continue
        }

        // Prepare notification content
        const topLot = lots[0]
        const emailContent = {
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name
          },
          recommendations: lots.map(lot => {
            const rec = recommendations.find((r: RecommendationResult) => r.lot_id === lot.id)
            return {
              ...lot,
              score: rec?.score || 0,
              reasons: rec?.reasons || []
            }
          }),
          unsubscribe_url: `${Deno.env.get('SITE_URL')}/settings/notifications?token=${user.id}`,
          batch_id: batchId
        }

        // Queue email notification
        if (prefs.email) {
          const { error: emailError } = await supabase
            .from('notifications')
            .insert({
              user_id: user.id,
              type: 'email',
              subject: `Your Daily Auction Picks - ${lots.length} items ending soon`,
              content: emailContent,
              priority: 2,
              scheduled_for: new Date().toISOString(),
              metadata: { batch_id: batchId, recommendation_count: lots.length }
            })

          if (emailError) {
            console.error(`Failed to queue email for user ${user.id}:`, emailError)
            errors.push(`Email for ${user.id}: ${emailError.message}`)
          } else {
            notificationsQueued++
          }
        }

        // Queue push notification for top recommendation
        if (prefs.push && topLot.hype_copy) {
          const hypeData = topLot.hype_copy as any
          const { error: pushError } = await supabase
            .from('notifications')
            .insert({
              user_id: user.id,
              type: 'push',
              subject: hypeData.push_title || topLot.title,
              content: {
                title: hypeData.push_title || topLot.title,
                body: hypeData.push_body || topLot.description.slice(0, 120),
                icon: '/icon-192x192.png',
                badge: '/badge-72x72.png',
                data: {
                  lot_id: topLot.id,
                  auction_id: topLot.auctions.id,
                  url: `/lots/${topLot.id}`,
                  type: 'recommendation'
                }
              },
              priority: 3,
              scheduled_for: new Date().toISOString(),
              metadata: { batch_id: batchId, score: recommendations[0]?.score || 0 }
            })

          if (pushError) {
            console.error(`Failed to queue push for user ${user.id}:`, pushError)
            errors.push(`Push for ${user.id}: ${pushError.message}`)
          } else {
            notificationsQueued++
          }
        }

        processedUsers++
        console.log(`Processed user ${user.id} - ${lots.length} recommendations`)

      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error)
        errors.push(`User ${user.id}: ${error.message}`)
      }
    }

    // Update batch record
    await supabase
      .from('notification_batches')
      .update({
        sent_count: notificationsQueued,
        failed_count: errors.length,
        status: errors.length === 0 ? 'completed' : 'completed_with_errors',
        completed_at: new Date().toISOString(),
        metadata: {
          trigger: isManual ? 'manual' : 'scheduled',
          processed_users: processedUsers,
          skipped_users: skippedUsers,
          errors: errors.slice(0, 10) // Limit error logging
        }
      })
      .eq('id', batchId)

    const result = {
      success: true,
      batch_id: batchId,
      processed_users: processedUsers,
      skipped_users: skippedUsers,
      notifications_queued: notificationsQueued,
      errors_count: errors.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined
    }

    console.log('Daily recommendations completed:', result)

    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Daily recommendations failed:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})