import { useEffect, useState } from 'react'
import { open as openExternal } from '@tauri-apps/plugin-shell'
import { useIntegrationsStore } from '../../store/integrations.js'
import { hasPermission } from '../../lib/permissions.js'
import * as cs from '../../lib/cloud-storage/client.js'
import { getDb } from '../../lib/db.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { ConnectDriveCard } from '../../components/integrations/ConnectDriveCard.js'
import { ConnectedAccountCard } from '../../components/integrations/ConnectedAccountCard.js'
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

  // Carrega contagem de músicas com backup_status='uploaded' + lista de admins
  useEffect(() => {
    void (async () => {
      const db = await getDb()
      const rows = await db.select<{ cnt: number }[]>(
        'SELECT COUNT(*) as cnt FROM songs WHERE org_id = ? AND backup_status = ?',
        [orgId, 'uploaded']
      )
      setUploadedCount(rows[0]?.cnt ?? 0)

      // Admins = owner + quem tem manage_integrations
      const adminRows = await db.select<{ id: string; name: string; role_name: string }[]>(
        `SELECT om.user_id as id, COALESCE(up.display_name, 'Membro') as name,
                COALESCE(r.name, 'Membro') as role_name
         FROM organization_members om
         LEFT JOIN user_profiles_view up ON up.user_id = om.user_id
         LEFT JOIN user_role_assignments ura ON ura.user_id = om.user_id AND ura.org_id = om.org_id
         LEFT JOIN roles r ON r.id = ura.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         WHERE om.org_id = ? AND (rp.permission = 'manage_integrations' OR om.user_id IN (
           SELECT owner_id FROM orgs WHERE id = ?
         ))`,
        [orgId, orgId]
      )
      setAdmins(adminRows.map((r) => ({ id: r.id, name: r.name, roleName: r.role_name })))
    })()
  }, [orgId, account?.account_email])

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
      await refreshAccount(orgId)
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

      {(status === 'token_expired' || status === 'folder_missing') && (
        <ConnectDriveCard onConnect={handleConnect} canConnect={canManage} connecting={connecting} />
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
