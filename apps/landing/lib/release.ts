type Asset = { name: string; size: number; browser_download_url: string }
type Release = { tag_name: string; assets: Asset[] }

export type ReleaseInfo = {
  version: string
  macUrl: string
  macSizeMB: number
  winUrl: string
  winSizeMB: number
}

const FALLBACK: ReleaseInfo = {
  version: '0.2.0',
  macUrl: 'https://github.com/JoaoSipauba/leviticus/releases/download/v0.2.0/Leviticus_0.2.0_aarch64.dmg',
  macSizeMB: 9,
  winUrl: 'https://github.com/JoaoSipauba/leviticus/releases/download/v0.2.0/Leviticus_0.2.0_x64-setup.exe',
  winSizeMB: 6,
}

export async function getLatestRelease(): Promise<ReleaseInfo> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/JoaoSipauba/leviticus/releases/latest',
      // Cache ISR: revalida em segundo plano a cada 30min.
      { next: { revalidate: 1800 } }
    )
    if (!res.ok) return FALLBACK
    const data: Release = await res.json()
    const mac = data.assets.find(a => a.name.endsWith('.dmg'))
    const win = data.assets.find(a => a.name.endsWith('.exe'))
    // Se algum asset crítico está faltando (release ainda buildando, falha de
    // upload, etc), o FALLBACK inteiro é mais seguro do que misturar a versão
    // nova com URL/filename antigos — a UX ficaria com instruções inconsistentes.
    if (!mac || !win) return FALLBACK
    return {
      version:   data.tag_name.replace(/^v/, ''),
      macUrl:    mac.browser_download_url,
      macSizeMB: Math.round(mac.size / 1024 / 1024),
      winUrl:    win.browser_download_url,
      winSizeMB: Math.round(win.size / 1024 / 1024),
    }
  } catch {
    return FALLBACK
  }
}
