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
} from '../helpers/supabase.js'
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'

describe('Journey #11 — Cloud Storage Integration', () => {
  let email: string
  let password: string
  let userId: string
  let orgId: string

  before(async () => {
    email = `cloud-admin+${Date.now()}@leviticus.test`
    password = 'senha-do-teste-e2e'
    await cleanLocalSqlite()

    const admin = makeAdminClient()
    const user = await createTestUser(admin, { email, password })
    userId = user.id
    const org = await createOrgWithOwner(admin, userId, `Cloud Igreja ${Date.now()}`)
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

    // Usuário tem 1 org → app seleciona automaticamente e vai pra /library
    await browser.waitUntil(
      async () => /\/library/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'Did not land on /library after login' }
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

  // Helper: pré-seed cloud_storage_accounts via admin client.
  // refresh_token_encrypted precisa ser bytea válido — usamos a função
  // encrypt_cloud_secret SQL pra gerar um token "fake-refresh" criptografado.
  async function seedCloudAccount(opts: {
    quotaTotal?: number
    quotaUsed?: number
  } = {}) {
    const admin = makeAdminClient()
    // Garante que não há row órfã de testes anteriores na mesma session.
    await admin.from('cloud_storage_accounts').delete().eq('org_id', orgId)

    const { data: encrypted, error: encErr } = await admin.rpc('encrypt_cloud_secret', {
      plaintext: 'fake-refresh-token-e2e',
    })
    if (encErr) throw new Error(`encrypt_cloud_secret failed: ${encErr.message}`)

    // INSERT direto via service role (RLS bypass).
    const { error } = await admin.from('cloud_storage_accounts').insert({
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
      last_quota_check_at: opts.quotaTotal ? new Date().toISOString() : null,
    })
    if (error) throw new Error(`seedCloudAccount insert failed: ${error.message}`)
  }

  // Helper: dispara sync no app pra que SQLite local pegue mudanças feitas
  // direto no Supabase via admin client.
  async function reloadIntegrations() {
    // Volta pra /library e retorna pra /manage?tab=integrations — força o
    // useEffect do OrgIntegrations a re-rodar refreshAccount.
    await browser.execute(() => {
      window.location.href = '/library'
    })
    await browser.waitUntil(
      async () => /\/library/.test(await browser.getUrl()),
      { timeout: 10_000, timeoutMsg: 'Did not redirect to /library' }
    )
    await $('a[href="/manage"]').click()
    const integracoesTab = $('button=Integrações')
    await integracoesTab.waitForExist({ timeout: 10_000 })
    await integracoesTab.click()
    await $('h3=Backup das músicas no Google Drive').waitForExist({ timeout: 10_000 })
  }

  it('T1 — estado desconectado: ConnectDriveCard + aviso da checkbox', async () => {
    // Limpa qualquer row residual (no caso de re-run)
    const admin = makeAdminClient()
    await admin.from('cloud_storage_accounts').delete().eq('org_id', orgId)
    await reloadIntegrations()

    // Card de "não configurado"
    const notConfigured = $('*=Drive ainda não configurado')
    await notConfigured.waitForExist({ timeout: 10_000, timeoutMsg: 'Disconnected card did not render' })

    // Botão de conectar habilitado (admin tem manage_integrations)
    const connectBtn = $('button=Conectar Google Drive')
    await connectBtn.waitForExist({ timeout: 5_000 })
    expect(await connectBtn.isEnabled()).toBe(true)

    // Aviso prominente sobre a checkbox do Drive
    const warning = $('*=Atenção na tela do Google')
    await warning.waitForExist({ timeout: 5_000, timeoutMsg: 'Drive checkbox warning callout missing' })

    const checkboxHint = $('*=marque ela antes de clicar')
    await checkboxHint.waitForExist({ timeout: 5_000, timeoutMsg: 'Checkbox instruction text missing' })
  })

  it('T2 — estado conectado: ConnectedAccountCard com email e quota', async () => {
    // Seed conta conectada com quota usada parcial (não cheia)
    await seedCloudAccount({
      quotaTotal: 16 * 1024 ** 3,           // 15 GB
      quotaUsed: 5 * 1024 ** 3,              // 5 GB usado
    })
    await reloadIntegrations()

    // Email da conta
    const emailLabel = $('*=pastor.teste@igrejaboasnovas.org')
    await emailLabel.waitForExist({ timeout: 10_000, timeoutMsg: 'Connected email not shown' })

    // Pasta "Leviticus"
    const folderLabel = $('*=pasta "Leviticus"')
    await folderLabel.waitForExist({ timeout: 5_000 })

    // Quota bar deve mostrar valor total em GB
    const quotaLabel = $('*=15 GB')
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

    const fullAlert = $('*=Drive cheio')
    await fullAlert.waitForExist({ timeout: 10_000, timeoutMsg: 'DriveFullCard not rendered' })

    // 3 ações de recovery (RecoveryActions)
    await $('*=Liberar espaço no Drive').waitForExist({ timeout: 5_000 })
    await $('*=Atualizar plano do Google').waitForExist({ timeout: 5_000 })
    await $('*=Trocar pra outra conta').waitForExist({ timeout: 5_000 })
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

    // Modal renderiza overlay com z-50 — usa esse contexto pra achar o botão
    // de confirmação (evita pegar o botão original do card que ainda existe
    // por trás do modal). O modal tem botão "Desconectar" (variant primária
    // vermelha) e "Cancelar".
    const modalConfirmBtn = $('div.fixed.z-50 button=Desconectar')
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
    const reconnectCard = $('*=Drive ainda não configurado')
    await reconnectCard.waitForExist({
      timeout: 10_000,
      timeoutMsg: 'UI did not return to disconnected state after disconnect',
    })
  })
})
