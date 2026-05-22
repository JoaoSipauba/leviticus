import { CloudStorageProvider, NotImplementedError } from './types.ts'

// Placeholder — não implementado no MVP.
export const dropboxProvider: CloudStorageProvider = {
  id: 'dropbox',
  displayName: 'Dropbox',

  initOAuth() { throw new NotImplementedError('dropbox') },
  exchangeCode() { throw new NotImplementedError('dropbox') },
  refreshAccessToken() { throw new NotImplementedError('dropbox') },
  revokeToken() { throw new NotImplementedError('dropbox') },
  ensureAppFolder() { throw new NotImplementedError('dropbox') },
  findFileInFolder() { throw new NotImplementedError('dropbox') },
  getQuota() { throw new NotImplementedError('dropbox') },
  createUploadSession() { throw new NotImplementedError('dropbox') },
  generateDownloadUrl() { throw new NotImplementedError('dropbox') },
  deleteFile() { throw new NotImplementedError('dropbox') },
  getFileInfo() { throw new NotImplementedError('dropbox') },
}
