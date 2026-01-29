import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request payload
    const { record, old_record } = await req.json()

    console.log('Lot publish trigger:', {
      lot_id: record.id,
      old_status: old_record?.status,
      new_status: record.status,
      has_hype_copy: !!record.hype_copy
    })

    // Check if this is a status transition to 'published' or 'live'
    const isNewlyPublished = (
      (old_record?.status !== 'published' && record.status === 'published') ||
      (old_record?.status !== 'live' && record.status === 'live')
    )

    if (!isNewlyPublished) {
      console.log('Not a publish transition, skipping')
      return new Response(
        JSON.stringify({ message: 'No action needed' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if hype copy needs to be generated
    if (!record.hype_copy) {
      console.log(`Generating hype copy for lot ${record.id}`)

      try {
        // Prepare lot data for copywriter API
        const lotData = {
          id: record.id,
          title: record.title,
          description: record.description,
          category: record.category,
          brand: record.brand,
          start_price_itc: record.start_price_itc,
          estimate_low_itc: record.estimate_low_itc,
          estimate_high_itc: record.estimate_high_itc,
          tags: record.tags || []
        }

        // Call copywriter API
        const copywriterUrl = `${Deno.env.get('SITE_URL')}/api/ai/copywriter`
        const copywriterResponse = await fetch(copywriterUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            lots: [lotData],
            style: 'Hype', // Default style for published lots
            batch_id: `publish-${record.id}-${Date.now()}`
          })
        })

        if (!copywriterResponse.ok) {
          throw new Error(`Copywriter API failed: ${copywriterResponse.statusText}`)
        }

        const copywriterResult = await copywriterResponse.json()
        console.log('Copywriter result:', {
          success: copywriterResult.success,
          successful: copywriterResult.successful,
          failed: copywriterResult.failed
        })

        if (!copywriterResult.success || copywriterResult.failed > 0) {
          console.error('Copywriter failed for lot:', copywriterResult.errors)
        }

      } catch (error) {
        console.error('Failed to generate hype copy:', error)
        // Continue with other processing even if hype copy fails
      }
    }

    // Trigger interest-based notifications for users who might be interested
    if (record.status === 'published' || record.status === 'live') {
      console.log(`Triggering interest notifications for lot ${record.id}`)

      try {
        // Find users who might be interested based on their interests
        const lotTags = [
          record.category,
          record.brand,
          ...(record.tags || [])
        ].filter(Boolean)

        if (lotTags.length > 0) {
          // Get users with matching interests
          const { data: interestedUsers, error: usersError } = await supabase
            .from('user_interests')
            .select(`
              user_id,
              tag,
              weight,
              users!inner(id, email, notification_prefs, first_name, last_name)
            `)
            .in('tag', lotTags)
            .eq('users.is_approved', true)
            .order('weight', { ascending: false })

          if (usersError) {
            throw new Error(`Failed to find interested users: ${usersError.message}`)
          }

          if (interestedUsers && interestedUsers.length > 0) {
            console.log(`Found ${interestedUsers.length} potentially interested users`)

            // Group by user and calculate total interest score
            const userScores = new Map()
            for (const interest of interestedUsers) {
              const userId = interest.user_id
              const currentScore = userScores.get(userId) || { user: interest.users, score: 0 }
              currentScore.score += interest.weight
              userScores.set(userId, currentScore)
            }

            // Get top interested users (score > 2)
            const topUsers = Array.from(userScores.values())
              .filter(u => u.score > 2)
              .slice(0, 50) // Limit to prevent spam

            console.log(`Notifying ${topUsers.length} top interested users`)

            // Queue notifications for interested users
            const notifications = []
            for (const { user, score } of topUsers) {
              const prefs = user.notification_prefs

              // Check quiet hours
              const now = new Date()
              const currentHour = now.getHours()
              const [quietStart, quietEnd] = prefs.quiet_hours || [22, 7]

              const isQuietTime = quietStart > quietEnd
                ? (currentHour >= quietStart || currentHour < quietEnd)
                : (currentHour >= quietStart && currentHour < quietEnd)

              if (isQuietTime) {
                // Schedule for after quiet hours
                const scheduledTime = new Date()
                if (quietEnd < currentHour) {
                  scheduledTime.setDate(scheduledTime.getDate() + 1)
                }
                scheduledTime.setHours(quietEnd, 0, 0, 0)

                // Email notification
                if (prefs.email) {
                  notifications.push({
                    user_id: user.id,
                    type: 'email',
                    subject: `New item in your interest area: ${record.title}`,
                    content: {
                      user,
                      lot: record,
                      interest_score: score,
                      matched_tags: lotTags,
                      unsubscribe_url: `${Deno.env.get('SITE_URL')}/settings/notifications?token=${user.id}`
                    },
                    priority: 3,
                    scheduled_for: scheduledTime.toISOString(),
                    metadata: { trigger: 'lot_publish', interest_score: score }
                  })
                }

                // Push notification (immediate for high-interest items)
                if (prefs.push && score >= 5 && record.hype_copy) {
                  const hypeData = record.hype_copy
                  notifications.push({
                    user_id: user.id,
                    type: 'push',
                    subject: hypeData.push_title || record.title,
                    content: {
                      title: hypeData.push_title || record.title,
                      body: hypeData.push_body || `New ${record.category} item matches your interests`,
                      icon: '/icon-192x192.png',
                      badge: '/badge-72x72.png',
                      data: {
                        lot_id: record.id,
                        auction_id: record.auction_id,
                        url: `/lots/${record.id}`,
                        type: 'interest_match',
                        score
                      }
                    },
                    priority: 2,
                    scheduled_for: new Date().toISOString(),
                    metadata: { trigger: 'lot_publish', interest_score: score }
                  })
                }
              }
            }

            // Batch insert notifications
            if (notifications.length > 0) {
              const { error: notifError } = await supabase
                .from('notifications')
                .insert(notifications)

              if (notifError) {
                console.error('Failed to queue notifications:', notifError)
              } else {
                console.log(`Queued ${notifications.length} notifications`)
              }
            }
          }
        }

      } catch (error) {
        console.error('Failed to process interest notifications:', error)
        // Continue even if notifications fail
      }
    }

    // Update user interests based on the published lot
    try {
      // This could be expanded to update interests for users who interact with the lot
      console.log('Lot publish processing completed successfully')
    } catch (error) {
      console.error('Error in interest updates:', error)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Lot publish processing completed',
        lot_id: record.id,
        status: record.status,
        hype_copy_generated: !record.hype_copy, // True if we generated it
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Lot publish trigger failed:', error)
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