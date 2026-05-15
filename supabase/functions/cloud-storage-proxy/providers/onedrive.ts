import { CloudStorageProvider, NotImplementedError } from './types.ts'

// Placeholder — não implementado no MVP. Mantém o registry tipado.
// Quando OneDrive for implementado, este arquivo é totalmente substituído.
export const oneDriveProvider: CloudStorageProvider = {
  id: 'onedrive',
  displayName: 'OneDrive',

  initOAuth() { throw new NotImplementedError('onedrive') },
  exchangeCode() { throw new NotImplementedError('onedrive') },
  refreshAccessToken() { throw new NotImplementedError('onedrive') },
  revokeToken() { throw new NotImplementedError('onedrive') },
  ensureAppFolder() { throw new NotImplementedError('onedrive') },
  getQuota() { throw new NotImplementedError('onedrive') },
  createUploadSession() { throw new NotImplementedError('onedrive') },
  generateDownloadUrl() { throw new NotImplementedError('onedrive') },
  getFileInfo() { throw new NotImplementedError('onedrive') },
  deleteFile() { throw new NotImplementedError('onedrive') },
}
