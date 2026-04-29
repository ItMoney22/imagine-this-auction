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

const PUBLIC_PREFIX_ROUTES = ['/auctions', '/lots', '/api/webhooks']
const PROTECTED_PREFIX_ROUTES = [
  '/admin',
  '/org',
  '/dashboard',
  '/wallet',
  '/invoices',
  '/settings',
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
