import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { SUPPORT_EMAIL, isPlaceholder } from '@/lib/legal/company'

interface LegalHeroProps {
  /** Small label above the title, e.g. "Legal" or "Support". */
  badge: string
  title: string
  /** ISO date for the `<time>` element; shown with `lastUpdatedLabel`. */
  lastUpdated?: string
  /** Human-readable form of `lastUpdated`. */
  lastUpdatedLabel?: string
  /** Optional lede rendered under the title. */
  children?: ReactNode
}

/**
 * The dark gradient banner shared by the legal, contact, and drive pages.
 * Renders the page's only `<h1>`; the last-updated line is a real `<time>`
 * so the revision date is machine-readable.
 */
export function LegalHero({ badge, title, lastUpdated, lastUpdatedLabel, children }: LegalHeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0f0520] via-[#1a0b3e] to-[#0f0520] py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] top-[20%] h-[400px] w-[400px] rounded-full bg-purple-600/20 blur-[120px]" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Badge className="mb-6 border border-white/20 bg-white/10 px-5 py-2 text-[11px] tracking-[0.25em] text-white/90 backdrop-blur-md">
          {badge}
        </Badge>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">{title}</h1>
        {lastUpdated && (
          <p className="mt-4 text-white/70">
            Last updated <time dateTime={lastUpdated}>{lastUpdatedLabel ?? lastUpdated}</time>
          </p>
        )}
        {children}
      </div>
    </section>
  )
}

interface LegalSectionProps {
  /** Anchor target; the terms page's table of contents links to it. */
  id: string
  title: string
  children: ReactNode
}

/** One numbered section of a legal document: an `<h2>` and its body copy. */
export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-slate-100 pt-10 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl font-bold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

/** A bulleted list inside a legal section. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

/** An inline link in legal body copy, styled the same on every page. */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-indigo-600 hover:text-indigo-700">
      {children}
    </Link>
  )
}

/**
 * The support address from lib/legal/company.ts as a mailto link, so every
 * page shows the same address and it can be changed in one place.
 */
export function SupportEmailLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-indigo-600 hover:text-indigo-700">
      {SUPPORT_EMAIL}
    </a>
  )
}

/**
 * Renders a company fact from lib/legal/company.ts. While the value is still a
 * bracketed placeholder it is drawn as one, dashed amber outline and a
 * "to be filled in" tag, so it can never be mistaken for real content. Once
 * the constant holds a real value it renders as plain text.
 */
export function LegalPlaceholder({ value }: { value: string }) {
  if (!isPlaceholder(value)) return <>{value}</>
  return (
    <span
      data-placeholder=""
      className="inline-flex items-baseline gap-2 rounded-md border border-dashed border-amber-500 bg-amber-50 px-2 py-0.5 text-amber-900"
    >
      <span className="font-mono text-[0.95em]">{value}</span>
      <span className="text-[0.6em] font-semibold uppercase tracking-[0.15em] text-amber-700">to be filled in</span>
    </span>
  )
}
