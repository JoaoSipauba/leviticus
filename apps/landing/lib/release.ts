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
      { next: { revalidate: 1800 } } // revalida a cada 30min no edge
    )
    if (!res.ok) return FALLBACK
    const data: Release = await res.json()
    const version = data.tag_name.replace(/^v/, '')
    const mac = data.assets.find(a => a.name.endsWith('.dmg'))
    const win = data.assets.find(a => a.name.endsWith('.exe'))
    return {
      version,
      macUrl:     mac?.browser_download_url ?? FALLBACK.macUrl,
      macSizeMB:  mac ? Math.round(mac.size / 1024 / 1024) : FALLBACK.macSizeMB,
      winUrl:     win?.browser_download_url ?? FALLBACK.winUrl,
      winSizeMB:  win ? Math.round(win.size / 1024 / 1024) : FALLBACK.winSizeMB,
    }
  } catch {
    return FALLBACK
  }
}
