# E2E Journey D — Org Roles Full CRUD Design

## Goal

Complete the OrgRoles coverage with the paths Journey #7 cut: rename, delete (with/without members), and the "Dono" reserved-name guard.

Maps to gap items 16-20 in the audit.

---

## Scope

**In:** 3 tests in `12-org-roles-crud.spec.ts`.

| # | Test | Path | Expected |
|---|---|---|---|
| T1 | Rename role | Create role; click Renomear; type new name; save | SQL row has new name |
| T2 | Delete role without members | Create empty role; click Deletar; confirm | SQL row gone |
| T3 | Delete role WITH members → guard | Create role; assign it to user; try Deletar | Error `"Esse papel ainda tem membros..."`; SQL row still exists |

**Bonus check inside T1**: after rename, verify the user can't rename to "Dono" (reserved-name guard). Add a sub-step or skip — see decisions.

**Out:** Permission toggle changes (already covered in #7), DONO role read-only assertions (touch in #7).

---

## Setup pattern

Outer `before()`:
- `cleanLocalSqlite + signupAndCreateOrg`
- Navigate to /manage?tab=roles (we'll do this in each test for clarity)

For T3, we need to ASSIGN the role to the test user (the owner). We can do this directly via SQL admin:
```ts
await admin.from('user_role_assignments').insert({
  user_id: ownerId, org_id: orgId, role_id: createdRoleId
})
```

This bypasses RLS (service-role) and immediately reflects in the SQL queries the OrgRoles panel uses to compute `memberCount`.

But the UI memberCount might cache. The OrgRoles panel reads via SQLite — we need a syncOrg pull. Trigger by `browser.url('tauri://localhost/manage?tab=roles')` (re-mount) or wait for natural sync.

---

## Test details

### T1 — Rename role + reserved-name guard

```
it:
  - Navigate to /manage?tab=roles
  - Click button*=Novo papel
  - Type 'Test Role T1' in input
  - Click Criar
  - Wait for SQL row to appear, capture role.id
  - Click button=Renomear (in the right detail panel)
  - setReactInputValue on the inline edit input with 'Renamed Role T1'
  - Click button=salvar (lowercase, per OrgRoles inline editor)
  - Poll SQL: name === 'Renamed Role T1'

  // Reserved-name sub-check
  - Click Renomear again
  - Type 'Dono' in the edit input
  - Click salvar
  - Wait for <p style*=red> or toast with "\"Dono\" é reservado"
  - Confirm role name still 'Renamed Role T1' in SQL
```

### T2 — Delete role without members

```
it:
  - Navigate fresh; create 'Test Role T2' via the inline form
  - Click on the role in the left list (should be auto-selected after create)
  - Click button=Deletar (red, in the right detail panel)
  - stubConfirm(true) BEFORE the click (uses window.confirm)
  - Wait for the role to disappear in SQL (poll for ABSENCE)
  - Verify role_permissions also gone (cascade)
```

### T3 — Delete role with members → guard

```
it:
  - Create 'Test Role T3' via UI
  - Via admin client: INSERT user_role_assignments (ownerId, orgId, role.id)
  - Re-navigate to /manage?tab=roles (force re-load to pick up the assignment)
  - Select the role in the left list (if not selected)
  - stubConfirm(true)
  - Click Deletar
  - Wait for <p role="alert" *=red> with "Esse papel ainda tem membros"
  - Verify SQL: role row STILL exists
```

---

## Selectors to verify

- `Renomear` button — confirmed text in `OrgRoles.tsx:217`
- Inline edit "salvar" text — confirmed in `OrgRoles.tsx:208`
- `Deletar` button — confirmed in `OrgRoles.tsx:220`
- Delete confirm uses `window.confirm` — confirmed in `OrgRoles.tsx:130`

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/12-org-roles-crud.spec.ts` | CREATE |

No new helpers.

---

## Risks

- **Inline edit input selector**: the input is rendered conditionally when `editingName=true`. Use a generic `input[value=...]` selector or rely on autofocus.
- **Role auto-selection after create**: `OrgRoles.createRole` sets `selectedId = data.id`. So after Criar, the right panel reflects the new role. Test should NOT need to manually click the left-list item.
- **T3 memberCount cache**: the left-list item shows "X membros" computed by the SQL query in `load()`. The Deletar handler checks `selected.memberCount > 0` — which uses the LOCAL state, not a fresh query. If we INSERT via admin client AFTER `load()` ran, memberCount stays 0 and the delete might succeed. **Mitigation:** call `browser.url(...)` to force re-mount of OrgRoles → re-run `load()` → fresh memberCount.

---

## Out of scope
- Renaming to a name that conflicts with another existing role.
- Permission toggle on the renamed role.
- Deleting the Dono role (blocked at the UI level — no Renomear/Deletar buttons render for it).
