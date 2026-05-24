import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getLatestRelease } from '@/lib/release'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|whatsapp/i

type Platform = 'mac' | 'win'
function isPlatform(s: string): s is Platform {
  return s === 'mac' || s === 'win'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params
  if (!isPlatform(platform)) {
    return NextResponse.json({ error: 'invalid platform' }, { status: 400 })
  }

  const release = await getLatestRelease()
  const url = platform === 'mac' ? release?.macUrl : release?.winUrl
  if (!url) {
    return NextResponse.json({ error: 'release unavailable' }, { status: 503 })
  }

  const ua = req.headers.get('user-agent') ?? ''
  const referrer = req.headers.get('referer') ?? null
  const country = req.headers.get('x-vercel-ip-country') ?? null

  if (!BOT_UA.test(ua)) {
    try {
      await supabaseAdmin.from('landing_downloads').insert({
        platform,
        user_agent: ua.slice(0, 500),
        referrer: referrer?.slice(0, 500) ?? null,
        country,
      })
    } catch (err) {
      console.error('[download-track]', err)
      // Não bloqueia o download.
    }
  }

  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  })
}
