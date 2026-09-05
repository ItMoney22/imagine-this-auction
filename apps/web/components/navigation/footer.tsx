import Link from 'next/link'

export interface FooterLink {
  href: string
  label: string
}

/**
 * The site-wide footer navigation. Order matters: it is the order the links
 * render in, and tests/unit/footer-links.spec.ts pins it.
 */
export const FOOTER_LINKS: readonly FooterLink[] = [
  { href: '/auctions', label: 'Auctions' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/drive', label: 'Drive for us' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/contact', label: 'Contact' },
]

export function Footer() {
  // Server component: the year is computed at render time, not hard-coded.
  const year = new Date().getFullYear()

  return (
    <footer
      data-testid="site-footer"
      className="relative z-10 border-t border-white/60 bg-white/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-slate-600 transition-colors hover:text-indigo-600"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-sm text-slate-500">© {year} Imagine This Auction</p>
      </div>
    </footer>
  )
}
