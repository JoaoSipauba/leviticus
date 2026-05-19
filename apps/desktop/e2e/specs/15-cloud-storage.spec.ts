// apps/desktop/e2e/specs/15-cloud-storage.spec.ts
//
// Journey #11 — Cloud Storage Integration (admin owner).
//
// Cobre estados visuais da tab Integrações + flow de desconexão.
// O OAuth real do Google é IMPOSSÍVEL de testar em E2E (depende de browser
// externo + login em conta Google real), então simulamos pré-seedando
// rows na tabela cloud_storage_accounts via service-role client. Esses testes
// validam:
//   T1 — estado desconectado renderiza ConnectDriveCard + aviso da checkbox Drive
//   T2 — estado conectado (seed) renderiza ConnectedAccountCard com email + quota
//   T3 — estado quota cheia (seed) renderiza DriveFullCard com RecoveryActions
//   T4 — disconnect flow: click → type-to-confirm → row removido + UI volta
//
// **Pré-requisito pra T4:** `supabase functions serve cloud-storage-proxy
// --env-file supabase/.env.local --no-verify-jwt` rodando em terminal separado.
// Sem ele, o botão Desconectar falha porque cs.disconnect() bate na edge
// function. T1, T2 e T3 não dependem do edge function.

import { browser, $, expect } from '@wdio/globals'
import {
  makeAdminClient,
  createTestUser,
  createOrgWithOwner,
  E2E_FIXTURE_PASSWORD,
} from '../helpers/supabase.js'
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'

describe('Journey #11 — Cloud Storage Integration', () => {
  let email: string
  let password: string
  let userId: string
  let orgId: string
  let orgName: string

  before(async () => {
    email = `cloud-admin+${Date.now()}@leviticus.test`
    password = E2E_FIXTURE_PASSWORD
    orgName = `Cloud Igreja ${Date.now()}`
    await cleanLocalSqlite()

    const admin = makeAdminClient()
    const user = await createTestUser(admin, { email, password })
    userId = user.id
    const org = await createOrgWithOwner(admin, userId, orgName)
    orgId = org.id

    // ─── Log in como dono via UI ───────────────────────────────────────────
    await browser.waitUntil(
      async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'Login screen did not load' }
    )
    await $('input[type=email]').waitForExist({ timeout: 30_000 })
    await setReactInputValue('input#email', email)
    await setReactInputValue('input#password', password)
    await $('button[type=submit]').click()

    // Login bem-sucedido leva pra /org (OrgSelect não auto-seleciona quando há 1 org)
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'Did not land on /org after login' }
    )

    // Clica na org criada pra selecionar → dispara syncOrg + navega pra /library
    const orgBtn = $(`button*=${orgName}`)
    await orgBtn.waitForExist({ timeout: 10_000, timeoutMsg: 'Org row not visible in OrgSelect' })
    await orgBtn.click()

    // syncOrg pode demorar ~30s (11 entities); aguardar até 90s como nos outros specs
    await browser.waitUntil(
      async () => /\/library/.test(await browser.getUrl()),
      { timeout: 90_000, timeoutMsg: 'Did not land on /library after org select (syncOrg may have stalled)' }
    )

    // Navega pra Organização → Integrações
    await $('a[href="/manage"]').waitForExist({ timeout: 10_000 })
    await $('a[href="/manage"]').click()
    await browser.waitUntil(
      async () => /\/manage/.test(await browser.getUrl()),
      { timeout: 10_000, timeoutMsg: 'Did not navigate to /manage' }
    )

    const integracoesTab = $('button=Integrações')
    await integracoesTab.waitForExist({ timeout: 10_000, timeoutMsg: 'Integrações tab not visible' })
    await integracoesTab.click()

    // Espera o card principal renderizar (header)
    const sectionTitle = $('h3=Backup das músicas no Google Drive')
    await sectionTitle.waitForExist({ timeout: 10_000, timeoutMsg: 'Integrações section did not render' })
  })

  // Helper: pré-seed em DOIS lugares — SQLite local (pro app renderizar) +
  // Supabase remoto (pra disconnect/swap funcionar via edge function). O
  // refreshAccount do store lê só do SQLite local, mas o edge function bate
  // na tabela remota. Seedar nos dois evita ter que rodar syncOrg.
  async function seedCloudAccount(opts: {
    quotaTotal?: number
    quotaUsed?: number
  } = {}) {
    // 1. Supabase remoto (pra edge function poder deletar/atualizar)
    const admin = makeAdminClient()
    await admin.from('cloud_storage_accounts').delete().eq('org_id', orgId)
    // Placeholder bytea — não precisamos de ciphertext real porque o E2E não
    // exercita refresh/disconnect (que decifrariam o valor). Cloud storage
    // crypto agora roda no Edge Function via Web Crypto (ver crypto.ts).
    const encrypted = '\\x' + 'ab'.repeat(32)
    const now = new Date().toISOString()
    const { error: remoteErr } = await admin.from('cloud_storage_accounts').insert({
      org_id: orgId,
      provider: 'google_drive',
      account_email: 'pastor.teste@igrejaboasnovas.org',
      account_user_id: 'fake-google-user-id-1',
      refresh_token_encrypted: encrypted,
      access_token: 'fake-access-token',
      access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      app_folder_id: 'fake-folder-id-leviticus',
      last_quota_total: opts.quotaTotal ?? null,
      last_quota_used: opts.quotaUsed ?? null,
      last_quota_check_at: opts.quotaTotal ? now : null,
    })
    if (remoteErr) throw new Error(`Supabase insert failed: ${remoteErr.message}`)

    // 2. SQLite local (pro app render imediatamente, sem precisar de syncOrg)
    await browser.execute(
      async (org_id, total, used) => {
        // Acessa o Tauri SQL plugin via __TAURI__ exposto pelo runtime.
        // Tauri v2 expõe via __TAURI_INTERNALS__.invoke
        const internals = (window as any).__TAURI_INTERNALS__
        const invoke = internals?.invoke ?? (window as any).__TAURI__?.invoke ?? (window as any).__TAURI__?.core?.invoke
        if (!invoke) {
          throw new Error('Tauri invoke not available. Globals: ' + JSON.stringify({
            hasInternals: !!internals,
            hasTAURI: !!(window as any).__TAURI__,
            keysOnWindow: Object.keys(window).filter((k) => k.toLowerCase().includes('tauri')),
          }))
        }

        // tauri-plugin-sql expõe comandos como 'plugin:sql|execute'.
        const dbHandle = 'sqlite:leviticus.db'

        // Limpa eventual linha residual.
        await invoke('plugin:sql|execute', {
          db: dbHandle,
          query: 'DELETE FROM cloud_storage_accounts WHERE org_id = ?',
          values: [org_id],
        })

        const now = new Date().toISOString()
        await invoke('plugin:sql|execute', {
          db: dbHandle,
          query:
            'INSERT INTO cloud_storage_accounts ' +
            '(org_id, provider, account_email, account_user_id, app_folder_id, ' +
            ' connected_by, connected_at, last_quota_total, last_quota_used, last_quota_check_at, updated_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          values: [
            org_id,
            'google_drive',
            'pastor.teste@igrejaboasnovas.org',
            'fake-google-user-id-1',
            'fake-folder-id-leviticus',
            null,
            now,
            total,
            used,
            total ? now : null,
            now,
          ],
        })
      },
      orgId,
      opts.quotaTotal ?? null,
      opts.quotaUsed ?? null,
    )
  }

  // Helper: força o OrgIntegrations a re-rodar refreshAccount.
  // Implementação: navega pra fora da tab e volta — re-monta o componente.
  async function reloadIntegrations() {
    // Clica em outra tab pra unmount o OrgIntegrations
    await $('button=Informações').click()
    await browser.pause(150)
    // Volta pra Integrações — re-monta + dispara useEffect refreshAccount
    const integracoesTab = $('button=Integrações')
    await integracoesTab.click()
    await $('h3=Backup das músicas no Google Drive').waitForExist({ timeout: 10_000 })
  }

  it('T1 — estado desconectado: ConnectDriveCard + aviso da checkbox', async () => {
    // Limpa row residual (no caso de re-run) em AMBOS lugares: Supabase + SQLite local.
    const admin = makeAdminClient()
    await admin.from('cloud_storage_accounts').delete().eq('org_id', orgId)
    await browser.execute(async (org_id) => {
      const tauri = (window as any).__TAURI__
      const invoke = tauri?.core?.invoke ?? tauri?.invoke
      if (!invoke) throw new Error('Tauri invoke not available')
      await invoke('plugin:sql|execute', {
        db: 'sqlite:leviticus.db',
        query: 'DELETE FROM cloud_storage_accounts WHERE org_id = ?',
        values: [org_id],
      })
    }, orgId)
    await reloadIntegrations()

    // Card de "não configurado"
    const notConfigured = $('div*=Drive ainda não configurado')
    await notConfigured.waitForExist({ timeout: 10_000, timeoutMsg: 'Disconnected card did not render' })

    // Botão de conectar habilitado (admin tem manage_integrations).
    // waitForEnabled em vez de isEnabled imediato — hasPermission é async,
    // o botão começa disabled até a promise resolver.
    const connectBtn = $('button=Conectar Google Drive')
    await connectBtn.waitForEnabled({
      timeout: 10_000,
      timeoutMsg: 'Connect button never enabled — hasPermission may not have resolved',
    })

    // Aviso prominente sobre a checkbox do Drive
    const warning = $('span*=Atenção na tela do Google')
    await warning.waitForExist({ timeout: 5_000, timeoutMsg: 'Drive checkbox warning callout missing' })

    const checkboxHint = $('div*=Marque ela antes de clicar')
    await checkboxHint.waitForExist({ timeout: 5_000, timeoutMsg: 'Checkbox instruction text missing' })
  })

  it('T2 — estado conectado: ConnectedAccountCard com email e quota', async () => {
    // Seed conta conectada com quota usada parcial (não cheia).
    // 15 GB é o free tier Google Drive padrão.
    await seedCloudAccount({
      quotaTotal: 15 * 1024 ** 3,           // 15 GB
      quotaUsed: 5 * 1024 ** 3,              // 5 GB usado
    })
    await reloadIntegrations()

    // Email da conta
    const emailLabel = $('div*=pastor.teste')
    await emailLabel.waitForExist({ timeout: 10_000, timeoutMsg: 'Connected email not shown' })

    // Pasta "Leviticus"
    const folderLabel = $('div*=Leviticus')
    await folderLabel.waitForExist({ timeout: 5_000 })

    // Quota bar deve mostrar valor total em GB
    const quotaLabel = $('span*=15 GB')
    await quotaLabel.waitForExist({ timeout: 5_000, timeoutMsg: 'Quota bar did not render with total' })

    // Botões de gerenciamento visíveis (canManage=true)
    await $('button=Trocar conta').waitForExist({ timeout: 5_000 })
    await $('button=Desconectar').waitForExist({ timeout: 5_000 })
  })

  it('T3 — quota cheia: DriveFullCard com 3 ações de recuperação', async () => {
    const fullQuota = 16 * 1024 ** 3
    await seedCloudAccount({
      quotaTotal: fullQuota,
      quotaUsed: fullQuota,
    })
    await reloadIntegrations()

    const fullAlert = $('div*=Drive cheio')
    await fullAlert.waitForExist({ timeout: 10_000, timeoutMsg: 'DriveFullCard not rendered' })

    // 3 ações de recovery (RecoveryActions)
    await $('div*=Liberar espaço no Drive').waitForExist({ timeout: 5_000 })
    await $('div*=Atualizar plano do Google').waitForExist({ timeout: 5_000 })
    await $('div*=Trocar pra outra conta').waitForExist({ timeout: 5_000 })
  })

  it('T4 — disconnect flow: type-to-confirm + row removido + UI volta', async () => {
    // Garante estado conectado primeiro
    await seedCloudAccount({
      quotaTotal: 16 * 1024 ** 3,
      quotaUsed: 5 * 1024 ** 3,
    })
    await reloadIntegrations()

    // Click desconectar abre o modal
    await $('button=Desconectar').click()

    // Modal aparece com placeholder de type-to-confirm
    const confirmInput = $('input[placeholder*="desconectar"]')
    await confirmInput.waitForExist({ timeout: 5_000, timeoutMsg: 'DisconnectModal did not open' })

    // Digita "desconectar" pra habilitar o botão de confirmação no modal
    await setReactInputValue('input[placeholder*="desconectar"]', 'desconectar')

    // Modal renderiza overlay com classe "fixed inset-0 z-50". Usa element
    // chaining pra escopar o botão dentro do modal — evita pegar o botão
    // "Desconectar" original do card que continua no DOM por trás.
    const modal = $('div.fixed.inset-0.z-50')
    await modal.waitForExist({ timeout: 5_000, timeoutMsg: 'Modal overlay never appeared' })
    const modalConfirmBtn = modal.$('button=Desconectar')
    await modalConfirmBtn.waitForEnabled({ timeout: 5_000, timeoutMsg: 'Modal confirm button never enabled' })
    await modalConfirmBtn.click()

    // Aguarda row sumir do Supabase (edge function fez DELETE via RPC)
    const admin = makeAdminClient()
    let rowRemoved = false
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await admin
        .from('cloud_storage_accounts')
        .select('org_id')
        .eq('org_id', orgId)
      if (!data || data.length === 0) { rowRemoved = true; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    expect(rowRemoved).toBe(true)

    // UI volta pra estado desconectado
    const reconnectCard = $('div*=Drive ainda não configurado')
    await reconnectCard.waitForExist({
      timeout: 10_000,
      timeoutMsg: 'UI did not return to disconnected state after disconnect',
    })
  })
})
