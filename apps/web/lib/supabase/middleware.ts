import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_EXACT_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/how-it-works',
  '/auth/callback',
  '/api/health',
])

const PUBLIC_PREFIX_ROUTES = ['/auctions', '/lots', '/api/webhooks', '/track', '/api/track']
const PROTECTED_PREFIX_ROUTES = [
  '/admin',
  '/org',
  '/dashboard',
  '/wallet',
  '/invoices',
  '/settings',
  '/driver',
]

const isStaticAsset = (pathname: string) =>
  pathname.startsWith('/_next') ||
  pathname.startsWith('/static') ||
  pathname === '/favicon.ico' ||
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)

const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname

  if (isStaticAsset(pathname)) {
    return supabaseResponse
  }

  const isPublicRoute =
    PUBLIC_EXACT_ROUTES.has(pathname) || matchesPrefix(pathname, PUBLIC_PREFIX_ROUTES)
  const isProtectedRoute = matchesPrefix(pathname, PROTECTED_PREFIX_ROUTES)

  // Harden against a slow/unreachable Supabase Auth endpoint. getUser() makes a
  // network call and runs on every non-static request, so an unbounded hang here
  // times out the ENTIRE site — matching the Sentinel alert on 2026-07-08
  // (site-wide 5s fetch timeout, HTTP status 0). Race it against a timeout and
  // fail closed to "no user" so public routes keep rendering and protected
  // routes still redirect safely to login instead of hanging.
  const AUTH_TIMEOUT_MS = 3000
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTH_TIMEOUT_MS)),
    ])
    if (result) {
      user = result.data.user
    } else {
      console.error('[middleware] Supabase auth.getUser() timed out; treating as unauthenticated')
    }
  } catch (error) {
    console.error('[middleware] Supabase auth.getUser() failed; treating as unauthenticated:', error)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (isPublicRoute || !isProtectedRoute) {
    return supabaseResponse
  }

  return supabaseResponse
}
