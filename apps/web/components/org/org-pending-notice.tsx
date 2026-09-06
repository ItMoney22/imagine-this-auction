import Link from 'next/link'
import { Clock3, XCircle } from 'lucide-react'

import type { OrgPendingVariant } from '@/lib/auth/org-gate'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PendingNoticeProps {
  variant?: OrgPendingVariant
}

const SUPPORT_EMAIL = 'support@imaginethisauction.com'

/**
 * What an unapproved auctioneer sees instead of the vendor center.
 *
 * Server-safe on purpose (no hooks, no directive): app/org/pending/page.tsx
 * renders it directly, and OrgPendingGate (a client component) renders it for
 * app/org/layout.tsx. `variant` comes from the latest auctioneer_license
 * document's verification_status via pendingVariantFor().
 */
export function PendingNotice({ variant = 'pending' }: PendingNoticeProps) {
  const rejected = variant === 'rejected'

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)]">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            {rejected ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <XCircle className="h-6 w-6" />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Clock3 className="h-6 w-6" />
              </div>
            )}
            <div>
              <CardTitle className="text-xl">
                {rejected ? 'Application not approved' : 'Your application is under review'}
              </CardTitle>
              <p className="text-sm text-slate-500">
                {rejected
                  ? 'The vendor center is unavailable for this account.'
                  : "We'll email you when it's approved."}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            {rejected ? (
              <p>
                Your application was not approved. Check your email for details or contact{' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-indigo-600 underline-offset-4 hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            ) : (
              <p>
                An admin is verifying the business license you submitted. The vendor center
                unlocks automatically once that&apos;s done &mdash; there&apos;s nothing else you
                need to do right now.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/become-auctioneer">View application</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
