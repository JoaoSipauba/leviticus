import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/adminAuth'

// Rotas sob /admin liberadas sem sessão. Lista explícita (allowlist) —
// nunca um prefixo amplo como /admin/api/*, senão qualquer endpoint novo
// nasce público por acidente.
const PUBLIC_ADMIN_PATHS = new Set([
  '/admin/login',
  '/admin/api/login',
  '/admin/api/logout',
])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!pathname.startsWith('/admin')) return NextResponse.next()
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return NextResponse.next()

  const password = process.env.ADMIN_PASSWORD
  const token = req.cookies.get(SESSION_COOKIE)?.value

  if (!password || !(await verifySessionToken(token, password))) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
