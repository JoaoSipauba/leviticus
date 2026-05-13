export type ReleaseInfo = {
  version: string
  macUrl: string
  macSizeMB: number
  winUrl: string
  winSizeMB: number
}

// Feed único: o mesmo `latest.json` que o updater do desktop consome
// (apps/desktop/src-tauri/tauri.conf.json → plugins.updater.endpoints).
// Manter uma fonte só elimina split-brain entre updater e landing — se
// build falha, ninguém vê a versão nova; se sobe, todos veem ao mesmo tempo.
const FEED_URL =
  'https://ttoefyaybhfpwnkbuvzc.supabase.co/storage/v1/object/public/app-releases/latest.json'

type LatestFeed = {
  version: string
  platforms?: {
    'darwin-aarch64'?: { url: string }
    'windows-x86_64'?: { url: string }
  }
}

// HEAD no asset: valida existência (200) E captura Content-Length pra
// derivar o tamanho exibido na UI. Se o arquivo estiver ausente (404, 5xx,
// erro de rede) retorna null e a caller trata como "indisponível" — regra
// dura: a landing nunca renderiza URL que não foi confirmada viva.
async function probeAsset(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', next: { revalidate: 1800 } })
    if (!res.ok) return null
    const len = res.headers.get('content-length')
    if (!len) return null
    const bytes = parseInt(len, 10)
    if (!Number.isFinite(bytes) || bytes <= 0) return null
    return Math.round(bytes / 1024 / 1024)
  } catch {
    return null
  }
}

export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    // ISR: revalida em background a cada 30min.
    const res = await fetch(FEED_URL, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<LatestFeed>
    const macUrl = data.platforms?.['darwin-aarch64']?.url
    const winUrl = data.platforms?.['windows-x86_64']?.url
    if (!data.version || !macUrl || !winUrl) return null

    // HEAD em paralelo: ambos precisam responder 200 pra liberar a UI.
    // Se algum faltar (build parcial, asset deletado, etc), volta null.
    const [macSizeMB, winSizeMB] = await Promise.all([
      probeAsset(macUrl),
      probeAsset(winUrl),
    ])
    if (macSizeMB === null || winSizeMB === null) return null

    return { version: data.version, macUrl, macSizeMB, winUrl, winSizeMB }
  } catch {
    return null
  }
}
