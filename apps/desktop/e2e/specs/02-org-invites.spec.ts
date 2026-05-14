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
import { cleanLocalSqlite, setReactInputValue, stubConfirm } from '../helpers/app.js'

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

      // OrgInvites.handleRevoke uses window.confirm — stub it to silently accept.
      await stubConfirm(true)
      await revogarBtn.click()

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
})
