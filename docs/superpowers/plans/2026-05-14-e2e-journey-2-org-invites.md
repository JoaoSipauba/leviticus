# E2E Journey #2 (Org Invites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second E2E spec (`02-org-invites.spec.ts`) with two tests — owner generates and revokes an invite code, and a new user joins via a pre-seeded code. Builds on the harness shipped in the previous journey.

**Architecture:** Two `it()` blocks in one spec, independent setups. Test 1 uses the full UI flow (signup → org create → generate → revoke); Test 2 seeds the owner side via service-role admin client to avoid logout-in-WebView fragility, and only routes user B through the UI. SQL polling against the Supabase admin client is the source of truth for all assertions.

**Tech Stack:** WebdriverIO 9 + Mocha (already configured). Supabase service-role admin client (already configured). No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-14-e2e-journey-2-org-invites-design.md](../specs/2026-05-14-e2e-journey-2-org-invites-design.md)

---

## File Map

| File | Action |
|---|---|
| `apps/desktop/e2e/helpers/supabase.ts` | MODIFY — add `createTestUser`, `createOrgWithOwner`, `createInviteCode` |
| `apps/desktop/e2e/helpers/app.ts` | MODIFY — add `stubConfirm` |
| `apps/desktop/e2e/specs/02-org-invites.spec.ts` | CREATE — 2 `it()` tests |

No CI workflow changes (the spec glob `specs/**/*.spec.ts` picks up the new file automatically). No app changes — pure test additions.

---

## Task 1: Helpers — `createTestUser`, `createOrgWithOwner`, `createInviteCode`

**Files:**
- Modify: `apps/desktop/e2e/helpers/supabase.ts`

These helpers run via the service-role admin client and bypass RLS — they're for seeding only. They are NEVER called from the desktop app, only from `before*` hooks in specs.

- [ ] **Step 1: Read current helpers/supabase.ts**

```bash
cat apps/desktop/e2e/helpers/supabase.ts
```

Confirm `makeAdminClient` is already exported. The new helpers will use it.

- [ ] **Step 2: Add the 3 helpers**

Append to `apps/desktop/e2e/helpers/supabase.ts` (after the existing `makeAdminClient` function):

```ts
/**
 * Creates an auth.users row with the given email, password-confirmed. Bypasses
 * the email-verification step. Only the e2e harness should call this — the
 * service-role key is required.
 */
export async function createTestUser(
  admin: SupabaseClient,
  opts: { email?: string; password?: string } = {}
): Promise<{ id: string; email: string }> {
  const email = opts.email ?? `seeded+${Date.now()}@leviticus.test`
  const password = opts.password ?? 'senha-do-teste-e2e'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? 'no user returned'}`)
  }
  return { id: data.user.id, email }
}

/**
 * Creates an `organizations` row owned by `ownerId` and inserts the matching
 * `organization_members` row. The `seed_owner_role` trigger fires on the
 * organizations insert, creating the Dono role and assignment.
 */
export async function createOrgWithOwner(
  admin: SupabaseClient,
  ownerId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from('organizations')
    .insert({ name, owner_id: ownerId })
    .select('id, name')
    .single()
  if (error || !data) {
    throw new Error(`createOrgWithOwner failed: ${error?.message ?? 'no row'}`)
  }
  const { error: memberError } = await admin
    .from('organization_members')
    .insert({ user_id: ownerId, org_id: data.id })
  if (memberError) {
    throw new Error(`createOrgWithOwner member insert failed: ${memberError.message}`)
  }
  return data as { id: string; name: string }
}

/**
 * Inserts a row into `org_invite_codes` directly (bypassing the `create_invite_code`
 * RPC because the RPC needs auth.uid(), which service-role calls don't have).
 * The code is uppercased to match the RPC's behavior so consumers can paste in
 * any case and still hit the unique index.
 */
export async function createInviteCode(
  admin: SupabaseClient,
  args: {
    orgId: string
    createdBy: string
    code: string
    label?: string | null
    expiresAt?: string | null
  }
): Promise<void> {
  const { error } = await admin.from('org_invite_codes').insert({
    org_id: args.orgId,
    code: args.code.toUpperCase(),
    created_by: args.createdBy,
    label: args.label ?? null,
    expires_at: args.expiresAt ?? null,
    is_active: true,
  })
  if (error) throw new Error(`createInviteCode failed: ${error.message}`)
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: no errors. If `SupabaseClient` import isn't there, add `type SupabaseClient` to the existing import from `@supabase/supabase-js`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/e2e/helpers/supabase.ts
git commit -m "feat(e2e): helpers — createTestUser, createOrgWithOwner, createInviteCode"
```

---

## Task 2: Helper — `stubConfirm`

**Files:**
- Modify: `apps/desktop/e2e/helpers/app.ts`

The desktop app uses `window.confirm` in a few destructive flows (e.g. `OrgInvites.handleRevoke`, `OrgRoles.deleteRole`). Native alerts block the JS thread and WebDriver against wry doesn't reliably handle them via `acceptAlert`. We stub `confirm` in the page before triggering the action.

- [ ] **Step 1: Append the helper**

Append to `apps/desktop/e2e/helpers/app.ts`:

```ts
/**
 * Replaces `window.confirm` in the running app to silently return `returnValue`,
 * so destructive actions that gate on `confirm()` proceed (or abort) without
 * showing a native dialog. WebDriver against wry can't reliably accept native
 * alerts, so we sidestep the dialog entirely.
 *
 * Reset is not necessary between tests — the app process restarts between
 * WebDriver sessions and gets a fresh `window`.
 */
export async function stubConfirm(returnValue: boolean): Promise<void> {
  await browser.execute((v: boolean) => {
    window.confirm = () => v
  }, returnValue)
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/e2e/helpers/app.ts
git commit -m "feat(e2e): helper — stubConfirm to neutralize native dialogs"
```

---

## Task 3: Spec — Test 1 (owner generates and revokes invite)

**Files:**
- Create: `apps/desktop/e2e/specs/02-org-invites.spec.ts`

This file starts with the first `it()` only. Task 4 adds the second `it()` to the same describe block.

- [ ] **Step 1: Create the spec file with Test 1**

```ts
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

      // ─── Wait for org to appear in Supabase (source of truth) ──────────
      type OrgRow = { id: string; name: string; owner_id: string }
      let org: OrgRow | null = null
      const orgDeadline = Date.now() + 30_000
      while (Date.now() < orgDeadline) {
        const { data } = await supabase
          .from('organizations')
          .select('id, name, owner_id')
          .eq('name', orgName)
        if (data && data.length > 0) { org = data[0] as OrgRow; break }
        await new Promise((r) => setTimeout(r, 500))
      }
      if (!org) throw new Error(`Org "${orgName}" did not appear in Supabase within 30s`)

      // ─── Navigate directly to the Convites sub-tab ─────────────────────
      // Direct URL navigation avoids depending on the sidebar/tab UI for this journey.
      await browser.url(`tauri://localhost/manage?tab=invites`)
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
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean. If type errors on `expect(...)` or `browser`, ensure the wdio types are loaded via `@wdio/globals/types` (already in the tsconfig from the harness setup).

- [ ] **Step 3: Run Test 1 locally**

```bash
pkill -f tauri-wd 2>/dev/null; sleep 1
cd apps/desktop && pnpm test:e2e:local
```

Expected: Both spec files run. The new one passes Test 1. Total run time ≈ 20-40s.

If Test 1 fails:
- Check `apps/desktop/e2e/screenshots/` for the on-failure capture.
- Common failures: `Novo código` button selector mismatch (verify OrgInvites.tsx label), expiry button label (verify "7 dias" text exact match), `Revogar` button not appearing (syncOrg slow — bump the 30s timeout).
- If the modal's "Gerar código" never enables, the `setReactInputValue` for label might be wrong selector. Inspect `apps/desktop/src/components/org/InviteCodeModal.tsx` to confirm the placeholder.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/e2e/specs/02-org-invites.spec.ts
git commit -m "feat(e2e): journey #6 test 1 — owner generates and revokes invite"
```

---

## Task 4: Spec — Test 2 (new user joins via pre-seeded code)

**Files:**
- Modify: `apps/desktop/e2e/specs/02-org-invites.spec.ts`

This adds a second sibling `describe` inside the outer `describe('Journey #6 — Org invites')`. The owner is fully seeded via SQL — only user B passes through the UI.

- [ ] **Step 1: Append Test 2**

Open `apps/desktop/e2e/specs/02-org-invites.spec.ts`. Find the closing brace of the outer `describe` block (the last `})` in the file). **Before** that brace, insert this `describe` block (so it sits as a sibling to the Test 1 block, inside the outer `describe('Journey #6 — Org invites')`):

```ts
  describe('Test 2 — New user joins an existing org via invite code', () => {
    let host: { id: string; email: string }
    let org: { id: string; name: string }
    let code: string
    let joinerEmail: string

    before(async () => {
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
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Run both tests locally**

```bash
pkill -f tauri-wd 2>/dev/null; sleep 1
cd apps/desktop && pnpm test:e2e:local
```

Expected: both spec files run, all 3 `it()` blocks pass (Journey #1's one + Journey #6's two). Total ≈ 40-60s.

If Test 2 fails:
- Verify `OrgSelect.tsx` still has the button label "Entrar com código" and input placeholder "Código de convite".
- Confirm `seed_owner_role` trigger fired for the SQL-seeded org by checking the `roles` table has a row for `org.id` with name 'Dono'.
- If the code is rejected: confirm `createInviteCode` is uppercasing correctly and `OrgSelect.handleJoin` is also uppercasing on input.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/e2e/specs/02-org-invites.spec.ts
git commit -m "feat(e2e): journey #6 test 2 — new user joins via pre-seeded code"
```

---

## Final push

- [ ] **Push commits to remote**

The PR (#15) is already open against `dev`; these commits append to it automatically.

```bash
git push
```

Watch the CI run on GitHub Actions. The new spec is picked up by the existing `specs/**/*.spec.ts` glob; no workflow changes needed.

Expected CI result: `e2e` job runs 3 specs (Journey #1 + Journey #6's two tests), all green. If only Journey #1 ran but #6 didn't, the spec glob didn't pick up the new file — check the path matches `apps/desktop/e2e/specs/`.
