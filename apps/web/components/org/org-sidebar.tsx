'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Archive,
  BarChart3,
  FileText,
  Gavel,
  Plus,
  Settings,
  ShieldCheck,
} from 'lucide-react'

import { Auctioneer } from '@/lib/types/database'
import { cn } from '@/lib/utils'

interface OrgSidebarProps {
  auctioneer: Auctioneer
}

const navigation = [
  {
    name: 'Overview',
    href: '/org',
    icon: BarChart3,
  },
  {
    name: 'Auctions',
    href: '/org/auctions',
    icon: Gavel,
  },
  {
    name: 'Create',
    href: '/org/auctions/new',
    icon: Plus,
  },
  {
    name: 'Invoices',
    href: '/org/invoices',
    icon: FileText,
  },
  {
    name: 'Settings',
    href: '/org/settings',
    icon: Settings,
  },
]

export function OrgSidebar({ auctioneer }: OrgSidebarProps) {
  const pathname = usePathname()

  return (
    <>
      <div className="border-b border-white/70 bg-white/85 px-4 py-3 text-slate-950 shadow-[0_12px_35px_rgba(79,70,229,0.12)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/org" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4c1d95] to-[#daa520] text-white shadow-lg shadow-indigo-500/20">
              <Archive className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{auctioneer.company_name}</p>
              <p className="text-xs text-slate-500">
                {auctioneer.is_approved ? 'Approved seller' : 'Pending review'}
              </p>
            </div>
          </Link>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/org' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'bg-white/70 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </div>
      </div>

      <aside className="sticky top-0 hidden h-screen w-72 flex-shrink-0 flex-col overflow-hidden border-r border-white/70 bg-white/82 text-slate-950 shadow-[20px_0_70px_rgba(79,70,229,0.12)] backdrop-blur-xl lg:flex">
        <div className="border-b border-indigo-100/80 p-6">
          <Link href="/org" className="flex items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4c1d95] to-[#daa520] text-white shadow-lg shadow-indigo-500/20">
              <Archive className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-tight">
                {auctioneer.company_name}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5" />
                {auctioneer.is_approved ? 'Approved seller' : 'Pending review'}
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-6">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/org' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 shadow-[0_12px_30px_rgba(79,70,229,0.12)]'
                    : 'text-slate-600 hover:bg-white hover:text-indigo-700',
                )}
              >
                <item.icon
                  className={cn(
                    'h-5 w-5 flex-shrink-0',
                    isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-600',
                  )}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4">
          <div className="rounded-3xl border border-indigo-100 bg-white/70 p-4 shadow-[0_16px_45px_rgba(79,70,229,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
              License
            </p>
            <p className="mt-2 truncate text-sm font-medium text-slate-700">
              {auctioneer.business_license || 'Not provided'}
            </p>
            <div
              className={cn(
                'mt-4 rounded-full px-3 py-2 text-xs font-semibold',
                auctioneer.is_approved
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
              )}
            >
              {auctioneer.is_approved ? 'Active marketplace access' : 'Marketplace access pending'}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
