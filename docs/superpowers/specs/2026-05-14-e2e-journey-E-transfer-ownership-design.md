# E2E Journey E — Transfer Ownership Design

## Goal

Cover the `transfer_ownership` RPC end-to-end via the UI. This is the destructive path Journey #8 skipped — transferring ownership is irreversible (without the new owner transferring back), and the flow has a 2-step modal (picker → confirm) that's easy to break.

Maps to gap item 21 in the audit.

---

## Scope

**In:** 1 test in `13-transfer-ownership.spec.ts`.

```
it: owner transfers org ownership to another member
  Setup:
    - signupAndCreateOrg → user A (owner)
    - Seed user B via admin (createTestUser + add to organization_members)
    - Navigate to /manage?tab=danger
  
  Steps:
    - Click button="Transferir…" → modal opens with member picker
    - Click on user B's row in the picker
    - Click "Continuar" → modal switches to confirm step
    - Click "Transferir" (red, second-step submit) → RPC fires
  
  Asserts (SQL):
    - organizations.owner_id === userB.id
    - user_role_assignments: userA NO longer has 'Dono' role for this org
    - user_role_assignments: userB DOES have 'Dono' role for this org
    - organization_members: both userA and userB still members
```

**Out:** "Sair" flow for non-owner (separate journey), Dono auto-revoke edge cases (test in unit migrations), concurrent transfer race (RPC has `FOR UPDATE` lock).

---

## Setup pattern

User A goes through normal `signupAndCreateOrg` (UI). User B is seeded entirely via admin client (no UI signup) — we don't need to log in as B for this test, we just need B to exist as a member of the org.

```ts
before:
  await cleanLocalSqlite()
  const { userId: userAId, orgId, email: userAEmail } = await signupAndCreateOrg()
  
  const admin = makeAdminClient()
  const userB = await createTestUser(admin, { email: `transfer-target+${Date.now()}@leviticus.test` })
  await admin.from('organization_members').insert({ user_id: userB.id, org_id: orgId })
```

User A is the logged-in actor; user B is the transfer target.

---

## Test details

```ts
it('transfers ownership to another member; SQL reflects the swap', async () => {
  await browser.waitUntil(
    async () => /\/library$/.test(await browser.getUrl()),
    { timeout: 60_000 }
  )
  await browser.url('tauri://localhost/manage?tab=danger')
  
  // Step 1: pick the new owner
  await $('button=Transferir…').click()
  
  // Modal renders with a list of members (excluding self). User B is the only one.
  await $(`button*=${userB.email}`).waitForExist({ timeout: 10_000 })
  await $(`button*=${userB.email}`).click()
  
  const continuarBtn = $('button=Continuar')
  await continuarBtn.waitForEnabled({ timeout: 5_000 })
  await continuarBtn.click()
  
  // Step 2: confirm
  const transferirBtn = $('button=Transferir')
  await transferirBtn.waitForExist({ timeout: 5_000 })
  await transferirBtn.click()
  
  // Wait + assert via SQL
  let success = false
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const { data: org } = await admin
      .from('organizations').select('owner_id').eq('id', orgId).single()
    if (org && org.owner_id === userB.id) { success = true; break }
    await new Promise(r => setTimeout(r, 500))
  }
  if (!success) throw new Error('Ownership did not transfer in 15s')
  
  // Verify Dono role swap
  const { data: donoRole } = await admin
    .from('roles').select('id').eq('org_id', orgId).eq('name', 'Dono').single()
  expect(donoRole).toBeTruthy()
  
  const { data: aDono } = await admin
    .from('user_role_assignments')
    .select('user_id').eq('org_id', orgId).eq('role_id', donoRole.id).eq('user_id', userAId)
  expect(aDono ?? []).toHaveLength(0)
  
  const { data: bDono } = await admin
    .from('user_role_assignments')
    .select('user_id').eq('org_id', orgId).eq('role_id', donoRole.id).eq('user_id', userB.id)
  expect(bDono ?? []).toHaveLength(1)
})
```

---

## Selectors to verify

- "Transferir…" trigger button — confirmed in `OrgDanger.tsx:49`
- Member picker rows — need to inspect `TransferOwnershipModal.tsx`. Likely buttons with text including the user's name or email.
- "Continuar" button — first-step submit
- "Transferir" red button — second-step submit (confirm)

If member rows use `<button>` with name only (not email), test should match by name instead. Inspect at impl time.

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/13-transfer-ownership.spec.ts` | CREATE |

No new helpers.

---

## Risks

- **Member picker hydration timing**: TransferOwnershipModal fetches members via Supabase admin / SQLite + `user_profiles` view. The picker won't render user B until both data sources return. If the UI shows a loading state, the test needs to wait for it. Use `waitForExist` with a generous timeout (10s).
- **Picker shows email vs name**: depending on what `user_profiles` returns and how the modal renders, the click selector might need adjustment. Inspect at impl time.

---

## Out of scope
- Transfer to a user who's no longer a member (RPC returns `new_owner_not_member`).
- Self-transfer attempts (UI shouldn't allow — picker excludes self).
- Concurrent transfers (FOR UPDATE lock validation — unit test of the RPC).
