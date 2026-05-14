# E2E Journey #2 — Org Invites Design

## Goal

Add the second E2E journey to the harness: cover the org-invite-code flow end-to-end. Validate that (a) an org owner can generate and revoke invite codes through the UI, and (b) a new user can sign up and join an existing org by typing a previously-generated invite code.

Builds on the harness shipped in [`2026-05-14-e2e-harness-and-first-journey-design.md`](2026-05-14-e2e-harness-and-first-journey-design.md). No new infrastructure — just one new spec file plus a small additions to the helpers.

This corresponds to jornada **#6** in the priority list documented in [CLAUDE.md § Testing strategy](../../../CLAUDE.md#testing-strategy).

---

## Scope

**In:**
- One new spec file `e2e/specs/02-org-invites.spec.ts` with two independent `it()` tests.
- New `supabase.ts` helpers to seed users / orgs / invite codes via the admin client (bypassing RLS).
- New `app.ts` helper `stubConfirm(returnValue)` to neutralize native `window.confirm` dialogs.
- SQL-based assertions for both tests (DB state is the source of truth).

**Out:**
- The copy-to-clipboard sub-flow ("copiar" in the original journey description). `navigator.clipboard` requires permissions in WKWebView and is flaky in WebDriver. Manual smoke covers it.
- Expiration-edge-cases (an expired code rejected at join time). Covered by a future journey or by RPC unit tests.
- Two-user-in-one-test choreography (logout between actors). Test 2 seeds the owner via SQL precisely to avoid this.

---

## Test 1 — `owner generates and revokes an invite code`

**Setup (same pattern as Journey #1, abbreviated):**
1. `cleanLocalSqlite()` — wipe SQLite + WebKit data.
2. App boots → /login.
3. Sign up via UI: name + unique email + password → submit.
4. Wait for /org redirect → create org "Igreja Teste 1 {ts}" → wait for organization row in Supabase.

**Navigate to invites tab:**
5. `browser.url('tauri://localhost/manage?tab=invites')` — direct navigation; we don't need to test the sidebar→tab navigation in this journey (covered elsewhere).
6. `$('button=Novo código').waitForExist({ timeout: 10_000 })` — confirms we're on the invites panel.

**Generate code:**
7. Click "Novo código" → modal opens.
8. `setReactInputValue('input[placeholder*="Pro pessoal"]', 'Pro teste E2E')` — fills the label.
9. Click "7 dias" expiry button.
10. Click "Gerar código" → wait for modal to close.

**Capture the generated code via DB (not DOM):**
11. Poll `org_invite_codes` by `(org_id, label='Pro teste E2E')` until exactly one row appears (timeout 15s).
12. Capture `code`, `expires_at` from that row.
13. Assert `is_active === true`.
14. Assert `expires_at` is roughly 7 days in the future (allow ±2h slack).
15. Assert `created_by === userA.id`.

**Revoke code via UI:**
16. Wait for the "Revogar" button to exist on the panel — proves the list rendered. There's exactly one active code, so `$('button=Revogar')` is unambiguous.
17. Call `stubConfirm(true)` so `OrgInvites.handleRevoke`'s `window.confirm` returns true silently.
18. Click "Revogar".

**SQL assertion on revoke:**
19. Poll the same row until `is_active === false` (timeout 15s). Proves `revoke_invite_code` RPC ran end-to-end.

---

## Test 2 — `new user joins an existing org via an invite code`

**Setup via admin client (no UI for actor A):**
1. `cleanLocalSqlite()`.
2. `userA = await createTestUser({ email: 'host+{ts}@leviticus.test' })`.
3. `org = await createOrgWithOwner(userA.id, 'Igreja Anfitriã {ts}')` — INSERT into `organizations` (the `seed_owner_role` trigger creates the Dono role + assignment).
4. `code = 'JOIN' + Date.now()` (12-char alpha-num, uppercased).
5. `await createInviteCode({ orgId: org.id, createdBy: userA.id, code })` — direct INSERT into `org_invite_codes`, bypasses RLS via service role.

**UI steps for user B:**
6. App boots → /login.
7. Sign up via UI: emailB unique, password → submit.
8. Wait for redirect to /org.
9. Click "Entrar com código" → join form opens.
10. `setReactInputValue('input[placeholder*="Código"]', code)` — fills the invite input. The OrgSelect handler uppercases automatically; setting either case works.
11. Wait for the "Entrar" submit to be enabled (`waitForEnabled`).
12. Click "Entrar".

**SQL assertions:**
13. Resolve `userB.id` via `auth.admin.listUsers().find(u => u.email === emailB)`.
14. Query `organization_members` for `(user_id = userB.id, org_id = org.id)` — assert exactly 1 row, joined_at recent.
15. Optionally: assert `user_role_assignments` is empty for `(userB, org)` — proves the spec's "new members joined via invite arrive with no role" rule from the org-tab design.

---

## New helpers

### `e2e/helpers/supabase.ts` additions

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function createTestUser(
  admin: SupabaseClient,
  opts: { email?: string; password?: string } = {}
): Promise<{ id: string; email: string }> {
  const email = opts.email ?? `seeded+${Date.now()}@leviticus.test`
  const password = opts.password ?? 'senha-do-teste-e2e'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? 'no user'}`)
  return { id: data.user.id, email }
}

export async function createOrgWithOwner(
  admin: SupabaseClient,
  ownerId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from('organizations').insert({ name, owner_id: ownerId }).select('id, name').single()
  if (error || !data) throw new Error(`createOrgWithOwner: ${error?.message}`)
  // organization_members row must exist for membership queries to resolve.
  await admin.from('organization_members').insert({ user_id: ownerId, org_id: data.id })
  return data
}

export async function createInviteCode(
  admin: SupabaseClient,
  args: { orgId: string; createdBy: string; code: string; label?: string | null; expiresAt?: string | null }
): Promise<void> {
  const { error } = await admin.from('org_invite_codes').insert({
    org_id: args.orgId,
    code: args.code.toUpperCase(),
    created_by: args.createdBy,
    label: args.label ?? null,
    expires_at: args.expiresAt ?? null,
    is_active: true,
  })
  if (error) throw new Error(`createInviteCode: ${error.message}`)
}
```

### `e2e/helpers/app.ts` addition

```ts
/**
 * Stubs `window.confirm` in the running app to return `returnValue` without
 * showing a native dialog. Use before clicking buttons that gate destructive
 * actions on `confirm()` — WebDriver against wry can't reliably accept
 * native alerts.
 */
export async function stubConfirm(returnValue: boolean): Promise<void> {
  await browser.execute((v) => { window.confirm = () => v }, returnValue)
}
```

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/02-org-invites.spec.ts` | CREATE |
| `apps/desktop/e2e/helpers/supabase.ts` | MODIFY — add `createTestUser`, `createOrgWithOwner`, `createInviteCode` |
| `apps/desktop/e2e/helpers/app.ts` | MODIFY — add `stubConfirm` |

No CI changes needed. The new spec file is picked up by `specs/**/*.spec.ts` glob in `wdio.conf.ts`. CI runs all specs automatically.

---

## Cross-cutting decisions

- **Setup strategy: SQL admin seed for the "join" test.** Avoids logging out actor A from the WebView — a known fragile operation. The flow under test (`create_invite_code` RPC + DB writes from join handler) is exercised; only actor A's UI ceremony is bypassed.
- **Direct INSERT vs. `create_invite_code` RPC for seeding.** The RPC requires `auth.uid()` to be the caller. Service-role client doesn't have an `auth.uid()`. INSERT directly to `org_invite_codes` bypasses RLS, which is the cleanest path. We're not testing the RPC's permission check here (covered indirectly by Test 1, which uses the RPC via UI).
- **Why a single `it()` per test instead of multiple smaller ones?** The setup cost (signup via UI) is high — ~5-10s for each app boot + signup. Two `it()` blocks share the cost across two journeys instead of fragmenting into 4-5 smaller ones.

---

## Risks

- **WebKit `window.confirm` behavior.** If `stubConfirm` somehow doesn't apply before the click handler fires, the test will hang on a native dialog. Mitigation: stub runs in `browser.execute` (sync execution in the page context) before the next user action; race window is null.
- **OrgInvites list re-render timing.** `OrgInvites` calls `syncOrg(orgId)` inside `handleCreate` of the modal, and only after `await syncOrg` does it refresh the list. If syncOrg takes longer than the wait, the code never appears. Mitigation: timeout for "code appears in list" set to 30s. If we see stalls similar to Journey #1's redirect issue, fall back to SQL polling for the code's existence.
- **OrgSelect `handleJoin` timing.** Same kind of post-write `syncOrg` happens here. Test 2 uses SQL polling for the membership row to avoid coupling the test to UI navigation.

---

## Out of scope (re-stated)

- Copy-to-clipboard.
- Expired-code rejection.
- Two-user-in-single-test via UI logout.
- UI assertions on the Convites panel beyond verifying the code appears in the list. SQL is the source of truth.
