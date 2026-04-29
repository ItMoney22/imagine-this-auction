'use client'

import { useEffect, useState } from 'react'
import { Crown, Trophy, Award } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tier = 'bronze' | 'silver' | 'gold' | null

const TIER_CONFIG: Record<Exclude<Tier, null>, {
  label: string
  icon: typeof Crown
  className: string
}> = {
  gold: {
    label: 'Gold',
    icon: Crown,
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  silver: {
    label: 'Silver',
    icon: Trophy,
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  bronze: {
    label: 'Bronze',
    icon: Award,
    className: 'bg-orange-100 text-orange-800 border-orange-300',
  },
}

interface Props {
  userId: string
  tier?: Tier
  className?: string
}

export function BidderBadge({ userId, tier: tierProp, className }: Props) {
  const [tier, setTier] = useState<Tier>(tierProp ?? null)
  const [loaded, setLoaded] = useState(tierProp !== undefined)

  useEffect(() => {
    if (tierProp !== undefined) return
    let cancelled = false
    fetch(`/api/users/${userId}/badge`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setTier(d.tier ?? null)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId, tierProp])

  if (!loaded || !tier) return null

  const cfg = TIER_CONFIG[tier]
  const Icon = cfg.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border',
        cfg.className,
        className
      )}
      title={`${cfg.label} bidder`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}
