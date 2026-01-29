import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set(['/', '/login', '/auth/callback', '/api/health'])
const PROTECTED_PREFIXES = ['/admin', '/account', '/org']

const isStaticAsset = (pathname: string) =>
  pathname.startsWith('/_next') ||
  pathname.startsWith('/static') ||
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)

const needsAuth = (pathname: string) =>
  PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

const applySupabaseCookies = (source: NextResponse, target: NextResponse) => {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie)
  })
  return target
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // TEMPORARY: Skip auth for development - comment out for production
  return NextResponse.next()

  // if (PUBLIC_PATHS.has(pathname) || isStaticAsset(pathname) || !needsAuth(pathname)) {
  //   return NextResponse.next()
  // }

  // let supabaseResponse = NextResponse.next({ request })

  // const supabase = createServerClient(
  //   process.env.NEXT_PUBLIC_SUPABASE_URL!,
  //   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  //   {
  //     cookies: {
  //       getAll() {
  //         return request.cookies.getAll()
  //       },
  //       setAll(cookies) {
  //         supabaseResponse = NextResponse.next({ request })
  //         cookies.forEach(({ name, value, options }) => {
  //           supabaseResponse.cookies.set(name, value, options)
  //         })
  //       },
  //     },
  //   }
  // )

  // const {
  //   data: { user },
  // } = await supabase.auth.getUser()

  // if (!user) {
  //   const redirectUrl = request.nextUrl.clone()
  //   redirectUrl.pathname = '/login'
  //   redirectUrl.searchParams.set('redirectedFrom', pathname)

  //   return applySupabaseCookies(supabaseResponse, NextResponse.redirect(redirectUrl))
  // }

  // return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
