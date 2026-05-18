import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { supabase } from '../supabase.js'
import { env } from '../../env.js'

// Padrão do projeto: todo fetch HTTP de cross-origin usa o fetch do
// plugin-http (Rust-side, sem CORS). Tauri/WebKit aplicaria CORS em
// chamadas pra Supabase Edge Functions / Google APIs.
import type {
  ProviderId,
  QuotaInfo,
  UploadSession,
  CloudFileInfo,
  EdgeFunctionError,
} from './types.js'

const FUNCTION_NAME = 'cloud-storage-proxy'

async function callEdge<T>(path: string, body: Record<string, unknown>, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) throw new Error('Not authenticated')

  const url = `${env.supabaseUrl}/functions/v1/${FUNCTION_NAME}/${path}`
  const res = await tauriFetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const err = data as EdgeFunctionError
    const e = new Error(err.error || 'Edge function error') as Error & EdgeFunctionError
    Object.assign(e, err)
    throw e
  }
  return data as T
}

export async function initOAuth(orgId: string, provider: ProviderId = 'google_drive'): Promise<{ authUrl: string; state: string }> {
  return callEdge('oauth-init', { org_id: orgId, provider })
}

export async function getQuota(orgId: string): Promise<QuotaInfo> {
  return callEdge('quota', { org_id: orgId })
}

export async function createUploadSession(orgId: string, params: {
  filename: string
  size: number
  mimeType: string
}): Promise<UploadSession> {
  return callEdge('upload-session', {
    org_id: orgId,
    filename: params.filename,
    size: params.size,
    mime_type: params.mimeType,
  })
}

export async function generateDownloadUrl(orgId: string, fileId: string): Promise<{ url: string; accessToken: string; expiresAt: string }> {
  return callEdge('download-url', { org_id: orgId, file_id: fileId })
}

export async function getFileInfo(orgId: string, fileId: string): Promise<CloudFileInfo | null> {
  return callEdge('file-info', { org_id: orgId, file_id: fileId })
}

export async function deleteFile(orgId: string, fileId: string): Promise<void> {
  await callEdge('file', { org_id: orgId, file_id: fileId }, 'DELETE')
}

export async function disconnect(orgId: string): Promise<void> {
  await callEdge('disconnect', { org_id: orgId })
}
