// apps/desktop/e2e/specs/02-org-invites.spec.ts
//
// Journey #6 from CLAUDE.md § Testing strategy.
// Covers org-invite-code lifecycle and the new-user join flow.

import { browser, $, expect } from '@wdio/globals'
import {
  makeAdminClient,
  createTestUser,
  createOrgWithOwner,
  createInviteCode,
} from '../helpers/supabase.js'
import { cleanLocalSqlite, setReactInputValue, confirmModalAction } from '../helpers/app.js'

describe('Journey #6 — Org invites', () => {
  describe('Test 1 — Owner generates and revokes an invite code', () => {
    let email: string
    let orgName: string

    before(async () => {
      email = `inviter+${Date.now()}@leviticus.test`
      orgName = `Igreja Anfitriã 1 ${Date.now()}`
      await cleanLocalSqlite()
    })

    it('generates a code, lists it, and revokes via UI; SQL confirms both states', async () => {
      const supabase = makeAdminClient()

      // ─── Sign up via UI (same as Journey #1) ───────────────────────────
      await browser.waitUntil(
        async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
        { timeout: 30_000, timeoutMsg: 'Login screen did not load within 30s' }
      )
      await $('input[type=email]').waitForExist({ timeout: 30_000 })
      await $('button=Criar conta').click()
      await setReactInputValue('input#name', 'Usuário Anfitrião')
      await setReactInputValue('input#email', email)
      await setReactInputValue('input#password', 'senha-do-teste-e2e')
      const submitBtn = $('button[type=submit]')
      await submitBtn.waitForEnabled({ timeout: 5_000 })
      await submitBtn.click()

      // ─── Create org via UI ─────────────────────────────────────────────
      await browser.waitUntil(
        async () => /\/org$/.test(await browser.getUrl()),
        { timeout: 15_000, timeoutMsg: 'Did not redirect to /org after signup' }
      )
      await $('button=Criar organização').click()
      await setReactInputValue('input[placeholder="Nome da organização"]', orgName)
      const createBtn = $('button=Criar')
      await createBtn.waitForEnabled({ timeout: 5_000 })
      await createBtn.click()

      // ─── Wait for the app to land on /library ──────────────────────────
      // OrgSelect.handleCreate calls syncOrg (populates local SQLite with roles
      // and permissions) before calling navigate('/library'). This sync must
      // complete before we navigate to /manage — otherwise OrgManage's one-shot
      // permission check (useEffect[orgId]) would read an empty SQLite and never
      // show the Convites tab.
      // The sync is small (1 role, 7 permissions, 1 assignment) and normally
      // finishes in < 2s. 90s gives ample room for a slow local Supabase.
      await browser.waitUntil(
        async () => /\/library/.test(await browser.getUrl()),
        { timeout: 90_000, timeoutMsg: 'Did not land on /library after org creation. OrgSelect.syncOrg may have stalled.' }
      )

      // ─── Fetch org ID from Supabase ────────────────────────────────────
      type OrgRow = { id: string; name: string; owner_id: string }
      let org: OrgRow | null = null
      const orgDeadline = Date.now() + 15_000
      while (Date.now() < orgDeadline) {
        const { data } = await supabase
          .from('organizations')
          .select('id, name, owner_id')
          .eq('name', orgName)
        if (data && data.length > 0) { org = data[0] as OrgRow; break }
        await new Promise((r) => setTimeout(r, 300))
      }
      if (!org) throw new Error(`Org "${orgName}" not found in Supabase (expected — syncOrg completed)`)

      // ─── Navigate to the Convites sub-tab via sidebar ─────────────────
      // Use the "Organização" NavLink — pure React Router SPA navigation,
      // no page reload, session stays intact.
      await $('a[href="/manage"]').waitForExist({ timeout: 10_000 })
      await $('a[href="/manage"]').click()

      await browser.waitUntil(
        async () => /\/manage/.test(await browser.getUrl()),
        { timeout: 10_000, timeoutMsg: 'Did not navigate to /manage after sidebar click' }
      )

      // Click the "Convites" tab. Visible only if user has manage_members
      // permission — guaranteed since syncOrg already populated SQLite.
      const convitesTab = $('button=Convites')
      await convitesTab.waitForExist({ timeout: 15_000 })
      await convitesTab.click()

      await $('button=Novo código').waitForExist({ timeout: 15_000 })

      // ─── Generate a new code via the modal ─────────────────────────────
      await $('button=Novo código').click()
      await setReactInputValue('input[placeholder*="Pro pessoal"]', 'Pro teste E2E')
      // Select the "7 dias" expiry option (button in the radio-style grid).
      await $('button=7 dias').click()
      const gerarBtn = $('button=Gerar código')
      await gerarBtn.waitForEnabled({ timeout: 5_000 })
      await gerarBtn.click()

      // ─── Capture the generated code via SQL polling ────────────────────
      type CodeRow = {
        code: string
        is_active: boolean
        expires_at: string | null
        created_by: string
        label: string | null
      }
      let codeRow: CodeRow | null = null
      const codeDeadline = Date.now() + 15_000
      while (Date.now() < codeDeadline) {
        const { data } = await supabase
          .from('org_invite_codes')
          .select('code, is_active, expires_at, created_by, label')
          .eq('org_id', org.id)
          .eq('label', 'Pro teste E2E')
        if (data && data.length === 1) { codeRow = data[0] as CodeRow; break }
        await new Promise((r) => setTimeout(r, 300))
      }
      if (!codeRow) throw new Error('Invite code did not appear in Supabase within 15s')

      // ─── Assertions on the freshly created code ────────────────────────
      expect(codeRow.is_active).toBe(true)
      expect(codeRow.label).toBe('Pro teste E2E')
      // expires_at ≈ now + 7 days (allow ±2h drift between client clock and handler).
      const sevenDaysMs = 7 * 24 * 3600 * 1000
      const slackMs = 2 * 3600 * 1000
      const expiresAtTs = new Date(codeRow.expires_at!).getTime()
      const expectedTs = Date.now() + sevenDaysMs
      expect(Math.abs(expiresAtTs - expectedTs)).toBeLessThan(slackMs)

      // ─── Revoke via UI ─────────────────────────────────────────────────
      // The row's Revogar button only appears once syncOrg pulls the new code
      // into local SQLite and OrgInvites re-renders. Wait for it.
      const revogarBtn = $('button=Revogar')
      await revogarBtn.waitForExist({ timeout: 30_000 })
      await revogarBtn.waitForEnabled({ timeout: 5_000 })

      // Revogar abre um ConfirmModal — clicar o gatilho e confirmar no modal.
      await revogarBtn.click()
      await confirmModalAction()

      // ─── Poll for is_active === false ──────────────────────────────────
      let revokedRow: { is_active: boolean } | null = null
      const revokeDeadline = Date.now() + 15_000
      while (Date.now() < revokeDeadline) {
        const { data } = await supabase
          .from('org_invite_codes')
          .select('is_active')
          .eq('org_id', org.id)
          .eq('code', codeRow.code)
        if (data && data.length === 1 && data[0].is_active === false) {
          revokedRow = data[0] as { is_active: boolean }
          break
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      if (!revokedRow) throw new Error(`Invite ${codeRow.code} not revoked within 15s`)
    })
  })

  describe('Test 2 — New user joins an existing org via invite code', () => {
    let host: { id: string; email: string }
    let org: { id: string; name: string }
    let code: string
    let joinerEmail: string

    before(async () => {
      // Sign out the previous user (Test 1 left the app at /manage logged in).
      // Click "Sair" → modal opens (issue #33) → click "Sair da conta" →
      // App.tsx's onAuthStateChange redirects to /login.
      const currentUrl = await browser.getUrl()
      if (!/\/login/.test(currentUrl)) {
        const sairBtn = $('button=Sair')
        await sairBtn.waitForExist({ timeout: 10_000 })
        await sairBtn.click()
        // Modal de escolha aparece com duas opções: trocar org / sair da conta.
        // Texto está em div aninhada — usar match parcial.
        const signOutInModal = $('button*=Sair da conta')
        await signOutInModal.waitForExist({ timeout: 5_000 })
        await signOutInModal.click()
        await browser.waitUntil(
          async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
          { timeout: 20_000, timeoutMsg: 'App did not redirect to /login after clicking Sair da conta' }
        )
      }

      const supabase = makeAdminClient()
      const ts = Date.now()
      host = await createTestUser(supabase, { email: `host+${ts}@leviticus.test` })
      org = await createOrgWithOwner(supabase, host.id, `Igreja Anfitriã 2 ${ts}`)
      code = `JOIN${ts.toString().slice(-8)}`  // 12 chars, alphanumeric, uppercased server-side
      await createInviteCode(supabase, { orgId: org.id, createdBy: host.id, code })
      joinerEmail = `joiner+${ts}@leviticus.test`
      await cleanLocalSqlite()
    })

    it('signs up a new user, accepts an invite code, and lands as a member', async () => {
      const supabase = makeAdminClient()

      // ─── Sign up via UI (fresh user) ───────────────────────────────────
      await browser.waitUntil(
        async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
        { timeout: 30_000, timeoutMsg: 'Login screen did not load within 30s' }
      )
      await $('input[type=email]').waitForExist({ timeout: 30_000 })
      await $('button=Criar conta').click()
      await setReactInputValue('input#name', 'Usuário Convidado')
      await setReactInputValue('input#email', joinerEmail)
      await setReactInputValue('input#password', 'senha-do-teste-e2e')
      const submitBtn = $('button[type=submit]')
      await submitBtn.waitForEnabled({ timeout: 5_000 })
      await submitBtn.click()

      // ─── Wait for redirect to /org ─────────────────────────────────────
      await browser.waitUntil(
        async () => /\/org$/.test(await browser.getUrl()),
        { timeout: 15_000, timeoutMsg: 'Did not redirect to /org after signup' }
      )

      // ─── Open the "Entrar com código" form ─────────────────────────────
      await $('button=Entrar com código').click()
      await setReactInputValue('input[placeholder="Código de convite"]', code)

      // The OrgSelect submit button reads "Entrar" in join mode.
      const entrarBtn = $('button=Entrar')
      await entrarBtn.waitForEnabled({ timeout: 5_000 })
      await entrarBtn.click()

      // ─── Poll for organization_members row ─────────────────────────────
      const joinerRow = await (async () => {
        const usersRes = await supabase.auth.admin.listUsers()
        if (usersRes.error) throw new Error(`listUsers: ${usersRes.error.message}`)
        const u = usersRes.data.users.find((u) => u.email === joinerEmail)
        if (!u) throw new Error(`auth.users row not found for ${joinerEmail}`)
        return u
      })()

      let membershipFound = false
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline) {
        const { data } = await supabase
          .from('organization_members')
          .select('user_id, org_id, joined_at')
          .eq('org_id', org.id)
          .eq('user_id', joinerRow.id)
        if (data && data.length === 1) { membershipFound = true; break }
        await new Promise((r) => setTimeout(r, 500))
      }
      if (!membershipFound) {
        throw new Error(`Membership row not found for ${joinerEmail} in ${org.name} within 30s`)
      }

      // ─── Verify joiner has NO role assigned (per spec contract) ────────
      const { data: assignments, error: assignErr } = await supabase
        .from('user_role_assignments')
        .select('user_id')
        .eq('org_id', org.id)
        .eq('user_id', joinerRow.id)
      if (assignErr) throw new Error(`user_role_assignments select: ${assignErr.message}`)
      expect(assignments ?? []).toHaveLength(0)
    })
  })
})
