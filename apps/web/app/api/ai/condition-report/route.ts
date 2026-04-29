import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const MODEL = 'gpt-4o'
const RATE_LIMIT_MAX = 6
const RATE_LIMIT_WINDOW_MS = 60_000
const rateLimitStore = new Map<string, number[]>()

export const runtime = 'nodejs'

function checkRateLimit(userId: string) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = (rateLimitStore.get(userId) ?? []).filter((t) => t > windowStart)
  if (recent.length >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((recent[0] + RATE_LIMIT_WINDOW_MS - now) / 1000) }
  }
  recent.push(now)
  rateLimitStore.set(userId, recent)
  return { allowed: true, retryAfter: 0 }
}

const SYSTEM_PROMPT = `You are a senior cataloger at a premium auction house. Generate an honest, professional condition report for the consigned item shown in the photos.

Format your response as JSON with this exact structure:
{
  "overall_grade": "Excellent" | "Very Good" | "Good" | "Fair" | "Poor",
  "summary": "1-2 sentence overall condition statement",
  "highlights": ["positive observations"],
  "wear_and_flaws": ["specific defects, wear patterns, or condition issues - be honest"],
  "dimensions_estimate": "if visible/inferable, provide rough dimensions; else null",
  "materials": ["likely materials/construction observations"],
  "era_estimate": "rough date range if discernible from style/marks",
  "authenticity_notes": ["observations that bear on authenticity - hallmarks, signatures, construction tells"],
  "recommended_inspection": ["what an in-person buyer should verify"]
}

Be specific and grounded only in what is visible. Do not invent provenance. Flag uncertainty explicitly. Never claim authentication you cannot verify.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded', retry_after: rl.retryAfter }, { status: 429 })
  }

  const body = await req.json()
  const { lot_id, image_urls, title, description } = body
  if (!Array.isArray(image_urls) || image_urls.length === 0) {
    return NextResponse.json({ error: 'image_urls required' }, { status: 400 })
  }

  // Verify caller owns the lot if lot_id given
  if (lot_id) {
    const { data: lot } = await supabase
      .from('lots')
      .select('id, auction_id, auctions!inner(auctioneer_id, auctioneers!inner(user_id))')
      .eq('id', lot_id)
      .maybeSingle()
    const auctioneer = (lot?.auctions as any)?.auctioneers
    const ownerUserId = auctioneer?.user_id
    if (lot && ownerUserId && ownerUserId !== user.id) {
      const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (me?.role !== 'admin') {
        return NextResponse.json({ error: 'Not your lot' }, { status: 403 })
      }
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 503 })

  const openai = new OpenAI({ apiKey })
  const userParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `Item title: ${title || 'unknown'}\nSeller description: ${description || 'none provided'}\n\nGenerate the condition report.`,
    },
    ...image_urls.slice(0, 6).map((url: string) => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'high' as const },
    })),
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userParts },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1200,
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return NextResponse.json({ error: 'No response' }, { status: 502 })

    const report = JSON.parse(raw)
    return NextResponse.json({ report })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'AI request failed' }, { status: 500 })
  }
}
