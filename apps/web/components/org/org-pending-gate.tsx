'use client'

import { redirect, usePathname } from 'next/navigation'

import { ORG_PENDING_PATH, type OrgPendingVariant } from '@/lib/auth/org-gate'

import { PendingNotice } from './org-pending-notice'

interface OrgPendingGateProps {
  variant: OrgPendingVariant
}

/**
 * Rendered by app/org/layout.tsx in place of `children` for auctioneers whose
 * application has not been approved yet. Any /org/* path other than
 * /org/pending is redirected there; on /org/pending itself the notice shows.
 *
 * Client component on purpose: it is the only place that can read the
 * pathname, which is what keeps the layout from redirect-looping. The notice
 * itself lives in org-pending-notice.tsx so the server page can render it
 * without pulling in this client boundary.
 */
export function OrgPendingGate({ variant }: OrgPendingGateProps) {
  const pathname = usePathname()

  if (pathname !== ORG_PENDING_PATH) {
    redirect(ORG_PENDING_PATH)
  }

  return <PendingNotice variant={variant} />
}
