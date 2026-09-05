import { Receipt } from 'lucide-react'
import {
  computePremiumCents,
  computeTotalCents,
  formatPremiumPercent,
  formatUsd,
} from '@/lib/pricing/premium'
import { cn } from '@/lib/utils'

interface PremiumDisclosureProps {
  /** The bid being disclosed, in cents (current high bid or opening bid). */
  hammerCents: number
  /** The auction's buyer_premium_percent. Comes from the auction record. */
  premiumPct: number
  /** Whether hammerCents is the current high bid or the opening bid. */
  bidLabel?: 'current bid' | 'opening bid'
  className?: string
}

/**
 * The point-of-bid fee disclosure. Every lot shows the auctioneer's buyer's
 * premium and the all-in total for the bid on screen, so a bidder never
 * learns about the premium from the invoice.
 *
 * No hooks, so it renders on the server and inside client components alike.
 * The visible sentence is the accessible name; the icon and the separator
 * are decorative and hidden from assistive technology.
 */
export function PremiumDisclosure({
  hammerCents,
  premiumPct,
  bidLabel = 'current bid',
  className,
}: PremiumDisclosureProps) {
  const premiumCents = computePremiumCents(hammerCents, premiumPct)
  const totalCents = computeTotalCents(hammerCents, premiumPct)
  const pct = formatPremiumPercent(premiumPct)

  return (
    <div
      role="note"
      className={cn(
        'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Receipt className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <p className="font-medium">
            Buyer&apos;s premium {pct}
            <span className="mx-2 text-amber-400" aria-hidden="true">
              &middot;
            </span>
            If you win at {formatUsd(hammerCents)} you pay{' '}
            <span className="font-semibold tabular-nums">{formatUsd(totalCents)}</span>
          </p>
          <p className="mt-1 text-xs text-amber-900/80 tabular-nums">
            {formatUsd(hammerCents)} {bidLabel} + {formatUsd(premiumCents)} premium. Charged to your card on
            file only if you win.
          </p>
        </div>
      </div>
    </div>
  )
}
