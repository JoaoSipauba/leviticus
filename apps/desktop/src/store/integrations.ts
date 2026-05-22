import { create } from 'zustand'
import type { CloudStorageAccount, QuotaInfo } from '@leviticus/core'
import { getDb, getLastSync } from '../lib/db.js'
import * as cs from '../lib/cloud-storage/client.js'

export type IntegrationStatus =
  | 'unknown'
  | 'disconnected'
  | 'connected'
  | 'token_expired'
  | 'folder_missing'
  | 'quota_full'

type IntegrationsState = {
  account: CloudStorageAccount | null
  quota: QuotaInfo | null
  status: IntegrationStatus
  error: string | null
  refreshing: boolean

  refreshAccount: (orgId: string) => Promise<void>
  refreshQuota: (orgId: string) => Promise<void>
  clearAccount: (orgId: string) => Promise<void>
  setStatus: (status: IntegrationStatus) => void
  setError: (error: string | null) => void
}

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
  account: null,
  quota: null,
  status: 'unknown',
  error: null,
  refreshing: false,

  async refreshAccount(orgId: string) {
    if (get().refreshing) return
    set({ refreshing: true })
    try {
      const db = await getDb()
      const rows = await db.select<CloudStorageAccount[]>(
        'SELECT org_id, provider, account_email, account_user_id, app_folder_id, connected_by, connected_at, last_quota_total, last_quota_used, last_quota_check_at, updated_at FROM cloud_storage_accounts WHERE org_id = ?',
        [orgId]
      )
      if (rows.length > 0) {
        const acc = rows[0]
        // Derive status from quota if known
        const used = acc.last_quota_used ?? 0
        const total = acc.last_quota_total ?? 0
        const ratio = total > 0 ? used / total : 0
        set({
          account: acc,
          quota: total > 0 ? { total, used, available: Math.max(0, total - used) } : null,
          status: ratio >= 1 ? 'quota_full' : 'connected',
          error: null,
        })
      } else {
        // Cache vazio significa um de dois estados distintos:
        // - sync nunca completou (device recém-aberto): não dá pra concluir
        //   nada → 'unknown' (estado de loading; o banner não aparece nele).
        // - sync já rodou e confirmou ausência de conta → 'disconnected'.
        // Sem essa distinção, um device já configurado mostra o banner falso
        // "Sem backup configurado" no boot, antes do syncOrg popular o cache.
        // Issue #121.
        const lastSync = await getLastSync(orgId)
        set({
          account: null,
          quota: null,
          status: lastSync == null ? 'unknown' : 'disconnected',
          error: null,
        })
      }
    } finally {
      set({ refreshing: false })
    }
  },

  async clearAccount(orgId: string) {
    // Limpa cache local imediatamente após disconnect/swap. Sem isso, o
    // próximo refreshAccount lê do SQLite cacheado e mantém status=connected
    // com quota=null, fazendo o render condicional não casar nenhum branch.
    const db = await getDb()
    await db.execute('DELETE FROM cloud_storage_accounts WHERE org_id = ?', [orgId])
    set({ account: null, quota: null, status: 'disconnected', error: null })
  },

  async refreshQuota(orgId: string) {
    try {
      const quota = await cs.getQuota(orgId)
      const ratio = quota.total > 0 ? quota.used / quota.total : 0
      set({
        quota,
        status: ratio >= 1 ? 'quota_full' : 'connected',
        error: null,
      })
    } catch (err) {
      const e = err as { code?: string; message: string }
      if (e.code === 'invalid_grant') {
        set({ status: 'token_expired', error: e.message })
      } else {
        set({ error: e.message })
      }
    }
  },

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
}))
