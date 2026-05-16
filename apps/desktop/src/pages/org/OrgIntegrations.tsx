import { useEffect, useState } from 'react'
import { open as openExternal } from '@tauri-apps/plugin-shell'
import { useIntegrationsStore } from '../../store/integrations.js'
import { hasPermission } from '../../lib/permissions.js'
import * as cs from '../../lib/cloud-storage/client.js'
import { getDb } from '../../lib/db.js'
import { supabase } from '../../lib/supabase.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { ConnectDriveCard } from '../../components/integrations/ConnectDriveCard.js'
import { ConnectedAccountCard } from '../../components/integrations/ConnectedAccountCard.js'
import { TokenExpiredCard } from '../../components/integrations/TokenExpiredCard.js'
import { FolderMissingCard } from '../../components/integrations/FolderMissingCard.js'
import { DriveFullCard } from '../../components/integrations/DriveFullCard.js'
import { SwapAccountModal } from '../../components/integrations/SwapAccountModal.js'
import { DisconnectModal } from '../../components/integrations/DisconnectModal.js'
import { AdminsList } from '../../components/integrations/AdminsList.js'

type Props = { orgId: string }

export function OrgIntegrations({ orgId }: Props) {
  const account = useIntegrationsStore((s) => s.account)
  const quota = useIntegrationsStore((s) => s.quota)
  const status = useIntegrationsStore((s) => s.status)
  const refreshAccount = useIntegrationsStore((s) => s.refreshAccount)
  const refreshQuota = useIntegrationsStore((s) => s.refreshQuota)
  const clearAccount = useIntegrationsStore((s) => s.clearAccount)

  const [canManage, setCanManage] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [admins, setAdmins] = useState<Array<{ id: string; name: string; roleName: string }>>([])

  // Carrega permissão + conta + quota + counts
  useEffect(() => {
    void hasPermission('manage_integrations', orgId).then(setCanManage)
    void refreshAccount(orgId)
  }, [orgId, refreshAccount])

  // Periodic quota refresh (when connected)
  useEffect(() => {
    if (status !== 'connected' && status !== 'quota_full') return
    void refreshQuota(orgId)
    const id = setInterval(() => void refreshQuota(orgId), 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [status, orgId, refreshQuota])

  // Carrega contagem de músicas com backup_status='uploaded'
  useEffect(() => {
    void (async () => {
      const db = await getDb()
      const rows = await db.select<{ cnt: number }[]>(
        'SELECT COUNT(*) as cnt FROM songs WHERE org_id = ? AND backup_status = ?',
        [orgId, 'uploaded']
      )
      setUploadedCount(rows[0]?.cnt ?? 0)
    })()
  }, [orgId, account?.account_email])

  // Admins list — só busca quando o usuário NÃO tem permissão e precisa contatar admin
  useEffect(() => {
    if (canManage) return
    void (async () => {
      // Owner + role assignments com manage_integrations no SQLite local
      const db = await getDb()
      const adminIds = await db.select<{ user_id: string }[]>(
        `SELECT DISTINCT user_id FROM (
           SELECT owner_id as user_id FROM orgs WHERE id = ?
           UNION
           SELECT ura.user_id FROM user_role_assignments ura
             JOIN role_permissions rp ON rp.role_id = ura.role_id
             WHERE ura.org_id = ? AND rp.permission = 'manage_integrations'
         )`,
        [orgId, orgId]
      )

      if (adminIds.length === 0) {
        setAdmins([])
        return
      }

      // Resolve nomes via Supabase (view user_profiles existe só lá)
      const userIds = adminIds.map((a) => a.user_id)
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', userIds)

      const nameMap = new Map<string, string>()
      for (const p of profiles ?? []) {
        nameMap.set(p.user_id, p.full_name ?? 'Membro')
      }

      // Role names via SQLite (Dono é a role padrão de owners)
      const roleRows = await db.select<{ user_id: string; role_name: string }[]>(
        `SELECT ura.user_id, r.name as role_name
           FROM user_role_assignments ura
           JOIN roles r ON r.id = ura.role_id
           WHERE ura.org_id = ? AND ura.user_id IN (${userIds.map(() => '?').join(',')})`,
        [orgId, ...userIds]
      )
      const roleMap = new Map<string, string>()
      for (const r of roleRows) {
        roleMap.set(r.user_id, r.role_name)
      }

      setAdmins(
        adminIds.map(({ user_id }) => ({
          id: user_id,
          name: nameMap.get(user_id) ?? 'Membro',
          roleName: roleMap.get(user_id) ?? 'Dono',
        }))
      )
    })()
  }, [orgId, canManage])

  async function handleConnect() {
    setConnecting(true)
    try {
      const { authUrl } = await cs.initOAuth(orgId)
      await openExternal(authUrl)
      // Aguarda o deep link callback (capturado em App.tsx) refresh do store
    } catch (err) {
      console.error('OAuth init failed:', err)
      toastError('Não foi possível abrir o Google. Tente novamente.')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    try {
      await cs.disconnect(orgId)
      // clearAccount limpa cache local SQLite + reseta store pra disconnected.
      // Sem isso, refreshAccount leria do cache estale e UI ficaria em branco.
      await clearAccount(orgId)
      toastSuccess('Drive desconectado')
      setDisconnectOpen(false)
    } catch (err) {
      console.error('Disconnect failed:', err)
      toastError('Falha ao desconectar. Tente novamente.')
    }
  }

  function handleSwap() {
    // Trocar conta = desconectar lógicamente + iniciar nova OAuth.
    // Implementação completa (com migração de músicas) fica no Plano 4.
    // No Plano 2 só dispara o fluxo OAuth direto.
    setSwapOpen(false)
    void handleConnect()
  }

  return (
    <div>
      <h3 className="m-0 mb-1 text-[15px] font-semibold" style={{ color: 'var(--text-heading)' }}>
        Backup das músicas no Google Drive
      </h3>
      <p className="m-0 mb-[18px] text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Conecte uma conta Google da igreja pra guardar as músicas em nuvem. Membros baixam automaticamente quando precisarem — não precisam logar no Google.
      </p>

      {status === 'disconnected' && (
        <ConnectDriveCard onConnect={handleConnect} canConnect={canManage} connecting={connecting} />
      )}

      {status === 'token_expired' && account && (
        <TokenExpiredCard
          email={account.account_email}
          canConnect={canManage}
          onReconnect={handleConnect}
        />
      )}

      {status === 'folder_missing' && account && (
        <FolderMissingCard
          email={account.account_email}
          canManage={canManage}
          onRecreate={handleConnect}
        />
      )}

      {status === 'connected' && account && quota && (
        <ConnectedAccountCard
          email={account.account_email}
          providerName="Google Drive"
          total={quota.total}
          usedByLeviticus={account.last_quota_used && account.last_quota_total
            ? Math.max(0, (account.last_quota_used ?? 0) - (quota.used - (account.last_quota_used ?? 0)))
            : 0}
          usedByOthers={Math.max(0, quota.used)}
          uploadedCount={uploadedCount}
          lastSyncedAt={account.last_quota_check_at}
          canManage={canManage}
          onSwap={() => setSwapOpen(true)}
          onDisconnect={() => setDisconnectOpen(true)}
        />
      )}

      {status === 'quota_full' && account && quota && (
        <DriveFullCard
          email={account.account_email}
          provider="google_drive"
          total={quota.total}
          usedByLeviticus={0}
          usedByOthers={quota.used}
          pendingCount={0}
          pendingBytesNeeded={0}
          canManage={canManage}
          onSwap={() => setSwapOpen(true)}
        />
      )}

      {!canManage && status !== 'disconnected' && (
        <div className="mt-4">
          <AdminsList admins={admins} />
        </div>
      )}

      <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        O Leviticus acessa apenas a pasta "Leviticus" no seu Drive — não vê outros arquivos.
      </div>

      <SwapAccountModal
        open={swapOpen}
        currentEmail={account?.account_email ?? ''}
        songsCount={uploadedCount}
        totalBytes={account?.last_quota_used ?? 0}
        onConfirm={handleSwap}
        onCancel={() => setSwapOpen(false)}
      />

      <DisconnectModal
        open={disconnectOpen}
        email={account?.account_email ?? ''}
        songsCount={uploadedCount}
        onConfirm={handleDisconnect}
        onCancel={() => setDisconnectOpen(false)}
      />
    </div>
  )
}
