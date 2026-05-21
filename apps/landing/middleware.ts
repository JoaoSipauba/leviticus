import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Only protect /admin routes
  if (!pathname.startsWith('/admin')) return NextResponse.next()

  // Allow login page and API routes through without auth
  if (pathname === '/admin/login' || pathname.startsWith('/admin/api/')) {
    return NextResponse.next()
  }

  const session = req.cookies.get('admin-session')?.value
  const password = process.env.ADMIN_PASSWORD

  if (!password || session !== password) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/admin/:path*',
}
