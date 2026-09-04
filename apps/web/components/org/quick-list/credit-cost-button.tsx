'use client'

import { useState } from 'react'
import { AlertTriangle, Coins, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn, formatITC } from '@/lib/utils'

interface CreditCostButtonProps {
  label: string
  /** Live, admin-configured price. Never a client-side constant. */
  creditCost: number
  availableCredits: number
  onConfirm: () => void | Promise<void>
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
  description?: string
  icon?: React.ReactNode
  variant?: 'default' | 'outline' | 'secondary'
  className?: string
  /** Skips the confirm step for low-friction repeat actions. */
  requireConfirmation?: boolean
}

/**
 * Every paid AI action goes through this: the cost is shown before generation,
 * the balance is checked, and the auctioneer confirms the spend.
 */
export function CreditCostButton({
  label,
  creditCost,
  availableCredits,
  onConfirm,
  disabled = false,
  loading = false,
  loadingLabel,
  description,
  icon,
  variant = 'default',
  className,
  requireConfirmation = true,
}: CreditCostButtonProps) {
  const [confirming, setConfirming] = useState(false)

  const affordable = availableCredits >= creditCost
  const blocked = disabled || loading || !affordable

  const handleClick = async () => {
    if (blocked) return

    if (requireConfirmation && !confirming) {
      setConfirming(true)
      return
    }

    setConfirming(false)
    await onConfirm()
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        type="button"
        variant={confirming ? 'default' : variant}
        onClick={handleClick}
        disabled={blocked}
        className={cn('w-full justify-between gap-3', confirming && 'ring-2 ring-indigo-400')}
      >
        <span className="flex items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          <span className="truncate">
            {loading ? (loadingLabel ?? 'Working…') : confirming ? `Confirm — spend ${formatITC(creditCost)}` : label}
          </span>
        </span>
        {!loading && (
          <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold">
            <Coins className="h-3 w-3" />
            {creditCost}
          </span>
        )}
      </Button>

      {confirming && !loading && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <span>
            {formatITC(creditCost)} will be deducted only if this succeeds. Balance after:{' '}
            <strong>{formatITC(Math.max(0, availableCredits - creditCost))}</strong>
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex-shrink-0 font-semibold underline"
          >
            Cancel
          </button>
        </div>
      )}

      {!affordable && !loading && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Needs {formatITC(creditCost)} — you have {formatITC(availableCredits)}.{' '}
            <a href="/wallet" className="font-semibold underline">
              Top up
            </a>
          </span>
        </p>
      )}

      {description && !confirming && (
        <p className="text-xs leading-snug text-slate-500">{description}</p>
      )}
    </div>
  )
}
