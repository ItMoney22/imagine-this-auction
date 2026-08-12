import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const SubscribeRequestSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
  // Client may send user_id/device metadata; the session user is authoritative
  user_id: z.string().uuid().optional(),
  device_type: z.string().optional(),
  user_agent: z.string().optional(),
})

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
    const validation = SubscribeRequestSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { subscription } = validation.data

    // A push endpoint is unique per browser subscription — if it's already
    // registered for this user there is nothing to change (RLS only grants
    // SELECT/INSERT on user_device_tokens).
    const { data: existing } = await supabase
      .from('user_device_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('endpoint', subscription.endpoint)
      .maybeSingle()

    if (!existing) {
      const { error } = await supabase.from('user_device_tokens').insert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })

      if (error) {
        console.error('Failed to save push subscription:', error.message)
        return NextResponse.json(
          { error: 'Failed to save subscription' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push subscribe API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
