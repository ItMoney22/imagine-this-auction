'use client'

import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, Clock, Package, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DraftStatus } from '@/lib/ai/quick-listing'

export interface QueueDraft {
  id: string
  status: DraftStatus
  suggested?: Record<string, any> | null
  edits?: Record<string, any> | null
  confidence?: number | null
  lot_id?: string | null
  thumbnail_url?: string | null
  created_at: string
}

interface BatchQueueProps {
  drafts: QueueDraft[]
  activeDraftId: string | null
  onSelect: (draftId: string) => void
}

const STATUS_META: Record<
  DraftStatus,
  { label: string; className: string; icon?: React.ReactNode }
> = {
  capturing: { label: 'Capturing', className: 'bg-slate-100 text-slate-700' },
  identifying: { label: 'Identifying', className: 'bg-blue-100 text-blue-700' },
  needs_selection: {
    label: 'Pick a match',
    className: 'bg-amber-100 text-amber-800',
    icon: <ShieldAlert className="h-3 w-3" />,
  },
  draft_ready: {
    label: 'Ready to review',
    className: 'bg-indigo-100 text-indigo-700',
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: 'Published',
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  discarded: { label: 'Discarded', className: 'bg-slate-100 text-slate-500' },
  blocked: { label: 'Blocked', className: 'bg-rose-100 text-rose-700' },
  failed: { label: 'Failed', className: 'bg-rose-100 text-rose-700' },
}

/** The batch loop: scan → draft → approve → next item, without losing the queue. */
export function BatchQueue({ drafts, activeDraftId, onSelect }: BatchQueueProps) {
  if (drafts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
        No drafts yet. Scan or photograph an item to start.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {drafts.map((draft) => {
        const values = { ...(draft.suggested ?? {}), ...(draft.edits ?? {}) }
        const title = (values.title as string) || 'Untitled item'
        const meta = STATUS_META[draft.status] ?? STATUS_META.capturing
        const isActive = draft.id === activeDraftId

        return (
          <li key={draft.id}>
            <button
              type="button"
              onClick={() => onSelect(draft.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition',
                isActive
                  ? 'border-indigo-500 bg-indigo-50/70'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
              )}
            >
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {draft.thumbnail_url ? (
                  <Image
                    src={draft.thumbnail_url}
                    alt=""
                    fill
                    unoptimized
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-5 w-5 text-slate-400" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium text-slate-900">{title}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      meta.className
                    )}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  {draft.confidence != null && (
                    <span className="text-[10px] text-slate-400">
                      {Math.round(draft.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {draft.status === 'approved' && draft.lot_id ? (
                <Link
                  href={`/lots/${draft.lot_id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="flex-shrink-0 text-xs font-semibold text-emerald-700 underline"
                >
                  View lot
                </Link>
              ) : (
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export { STATUS_META as DRAFT_STATUS_META }
