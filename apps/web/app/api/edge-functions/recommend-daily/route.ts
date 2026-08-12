import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/api/admin-auth'

// Admin-only proxy to the `recommend-daily` Supabase Edge Function so the
// dashboard can trigger it manually without exposing the service-role key.
export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase configuration missing' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))

    const response = await fetch(`${supabaseUrl}/functions/v1/recommend-daily`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body ?? {}),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result?.error || `Edge function failed (${response.status})`,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('recommend-daily proxy error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
