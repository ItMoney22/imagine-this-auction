import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/auth/callback',
    '/api/health',
    '/auctions',
    '/lots'
  ]

  // Check if current path is public (including dynamic routes like /auctions/[id])
  const isPublicRoute = publicRoutes.some(route => {
    if (route === pathname) return true
    if (route === '/auctions' && pathname.startsWith('/auctions/')) return true
    if (route === '/lots' && pathname.startsWith('/lots/')) return true
    return false
  })

  // Skip auth check for public routes
  if (isPublicRoute) {
    return supabaseResponse
  }

  // This will refresh session if expired - required for Server Components
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If user is logged in and trying to access login/signup, redirect to home
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Protected routes - redirect to login if not authenticated
  const protectedRoutes = ['/admin', '/org', '/dashboard', '/wallet', '/invoices']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}