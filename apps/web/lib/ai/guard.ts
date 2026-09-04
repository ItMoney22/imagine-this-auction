import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Shared auth/permission guard for the Quick List routes.
 *
 * Mirrors the existing convention (`/api/ai/listing-assistant` requires an
 * auctioneer row; `/org` requires role='auctioneer'), and adds the feature-flag
 * gate so the platform admin can switch Quick List off without a deploy.
 */

export interface AuctioneerContext {
  userId: string
  email: string | null
  role: 'bidder' | 'auctioneer' | 'admin'
  auctioneerId: string
  companyName: string
  isApproved: boolean
  aiPreferences: unknown
}

export type GuardResult =
  | { ok: true; context: AuctioneerContext }
  | { ok: false; response: NextResponse }

function fail(message: string, status: number, extra?: Record<string, unknown>) {
  return {
    ok: false as const,
    response: NextResponse.json({ error: message, ...extra }, { status }),
  }
}

let flagCache: { enabled: boolean; loadedAt: number } | null = null
const FLAG_CACHE_MS = 30_000

export async function isQuickListEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.loadedAt < FLAG_CACHE_MS) {
    return flagCache.enabled
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('feature_flags')
      .select('is_enabled')
      .eq('flag_name', 'ai_quick_listing')
      .maybeSingle()

    // Absent flag means the migration ran without a seed row — fail open so a
    // missing row never silently disables a paid feature.
    const enabled = data ? (data as { is_enabled: boolean }).is_enabled !== false : true
    flagCache = { enabled, loadedAt: Date.now() }

    return enabled
  } catch {
    return true
  }
}

export async function requireAuctioneer(): Promise<GuardResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return fail('Authentication required', 401)
  }

  if (!(await isQuickListEnabled())) {
    return fail('AI Quick Listing is currently unavailable', 503)
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return fail('Could not verify your account', 403)
  }

  if (profile.role !== 'auctioneer' && profile.role !== 'admin') {
    return fail('An auctioneer account is required to use Quick List', 403)
  }

  const { data: auctioneer } = await supabase
    .from('auctioneers')
    .select('id, company_name, is_approved, ai_preferences')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!auctioneer) {
    return fail('Complete your auctioneer profile before using Quick List', 403)
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      email: profile.email ?? user.email ?? null,
      role: profile.role,
      auctioneerId: auctioneer.id,
      companyName: auctioneer.company_name,
      isApproved: auctioneer.is_approved,
      aiPreferences: auctioneer.ai_preferences,
    },
  }
}

/** Confirms a draft belongs to the caller. Reads through the service role so a
 *  missing row and a forbidden row are distinguishable in the response. */
export async function loadOwnedDraft(draftId: string, context: AuctioneerContext) {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_quick_list_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load draft: ${error.message}`)
  if (!data) return { ok: false as const, response: NextResponse.json({ error: 'Draft not found' }, { status: 404 }) }

  const draft = data as Record<string, unknown>
  const ownsDraft = draft.auctioneer_id === context.auctioneerId
  const isAdmin = context.role === 'admin'

  if (!ownsDraft && !isAdmin) {
    return { ok: false as const, response: NextResponse.json({ error: 'Draft not found' }, { status: 404 }) }
  }

  return { ok: true as const, draft }
}

/** Confirms an auction belongs to the caller before a draft is published into it. */
export async function assertOwnsAuction(
  auctionId: string,
  context: AuctioneerContext
): Promise<{ ok: true; auction: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('auctions')
    .select('id, auctioneer_id, title, status, ends_at')
    .eq('id', auctionId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load auction: ${error.message}`)
  if (!data) return fail('Auction not found', 404)

  const auction = data as Record<string, unknown>

  if (auction.auctioneer_id !== context.auctioneerId && context.role !== 'admin') {
    return fail('Auction not found', 404)
  }

  return { ok: true, auction }
}

export function errorResponse(error: unknown, fallbackMessage: string, status = 500) {
  const message = error instanceof Error ? error.message : fallbackMessage
  console.error(`[quick-list] ${fallbackMessage}`, error)

  return NextResponse.json({ error: message || fallbackMessage }, { status })
}
