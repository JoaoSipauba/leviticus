import { CloudStorageProvider, ProviderId } from './types.ts'
import { googleDriveProvider } from './google-drive.ts'
import { oneDriveProvider } from './onedrive.ts'
import { dropboxProvider } from './dropbox.ts'

const REGISTRY: Record<ProviderId, CloudStorageProvider> = {
  google_drive: googleDriveProvider,
  onedrive: oneDriveProvider,
  dropbox: dropboxProvider,
}

export function getProvider(id: ProviderId): CloudStorageProvider {
  const p = REGISTRY[id]
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return p
}

export function listImplementedProviderIds(): ProviderId[] {
  return (Object.keys(REGISTRY) as ProviderId[]).filter((id) => {
    try {
      // initOAuth nos placeholders lança NotImplementedError
      REGISTRY[id].initOAuth('test', 'test')
      return true
    } catch {
      return false
    }
  })
}
