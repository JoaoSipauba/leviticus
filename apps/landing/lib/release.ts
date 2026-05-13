export type ReleaseInfo = {
  version: string
  macUrl: string
  macSizeMB: number
  winUrl: string
  winSizeMB: number
}

// Feed publicado pelo workflow Release a cada nova versão.
// Conteúdo é estático e cacheado pela CDN do Supabase. Repo é privado,
// por isso não dá pra usar api.github.com (404 sem auth).
const FEED_URL =
  'https://ttoefyaybhfpwnkbuvzc.supabase.co/storage/v1/object/public/app-releases/landing.json'

const FALLBACK: ReleaseInfo = {
  version: '0.5.0',
  macUrl: 'https://ttoefyaybhfpwnkbuvzc.supabase.co/storage/v1/object/public/app-releases/v0.5.0/Leviticus_0.5.0_aarch64.dmg',
  macSizeMB: 9,
  winUrl: 'https://ttoefyaybhfpwnkbuvzc.supabase.co/storage/v1/object/public/app-releases/v0.5.0/Leviticus_0.5.0_x64-setup.exe',
  winSizeMB: 6,
}

type Feed = {
  version: string
  mac: { url: string; sizeMB: number }
  win: { url: string; sizeMB: number }
}

export async function getLatestRelease(): Promise<ReleaseInfo> {
  try {
    // ISR: revalida em background a cada 30min.
    const res = await fetch(FEED_URL, { next: { revalidate: 1800 } })
    if (!res.ok) return FALLBACK
    const data = (await res.json()) as Feed
    if (!data?.version || !data.mac?.url || !data.win?.url) return FALLBACK
    return {
      version:   data.version,
      macUrl:    data.mac.url,
      macSizeMB: data.mac.sizeMB,
      winUrl:    data.win.url,
      winSizeMB: data.win.sizeMB,
    }
  } catch {
    return FALLBACK
  }
}
