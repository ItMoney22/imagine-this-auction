import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { z } from 'zod'

// Validation schemas
const CopywriterRequestSchema = z.object({
  lots: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    category: z.string().optional(),
    brand: z.string().optional(),
    start_price_itc: z.number().optional(),
    estimate_low_itc: z.number().optional(),
    estimate_high_itc: z.number().optional(),
    tags: z.array(z.string()).optional(),
  })),
  style: z.enum(['Hype', 'Classic', 'Collector']).default('Hype'),
  batch_id: z.string().optional(),
})

const HypeCopySchema = z.object({
  headline: z.string().max(80),
  teaser: z.string().max(200),
  cta: z.string().max(50),
  email_subject: z.string().max(60),
  push_title: z.string().max(40),
  push_body: z.string().max(120),
  style: z.string(),
  generated_at: z.string(),
  toxicity_score: z.number().min(0).max(1).optional(),
})

// Initialize AI clients based on provider
function getAIClient() {
  const provider = process.env.COPYWRITER_PROVIDER || 'openai'

  switch (provider) {
    case 'openai':
      return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    case 'groq':
      return new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      })
    case 'together':
      return new OpenAI({
        apiKey: process.env.TOGETHER_API_KEY,
        baseURL: 'https://api.together.xyz/v1',
      })
    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

function getModelName() {
  const provider = process.env.COPYWRITER_PROVIDER || 'openai'

  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini'
    case 'groq':
      return 'llama-3.1-8b-instant'
    case 'together':
      return 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'
    default:
      return 'gpt-4o-mini'
  }
}

// Style-specific prompts
const STYLE_PROMPTS = {
  Hype: `You are an expert auction copywriter creating EXCITING, HIGH-ENERGY marketing copy.
Use action words, urgency, and emotional triggers. Think QVC meets luxury auction house.
Focus on scarcity, exclusivity, and FOMO. Use exclamation points sparingly but effectively.`,

  Classic: `You are a distinguished auction house copywriter in the tradition of Sotheby's and Christie's.
Write with elegance, sophistication, and subtle persuasion. Focus on provenance, craftsmanship, and investment value.
Use refined language that appeals to serious collectors and connoisseurs.`,

  Collector: `You are writing for passionate collectors and enthusiasts who appreciate technical details.
Focus on rarity, condition, historical significance, and what makes this piece special to collectors.
Use insider knowledge and terminology that resonates with the collecting community.`,
}

// Toxicity detection (basic keyword filtering)
const UNSAFE_PATTERNS = [
  /\b(buy now|guaranteed profit|no risk|secret|miracle|instant wealth)\b/i,
  /\b(personal info|contact me|social security|bank account)\b/i,
  /\b(hate|violence|discriminat|racist|offensive)\b/i,
]

function checkToxicity(text: string): number {
  let score = 0
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(text)) {
      score += 0.3
    }
  }
  return Math.min(score, 1.0)
}

function sanitizeContent(content: any): any {
  const toxicityScore = checkToxicity(JSON.stringify(content))

  if (toxicityScore > 0.5) {
    // Return safe fallback copy
    return {
      headline: content.title || 'Fine Auction Item',
      teaser: 'A carefully selected piece from our upcoming auction. View details for more information.',
      cta: 'View Details',
      email_subject: 'New Auction Item Available',
      push_title: 'Auction Alert',
      push_body: 'New item added to upcoming auction',
      style: 'Safe',
      generated_at: new Date().toISOString(),
      toxicity_score: toxicityScore,
    }
  }

  return { ...content, toxicity_score: toxicityScore }
}

// Generate copy for a single lot
async function generateLotCopy(lot: any, style: string): Promise<any> {
  const client = getAIClient()
  const model = getModelName()

  const systemPrompt = STYLE_PROMPTS[style as keyof typeof STYLE_PROMPTS]

  const userPrompt = `Create marketing copy for this auction lot:

Title: ${lot.title}
Description: ${lot.description}
Category: ${lot.category || 'Unknown'}
Brand: ${lot.brand || 'N/A'}
Starting Price: ${lot.start_price_itc ? `${lot.start_price_itc} ITC` : 'TBD'}
Estimate: ${lot.estimate_low_itc && lot.estimate_high_itc ?
  `${lot.estimate_low_itc}-${lot.estimate_high_itc} ITC` : 'Contact for estimate'}
Tags: ${lot.tags?.join(', ') || 'None'}

Generate JSON with these exact fields:
{
  "headline": "Catchy 80-char max headline",
  "teaser": "Compelling 200-char max description",
  "cta": "Action phrase under 50 chars",
  "email_subject": "Email subject under 60 chars",
  "push_title": "Push notification title under 40 chars",
  "push_body": "Push notification body under 120 chars"
}

Keep it engaging but appropriate for a professional auction house.`

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content generated')
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response')
    }

    const parsedContent = JSON.parse(jsonMatch[0])

    // Add metadata
    const enrichedContent = {
      ...parsedContent,
      style,
      generated_at: new Date().toISOString(),
    }

    // Validate and sanitize
    const validatedContent = HypeCopySchema.parse(enrichedContent)
    return sanitizeContent(validatedContent)

  } catch (error) {
    console.error('AI generation failed:', error)

    // Return fallback copy
    return sanitizeContent({
      headline: lot.title.slice(0, 80),
      teaser: lot.description.slice(0, 200),
      cta: 'View Details',
      email_subject: `${lot.title.slice(0, 40)} - Auction Alert`,
      push_title: 'New Auction Item',
      push_body: lot.title.slice(0, 120),
      style: 'Fallback',
      generated_at: new Date().toISOString(),
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if copywriter is enabled
    const supabase = await createClient()
    const { data: flagData } = await supabase
      .from('feature_flags')
      .select('is_enabled')
      .eq('flag_name', 'ai_copywriter')
      .single()

    if (!flagData?.is_enabled) {
      return NextResponse.json(
        { error: 'AI copywriter is currently disabled' },
        { status: 503 }
      )
    }

    // Validate request
    const body = await request.json()
    const validatedData = CopywriterRequestSchema.parse(body)

    const { lots, style, batch_id } = validatedData

    // Check rate limits (basic implementation)
    const rateLimitKey = `copywriter:${request.ip || 'unknown'}`
    // In production, implement proper rate limiting with Redis

    // Generate copy for each lot
    const results = []
    const errors = []

    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i]

      try {
        // Add delay to respect rate limits
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        const hypeCopy = await generateLotCopy(lot, style)

        // Update lot in database
        const { error: updateError } = await supabase
          .from('lots')
          .update({ hype_copy: JSON.stringify(hypeCopy) })
          .eq('id', lot.id)

        if (updateError) {
          throw updateError
        }

        results.push({
          lot_id: lot.id,
          hype_copy: hypeCopy,
          status: 'success'
        })

      } catch (error) {
        console.error(`Failed to generate copy for lot ${lot.id}:`, error)
        errors.push({
          lot_id: lot.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'error'
        })
      }
    }

    // Log batch results if batch_id provided
    if (batch_id) {
      await supabase.from('notification_batches').upsert({
        id: batch_id,
        title: `Copywriter batch ${batch_id}`,
        message: `Generated ${results.length} lot descriptions with ${errors.length} errors.`,
        target_roles: ['admin'],
        severity: errors.length > 0 ? 'warning' : 'info',
        sent_count: results.length,
      })
    }

    return NextResponse.json({
      success: true,
      processed: lots.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        style,
        provider: process.env.COPYWRITER_PROVIDER || 'openai',
        model: getModelName(),
        generated_at: new Date().toISOString(),
      }
    })

  } catch (error) {
    console.error('Copywriter API error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  try {
    const provider = process.env.COPYWRITER_PROVIDER || 'openai'
    const hasApiKey = !!(
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.TOGETHER_API_KEY
    )

    return NextResponse.json({
      status: 'healthy',
      provider,
      model: getModelName(),
      api_key_configured: hasApiKey,
      features: {
        toxicity_detection: true,
        rate_limiting: false, // TODO: implement Redis-based rate limiting
        batch_processing: true,
      }
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: 'Configuration error' },
      { status: 500 }
    )
  }
}
