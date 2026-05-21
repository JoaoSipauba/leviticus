import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/adminAuth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  // Mesmos atributos do cookie original — garante que o Set-Cookie de
  // expiração sobrescreva o cookie de sessão corretamente.
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
