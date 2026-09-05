import { cn } from '@/lib/utils'

interface WorkingBarProps {
  /** What is being waited on, in plain words. Read out by screen readers. */
  label: string
  className?: string
}

/**
 * Indeterminate progress bar for anything that waits on a network call.
 * The project convention is a themed bar, not a spinner: an indigo/purple
 * track with the site-wide `animate-shimmer` sweep from globals.css.
 */
export function WorkingBar({ label, className }: WorkingBarProps) {
  return (
    <div className={cn('space-y-1.5', className)} role="status" aria-live="polite" aria-busy="true">
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-indigo-100"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
        <div className="animate-shimmer absolute inset-0 rounded-full" />
      </div>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  )
}
