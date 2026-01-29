'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Gavel,
  Package,
  BarChart3,
  Settings,
  DollarSign,
  Plus,
  Archive
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
    name: 'Create Auction',
    href: '/org/auctions/new',
    icon: Plus,
  },
  {
    name: 'Lots',
    href: '/org/lots',
    icon: Package,
  },
  {
    name: 'Payouts',
    href: '/org/payouts',
    icon: DollarSign,
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
    <div className="flex flex-col w-64 bg-white shadow-lg">
      {/* Organization header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Archive className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {auctioneer.company_name}
            </h2>
            <p className="text-sm text-gray-500">
              {auctioneer.is_approved ? 'Approved' : 'Pending Approval'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/org' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-500'
                )}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Organization info */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          <div>License: {auctioneer.business_license || 'Not provided'}</div>
          <div>Status: {auctioneer.is_approved ? (
            <span className="text-green-600 font-medium">Active</span>
          ) : (
            <span className="text-yellow-600 font-medium">Pending</span>
          )}</div>
        </div>
      </div>
    </div>
  )
}
