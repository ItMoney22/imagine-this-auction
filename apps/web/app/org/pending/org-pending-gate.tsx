'use client'

import Link from 'next/link'
import { redirect, usePathname } from 'next/navigation'
import { Clock3 } from 'lucide-react'

import { ORG_PENDING_PATH } from '@/lib/auth/org-gate'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Rendered by app/org/layout.tsx in place of `children` for auctioneers whose
 * application has not been approved yet. Any /org/* path other than
 * /org/pending is redirected there; on /org/pending itself the notice shows.
 *
 * Client component on purpose: it is the only place that can read the
 * pathname, which is what keeps the layout from redirect-looping.
 */
export function OrgPendingGate() {
  const pathname = usePathname()

  if (pathname !== ORG_PENDING_PATH) {
    redirect(ORG_PENDING_PATH)
  }

  return <PendingNotice />
}

export function PendingNotice() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf8ff_0%,#f6f3ff_45%,#fdfcff_100%)]">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Clock3 className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl">Your application is under review</CardTitle>
              <p className="text-sm text-slate-500">
                We&apos;ll email you when it&apos;s approved.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>
              An admin is verifying the business license you submitted. The vendor center
              unlocks automatically once that&apos;s done — there&apos;s nothing else you need to
              do right now.
            </p>
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
