import { NextResponse } from 'next/server'

import { getAvailableCredits, listAiActionPrices } from '@/lib/ai/credits'
import { errorResponse, requireAuctioneer } from '@/lib/ai/guard'
import { isImageGenerationConfigured } from '@/lib/ai/images'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Live credit prices + the caller's spendable balance.
 *
 * The UI calls this before every AI action so the cost shown to the auctioneer
 * is always the admin-configured price, never a hardcoded client constant.
 */
export async function GET() {
  try {
    const guard = await requireAuctioneer()
    if (!guard.ok) return guard.response

    const [prices, available] = await Promise.all([
      listAiActionPrices(),
      getAvailableCredits(guard.context.userId),
    ])

    return NextResponse.json({
      available_credits: available,
      image_generation_available: isImageGenerationConfigured(),
      prices: prices.map((price) => ({
        action_key: price.action_key,
        label: price.label,
        description: price.description,
        category: price.category,
        credit_cost: price.credit_cost,
        is_enabled: price.is_enabled,
        rate_limit_per_hour: price.rate_limit_per_hour,
        affordable: available >= price.credit_cost,
      })),
    })
  } catch (error) {
    return errorResponse(error, 'Failed to load AI pricing')
  }
}
