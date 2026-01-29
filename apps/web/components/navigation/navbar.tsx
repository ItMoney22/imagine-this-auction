'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Menu, X, Gavel, User as UserIcon, LogOut } from 'lucide-react'

interface NavbarProps {
  user?: User | null
}

export function Navbar({ user }: NavbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const getDashboardLink = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'admin':
        return '/admin'
      case 'auctioneer':
        return '/org'
      default:
        return '/dashboard'
    }
  }

  const navigation = [
    { href: '/auctions', label: 'Auctions' },
    { href: '/lots', label: 'Browse Lots' },
    { href: '/how-it-works', label: 'How It Works' },
  ]

  return (
    <nav className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl shadow-[0_10px_40px_rgba(79,70,229,0.08)]">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center space-x-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg">
              <Gavel className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold text-slate-900">
              ImagineThisAuction
            </span>
          </Link>

          <div className="hidden md:flex md:items-center md:space-x-8">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-indigo-600"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className="flex items-center space-x-2 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur hover:text-indigo-600 focus:outline-none"
              >
                <UserIcon className="h-5 w-5" />
                <span className="hidden md:block">
                  {user.first_name || user.email}
                </span>
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-3 w-60 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-[0_24px_60px_rgba(79,70,229,0.12)] backdrop-blur-xl">
                  <Link
                    href={getDashboardLink()}
                    className="block rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/wallet"
                    className="block rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    Wallet
                  </Link>
                  <Link
                    href="/profile"
                    className="block rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                    onClick={() => setIsProfileOpen(false)}
                  >
                    Profile
                  </Link>
                  {user.role === 'bidder' && (
                    <Link
                      href="/become-auctioneer"
                      className="block rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                      onClick={() => setIsProfileOpen(false)}
                    >
                      Become Auctioneer
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="mt-2 flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25"
                  >
                    <span>Sign Out</span>
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-3">
              <Button asChild variant="ghost" className="text-slate-600 hover:text-indigo-600">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Start Collecting</Link>
              </Button>
            </div>
          )}

          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center rounded-full border border-white/60 bg-white/70 p-2 text-slate-500 shadow-sm backdrop-blur focus:outline-none focus:ring-2 focus:ring-indigo-200"
            aria-label="Toggle navigation menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden">
          <div className="mx-4 mt-4 space-y-2 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_25px_60px_rgba(79,70,229,0.12)] backdrop-blur-xl">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-xl px-3 py-2 text-base font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            {user ? (
              <div className="border-t border-white/60 pt-4">
                <Link
                  href={getDashboardLink()}
                  className="block rounded-xl px-3 py-2 text-base font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/profile"
                  className="block rounded-xl px-3 py-2 text-base font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Profile
                </Link>
                <Link
                  href="/wallet"
                  className="block rounded-xl px-3 py-2 text-base font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Wallet
                </Link>
                <button
                  onClick={() => {
                    setIsMenuOpen(false)
                    handleSignOut()
                  }}
                  className="mt-3 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-2 text-base font-semibold text-white shadow-lg shadow-indigo-500/20"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="border-t border-white/60 pt-4 space-y-3">
                <Button
                  asChild
                  variant="ghost"
                  className="w-full justify-center text-slate-600 hover:text-indigo-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button
                  asChild
                  className="w-full justify-center"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link href="/signup">Start Collecting</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
