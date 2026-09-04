/**
 * Access predicate for the auctioneer vendor center (/org).
 *
 * Kept free of Next.js / Supabase imports so it can be unit-tested in
 * isolation (tests/unit/org-gate.spec.ts) and shared by app/org/layout.tsx.
 *
 * Rule: only an auctioneer whose profile has been approved by an admin may
 * enter. Admins are deliberately NOT let in — the layout has always sent
 * every non-auctioneer role to /dashboard, and this preserves that.
 */
export interface OrgGateProfile {
  role: string | null | undefined
  is_approved: boolean | null | undefined
}

export const ORG_PENDING_PATH = '/org/pending'

export function canAccessOrg({ role, is_approved }: OrgGateProfile): boolean {
  return role === 'auctioneer' && is_approved === true
}
