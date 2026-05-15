import { onOpenUrl } from '@tauri-apps/plugin-deep-link'

export type DeepLinkEvent =
  | { kind: 'oauth-success'; orgId: string }

const PROTOCOL = 'leviticus://'

export function parseDeepLink(raw: string): DeepLinkEvent | null {
  if (!raw.startsWith(PROTOCOL)) return null
  try {
    const url = new URL(raw)
    if (url.host === 'oauth-success') {
      const orgId = url.searchParams.get('org_id')
      if (!orgId) return null
      return { kind: 'oauth-success', orgId }
    }
    return null
  } catch {
    return null
  }
}

export function isOAuthSuccess(raw: string): boolean {
  return parseDeepLink(raw)?.kind === 'oauth-success'
}

/**
 * Registra um listener de deep links no boot do app.
 * Chama o callback toda vez que o app receber um deep link conhecido.
 * Retorna unsubscribe.
 */
export async function listenForDeepLinks(
  onEvent: (event: DeepLinkEvent) => void
): Promise<() => void> {
  const unlisten = await onOpenUrl((urls: string[]) => {
    for (const raw of urls) {
      const parsed = parseDeepLink(raw)
      if (parsed) onEvent(parsed)
    }
  })
  return unlisten
}
