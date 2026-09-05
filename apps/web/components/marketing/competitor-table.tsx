import Image from 'next/image'
import type { ReactNode } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { CompetitorRow } from '@/lib/pricing/competitors'
import { cn } from '@/lib/utils'

interface CompetitorTableProps {
  /** One row per fee being compared; see COMPETITOR_ROWS. */
  rows: ReadonlyArray<CompetitorRow>
  /** Source and date of the competitor figures; rendered as the table caption. */
  caption: string
  /** Heading of the competitor column. */
  competitorLabel?: string
  /** Rendered inside the frame below the table, e.g. a call to action. */
  children?: ReactNode
  className?: string
}

/**
 * The fee comparison, Imagine This Auction against a competitor, as a real
 * table so screen readers can move by row and column: `<caption>` for the
 * source line, `th scope="col"` for the three column headings, `th
 * scope="row"` for each fee name. The check and cross icons are decorative;
 * the words "Included:" and "Charged:" carry that meaning for assistive
 * technology. Tailwind does the visual grid.
 *
 * No hooks, so it renders on the server. Used on the homepage; the pricing
 * page can adopt it in place of its own table markup.
 */
export function CompetitorTable({
  rows,
  caption,
  competitorLabel = 'HiBid',
  children,
  className,
}: CompetitorTableProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-3xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.08)]',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse caption-bottom text-sm">
          <caption className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-center text-xs text-slate-500">
            {caption}
          </caption>
          <thead>
            <tr className="bg-slate-900 text-white">
              <th
                scope="col"
                className="p-6 text-left text-sm font-semibold uppercase tracking-wider text-white/80"
              >
                Fee
              </th>
              <th scope="col" className="p-6 text-center">
                <span className="flex items-center justify-center gap-2">
                  {/* Decorative: the brand name follows as text. */}
                  <Image
                    src="/images/logo-mark.webp"
                    alt=""
                    width={28}
                    height={28}
                    className="rounded-lg"
                    aria-hidden="true"
                  />
                  <span className="text-lg font-bold">Imagine This Auction</span>
                </span>
              </th>
              <th scope="col" className="p-6 text-center text-lg font-bold text-white/80">
                {competitorLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.feature}
                className={cn(
                  i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80',
                  i < rows.length - 1 && 'border-b border-slate-100'
                )}
              >
                <th scope="row" className="p-5 text-left font-medium text-slate-700">
                  {row.feature}
                </th>
                <td className="p-5 text-center">
                  <span className="inline-flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" aria-hidden="true" />
                    <span className="sr-only">Included: </span>
                    <span className="font-bold text-emerald-700">{row.ita}</span>
                  </span>
                </td>
                <td className="p-5 text-center">
                  <span className="inline-flex items-center justify-center gap-2">
                    <XCircle className="h-5 w-5 flex-shrink-0 text-red-400" aria-hidden="true" />
                    <span className="sr-only">Charged: </span>
                    <span className="text-slate-500">{row.hibid}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  )
}
