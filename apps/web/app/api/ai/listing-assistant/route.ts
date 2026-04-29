import { NextResponse } from 'next/server'
import OpenAI from 'openai'

import {
  AiListingAssistantRequestSchema,
  AiListingAssistantResponseSchema,
  normalizeAiPreferences,
} from '@/lib/ai/listing-assistant'
import { createClient } from '@/lib/supabase/server'

const MODEL_NAME = 'gpt-4-turbo'
const RATE_LIMIT_MAX_REQUESTS = 10
const RATE_LIMIT_WINDOW_MS = 60_000
const rateLimitStore = new Map<string, number[]>()

export const runtime = 'nodejs'

function checkRateLimit(userId: string) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recentRequests = (rateLimitStore.get(userId) ?? []).filter(
    (timestamp) => timestamp > windowStart
  )

  if (recentRequests.length === 0) {
    rateLimitStore.delete(userId)
  }

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = recentRequests[0] + RATE_LIMIT_WINDOW_MS - now

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    }
  }

  recentRequests.push(now)
  rateLimitStore.set(userId, recentRequests)

  return { allowed: true, retryAfterSeconds: 0 }
}

function buildSystemPrompt(style: string, customNotes: string) {
  const styleInstruction =
    style === 'Concise & Punchy'
      ? 'Write with crisp, high-confidence clarity while remaining accurate and restrained.'
      : style === 'Collector-Focused'
        ? 'Write for serious collectors, emphasizing materials, craftsmanship, rarity, and attribution nuances.'
        : 'Write detailed catalog prose in the tone of a premium auction house.'

  const notesInstruction = customNotes.trim()
    ? `House style notes from the auctioneer: ${customNotes.trim()}`
    : 'No additional house style notes were provided.'

  return [
    "You are an expert auction house cataloger with 20 years of experience at Sotheby's and Christie's.",
    'Analyze the provided product images and generate conservative, commercially useful listing copy.',
    styleInstruction,
    notesInstruction,
    'Be precise about visible materials, era, style, construction, and provenance clues.',
    'Do not overstate authenticity, attribution, or value. If something is uncertain, say so directly.',
    'Estimate values and starting bids in USD cents.',
    'Return JSON only with exactly these keys:',
    'title, description, category, condition_report, provenance_suggestion, estimate_low, estimate_high, keywords, suggested_starting_bid',
  ].join(' ')
}

function extractJson(content: string) {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('Model did not return valid JSON')
  }

  return JSON.parse(match[0]) as unknown
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 503 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: auctioneer, error: auctioneerError } = await supabase
      .from('auctioneers')
      .select('id, ai_preferences')
      .eq('user_id', user.id)
      .single()

    if (auctioneerError || !auctioneer) {
      return NextResponse.json(
        { error: 'Auctioneer account required' },
        { status: 403 }
      )
    }

    const aiPreferences = normalizeAiPreferences(auctioneer.ai_preferences)
    if (!aiPreferences.enabled) {
      return NextResponse.json(
        { error: 'AI assistant is disabled for this account' },
        { status: 403 }
      )
    }

    const rateLimit = checkRateLimit(user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again shortly.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      )
    }

    const body = await request.json()
    const parsedRequest = AiListingAssistantRequestSchema.safeParse(body)

    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parsedRequest.error.flatten(),
        },
        { status: 400 }
      )
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const userPrompt = [
      'Prepare a lot listing draft from these images.',
      parsedRequest.data.manualContext
        ? `Additional auctioneer context: ${parsedRequest.data.manualContext}`
        : 'No additional auctioneer context was provided.',
      'Use only what is visible or explicitly stated.',
      'Keep the title under 80 characters.',
      'Provide 5 to 10 keywords.',
    ].join('\n')

    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(
            aiPreferences.descriptionStyle,
            aiPreferences.customNotes
          ),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            ...parsedRequest.data.imageUrls.map((url) => ({
              type: 'image_url' as const,
              image_url: {
                url,
              },
            })),
          ],
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Model response was empty')
    }

    const parsedListing = AiListingAssistantResponseSchema.safeParse(
      extractJson(content)
    )

    if (!parsedListing.success) {
      return NextResponse.json(
        {
          error: 'Model returned invalid listing data',
          details: parsedListing.error.flatten(),
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ...parsedListing.data,
      metadata: {
        model: MODEL_NAME,
        generated_at: new Date().toISOString(),
        image_count: parsedRequest.data.imageUrls.length,
        style: aiPreferences.descriptionStyle,
      },
    })
  } catch (error) {
    console.error('Listing assistant API error:', error)

    return NextResponse.json(
      { error: 'Failed to generate AI listing suggestions' },
      { status: 500 }
    )
  }
}
