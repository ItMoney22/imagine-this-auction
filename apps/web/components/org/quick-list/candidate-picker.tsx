'use client'

import Image from 'next/image'
import { Check, HelpCircle, Package } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { confidenceBand, type ListingCandidate } from '@/lib/ai/quick-listing'

interface CandidatePickerProps {
  candidates: ListingCandidate[]
  selectedIndex: number | null
  onSelect: (index: number) => void
  requiresSelection: boolean
}

const TONE_STYLES = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-rose-50 text-rose-700 border-rose-200',
} as const

/**
 * When identification is uncertain or sources conflict, the auctioneer picks.
 * The platform surfaces the options and its reasoning — it never guesses.
 */
export function CandidatePicker({
  candidates,
  selectedIndex,
  onSelect,
  requiresSelection,
}: CandidatePickerProps) {
  if (candidates.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {requiresSelection ? 'Which item is this?' : 'Identified match'}
          </h3>
          <p className="text-xs text-slate-500">
            {requiresSelection
              ? 'The sources disagreed or the match was uncertain. Pick the correct item — nothing is assumed for you.'
              : 'Confirm this is right, or choose a different match.'}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((candidate, index) => {
          const band = confidenceBand(candidate.confidence)
          const selected = selectedIndex === index

          return (
            <button
              key={`${candidate.title}-${index}`}
              type="button"
              onClick={() => onSelect(index)}
              aria-pressed={selected}
              className={cn(
                'flex gap-3 rounded-2xl border p-3 text-left transition',
                selected
                  ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-200'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
              )}
            >
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {candidate.image_url ? (
                  <Image
                    src={candidate.image_url}
                    alt=""
                    fill
                    unoptimized
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-6 w-6 text-slate-400" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                    {candidate.title}
                  </p>
                  {selected && (
                    <Check className="h-4 w-4 flex-shrink-0 text-indigo-600" aria-hidden />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      TONE_STYLES[band.tone]
                    )}
                  >
                    {Math.round(candidate.confidence * 100)}% · {band.label}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {candidate.source}
                  </Badge>
                  {candidate.brand && (
                    <Badge variant="secondary" className="text-[10px]">
                      {candidate.brand}
                    </Badge>
                  )}
                </div>

                {candidate.summary && (
                  <p className="line-clamp-2 text-xs text-slate-500">{candidate.summary}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
