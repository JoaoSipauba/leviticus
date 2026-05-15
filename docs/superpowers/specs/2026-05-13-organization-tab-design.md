# Organization Tab Design

## Goal

Promote the placeholder `/manage` page ([apps/desktop/src/pages/OrgManage.tsx](apps/desktop/src/pages/OrgManage.tsx)) into a fully functional "Organização" tab in the desktop app. Today the org-level entity exposes itself through the schema (`organizations`, `organization_members`, `org_invite_codes`, `roles`, `role_permissions`, `user_role_assignments`) but nothing in the UI lets users manage any of it. Members are added by raw SQL invites, every member is implicitly an admin, and there's no way to leave or rename the org from the app.

The tab is the home for everything that belongs to "the organization as an entity" — distinct from "Ministérios" (manages `groups`) and "Cultos" (manages `playlists`).

---

## Scope (v1)

Five sub-tabs in a horizontal tab bar, in this order:

1. **Informações** — org metadata, edit form, totals.
2. **Membros** — list, search, filter, manage roles & ministries, remove.
3. **Convites** — generate, list, copy, revoke invite codes.
4. **Papéis** — CRUD roles and permission toggles.
5. **Configurações** — destructive actions ("danger zone"): transfer ownership, leave, delete.

The Sidebar gets the "Organização" link re-enabled (currently commented out at [Sidebar.tsx:33](apps/desktop/src/components/Sidebar.tsx#L33)). Default sub-tab when navigating to `/manage` is **Membros**.

---

## Sub-tab specs

### 1. Informações

**Top:** 3 stat cards (Membros / Ministérios / Cultos cadastrados) with the same gradient-icon style used in the [Groups page](apps/desktop/src/pages/Groups.tsx).

**Body card:**
- Large org avatar (64×64, brand gradient) + name + "Criada em DD MMM YYYY · ID: a4f2…b9c1" (short hash).
- Editable fields: org name (required), city (free text, optional), timezone (free text, default `America/Sao_Paulo`).
- Save button disabled until something changes; Cancel reverts.

**Data:** reads from `organizations` table. City and timezone are new fields (see Schema changes below).

**Permission:** only members with `manage_members` can edit. Others see read-only fields.

---

### 2. Membros

**Toolbar:** search input (matches name + email, debounced 150ms), role filter dropdown, ministry filter dropdown, "Convidar" button (navigates user to Convites sub-tab and opens the "Novo código" modal).

**List:** flat table (grid layout) with columns: Membro (avatar+name+email) · Papel · Ministérios · Entrou em · ⋯

- **Avatar:** initials on a gradient picked by hash of `user_id` (reuse palette from `Groups.tsx`).
- **Papel tag:** colored pill. "Dono" is amber and is the only seeded role. All user-created roles use a neutral pill. Members without any role assignment show a dashed-border "Sem papel" pill (subtle, signals the owner that this member is waiting for a role to be assigned).
- **Ministérios:** chips, showing first 2 + `+N more`. Hover shows full list.
- **"você" badge** on the row of the currently authenticated user.

**Sort:** Dono pinned at top, then alphabetic by name. No manual sort in v1.

**Empty state:** "Você é o único membro. Convide outros pela aba Convites."

**Row menu (⋯)** — see [Member row menu](#member-row-menu) below.

---

### 3. Convites

**Header strip:** copy text "Compartilhe um código pra novos membros entrarem na organização." + "Novo código" button (right).

**"Novo código" modal:** name (optional, free-text label that only the creator sees — e.g. "Pro pessoal do louvor"), expiration (radio: 24h / 7 dias / 30 dias / nunca), Gerar button.

- Code is generated client-side: 12 char base32 (no I/O/0/1 to avoid confusion) — e.g. `VIDANOVA4F2B`. Uniqueness enforced by DB UNIQUE constraint; on collision retry once.
- The optional name is stored in a new `label` column on `org_invite_codes` (see Schema changes).

**List rows:** code (mono, in blue pill, with copy button) · "Criado por X · expira em Y" · status pill (Ativo / Expirado) · Revogar button.

- "Copy" copies just the code (uppercase). Toast "Código copiado".
- "Revogar" sets `is_active = false`. Confirmation: simple `confirm()` modal "Revogar este código?" (matches the app's existing pattern for non-destructive irreversible actions).
- Expired codes show grayed-out with disabled Revogar.

**Permission:** only `manage_members` sees this sub-tab. Others see it hidden from the tab bar entirely.

---

### 4. Papéis

**Layout:** split view — left column is the role list, right column is the detail panel for the selected role.

**Left column (role list, ~280px):**
- Each item: role name + "X membros" subtitle.
- Selected item highlighted with brand-bg + blue border.
- "Dono" is shown but marked non-editable (lock icon, "1 membro · não editável").
- Last item: "Novo papel" with `+` icon.

**Right column (detail panel):**
- Header: role name + "X membros com este papel" + Renomear button.
- Permissions grouped into 3 sections, each with a small uppercase label and a list of toggles:
  - **Músicas:** `add_songs`, `manage_songs`
  - **Cultos e ministérios:** `manage_groups`, `manage_playlists`, `add_songs_to_playlist`
  - **Organização:** `manage_members`, `manage_roles`
- Each toggle row: title + one-line description + iOS-style toggle. Changes save on toggle (debounced 400ms, no Save button) with optimistic UI + revert-on-error.

**Seeded roles:** only "Dono" is created automatically when an organization is created (via SQL trigger, see Schema changes). It has all 7 permissions and is non-editable / non-deletable. The owner of the org is assigned to it. Every other role is opt-in — created by the user on the Papéis sub-tab.

**Empty state** (a brand new org has only Dono and no other roles): the role list shows "Dono · 1 membro · não editável" plus the "+ Novo papel" button. The right detail panel, when "Dono" is selected, shows the permissions list as read-only (all toggles on, all disabled, with a small note "Dono tem todas as permissões e não pode ser editado."). If the user clicks "+ Novo papel", a small modal asks for the name; the new role is created with all toggles off, then opens in the detail panel for permissions to be turned on.

**Important note on scope:** this sub-tab manages the definition of roles. **Wiring the actual permission checks into the app's existing actions** (the "+ Novo" button in Ministérios, "Adicionar música" button, edit/delete on songs, etc.) is intentionally out of scope for this spec and tracked as a separate follow-up. v1 ships with role definitions visible but enforcement remaining permissive (anyone can do anything, same as today). This avoids coupling a UI feature to a app-wide refactor of every mutation.

**Permission:** only `manage_roles` sees this sub-tab.

---

### 5. Configurações (danger zone)

Three vertically stacked cards:

1. **Transferir propriedade** (neutral border). "Passar o título de 'Dono' pra outro membro. Você continua como membro da organização (sem papel — o novo dono pode te atribuir um)." Button "Transferir…" opens modal with member picker + confirmation. Only visible if current user is the owner. The RPC moves the "Dono" role assignment from the old owner to the new one and updates `organizations.owner_id` in one transaction.

2. **Sair da organização** (neutral border). "Você perderá acesso à biblioteca, ministérios e cultos desta organização. O dono não pode sair — precisa transferir antes." Button "Sair" opens confirmation modal. Hidden for the owner (replaced with an inline notice: "Transfira a propriedade pra poder sair.").

3. **Deletar organização** (red border). "Apaga permanentemente todas as músicas, ministérios, cultos e membros. Esta ação não pode ser desfeita." Button "Deletar…" opens a "type-to-confirm" modal — the user must type the exact org name to enable the final red button. Only visible to the owner.

---

## Member row menu

The `⋯` menu on a member row varies by the relationship between viewer and target. Three cases cover all combinations:

### Case A — viewer has `manage_members`, target is a regular member

```
Alterar papel…
Gerenciar ministérios…
─────
Copiar e-mail
─────
Remover da organização     (danger, red)
```

- **Alterar papel** — opens small modal with radio list of roles created by the org. "Dono" is shown but not selectable (use "Transferir propriedade" instead). An additional "Sem papel" option un-assigns the current role. **Empty state** (only Dono exists, no custom roles): the modal shows a friendly message "Você ainda não criou nenhum papel. [Criar papel agora]" — the link navigates to the Papéis sub-tab.
- **Gerenciar ministérios** — opens modal with checkbox list of org ministries. Apply on Save. Inserts/deletes `user_role_assignments` rows scoped by `group_id`.
- **Copiar e-mail** — fires immediately, no modal, toast "E-mail copiado".
- **Remover da organização** — confirmation modal "Remover Maria Rocha? Ela perde acesso a todas as músicas, ministérios e cultos." Deletes the `organization_members` row (cascades remove all `user_role_assignments` for this user+org).

### Case B — viewer has `manage_members`, target is the owner

```
Ver ministérios
Copiar e-mail
─────
Remover · só após transferência  (disabled, with tooltip)
```

The owner is always read-only from another member's perspective. "Remover" is shown disabled rather than hidden so the constraint is discoverable.

### Case C — viewer is looking at themselves

```
Copiar e-mail
─────
Sair da organização     (danger, red)
```

If the viewer is the owner, the "Sair" item is replaced with a single disabled note "Transfira a propriedade pra poder sair." linking to the Configurações sub-tab.

**Menu visibility rule:** members who lack `manage_members` only see the `⋯` on their own row (with the "Sair" option). On other rows, the icon doesn't render at all.

---

## Schema changes

### New columns

**`organizations`** — add 2 nullable text columns:
```sql
ALTER TABLE organizations
  ADD COLUMN city text,
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo';
```

Both nullable / defaulted to keep the migration additive and back-compat (per [migrations checklist](../../../CLAUDE.md#migrations-checklist)).

**`org_invite_codes`** — add `label`:
```sql
ALTER TABLE org_invite_codes
  ADD COLUMN label text;
```

### New trigger: seed owner role

When a row is inserted into `organizations`, automatically create a single "Dono" role with all 7 permissions, then assign it to the org's `owner_id` via `user_role_assignments`. No other roles are seeded — users create the rest on demand from the Papéis sub-tab.

```sql
CREATE OR REPLACE FUNCTION seed_owner_role() RETURNS TRIGGER AS $$
DECLARE
  owner_role_id uuid;
BEGIN
  INSERT INTO roles (org_id, name) VALUES (NEW.id, 'Dono') RETURNING id INTO owner_role_id;
  INSERT INTO role_permissions (role_id, permission)
    SELECT owner_role_id, unnest(ARRAY[
      'add_songs','manage_songs','manage_groups','manage_playlists',
      'add_songs_to_playlist','manage_members','manage_roles'
    ]);
  INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (NEW.owner_id, NEW.id, owner_role_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seed_owner_role_trigger
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_owner_role();
```

**Protecting the Dono role:** because the role name "Dono" is meaningful to the app (used to identify ownership, gate the danger zone, etc.), the seeded "Dono" row must not be renamed or deleted from the UI, and its permissions must not be toggled off. The Papéis sub-tab enforces this with a `non_editable` check in the UI; the underlying DB does not prevent it (kept simple — there's no realistic UI path that triggers it).

**Backfill** for existing orgs: same migration file ends with an idempotent backfill — for each existing row in `organizations`, if no "Dono" role exists for that org, create it with all 7 permissions, and ensure `user_role_assignments` has a row connecting the owner to it. Idempotent: a second run of the migration is a no-op. Since v1 keeps enforcement permissive across the rest of the app (per the "Out of scope" note), the backfill mainly pre-stages data for v2.

### New RPCs

To centralize policy & multi-table writes, wrap these operations as Supabase RPCs (consistent with the existing `update_song_rpc`, `delete_song_rpc`, `reorder_playlist_songs_rpc` patterns in the codebase):

- `create_invite_code(p_org_id, p_label, p_expires_at)` — inserts into `org_invite_codes`, returns the code.
- `revoke_invite_code(p_code_id)` — sets `is_active = false`. Checks viewer has `manage_members` for the org.
- `transfer_ownership(p_org_id, p_new_owner_id)` — updates `organizations.owner_id`, rotates the "Dono" role assignment (removes old, adds new). Wrapped in a single transaction.
- `delete_organization(p_org_id)` — soft check that viewer is owner. The cascading `ON DELETE CASCADE` on the schema handles the rest.
- `assign_user_role(p_user_id, p_org_id, p_role_id, p_group_id)` — single function that handles both "alterar papel" (group_id NULL) and "gerenciar ministérios" (group_id set).
- `remove_user_from_org(p_user_id, p_org_id)` — deletes from `organization_members`.

All RPCs verify the caller's permission via `auth.uid()` and the `role_permissions` join — same pattern as existing RPCs.

### SQLite mirror migrations

For each new column (`city`, `timezone`, `label`), add a mirror in [apps/desktop/src-tauri/migrations/](apps/desktop/src-tauri/migrations/) so the local cache stays in sync. RPCs don't need mirroring — they're remote-only.

### Permission helper

A new `src/lib/permissions.ts` module exposes:
```ts
export async function hasPermission(perm: Permission): Promise<boolean>
export function useHasPermission(perm: Permission): boolean   // hook with cache
```

Backed by a single SQLite query that joins `user_role_assignments` → `roles` → `role_permissions` for the current user + org. Cached on the auth store and invalidated on `syncOrg`. v1 callers: gate the Convites and Papéis sub-tabs, and the Member ⋯ menu. Wiring this into other parts of the app is a follow-up (see Out of scope).

---

## Files changed

| File | Action |
|---|---|
| `supabase/migrations/20260513000002_org_settings_columns.sql` | CREATE — city, timezone, invite label |
| `supabase/migrations/20260513000003_seed_owner_role.sql` | CREATE — trigger + backfill |
| `supabase/migrations/20260513000004_org_rpcs.sql` | CREATE — the 6 RPCs |
| `apps/desktop/src-tauri/migrations/005_org_settings_columns.sql` | CREATE — mirror |
| `apps/desktop/src/pages/OrgManage.tsx` | REWRITE — full tab |
| `apps/desktop/src/pages/org/OrgInfo.tsx` | CREATE — sub-tab panel |
| `apps/desktop/src/pages/org/OrgMembers.tsx` | CREATE — sub-tab panel |
| `apps/desktop/src/pages/org/OrgInvites.tsx` | CREATE — sub-tab panel |
| `apps/desktop/src/pages/org/OrgRoles.tsx` | CREATE — sub-tab panel |
| `apps/desktop/src/pages/org/OrgDanger.tsx` | CREATE — sub-tab panel |
| `apps/desktop/src/components/org/MemberRow.tsx` | CREATE — single row with ⋯ menu |
| `apps/desktop/src/components/org/MemberMenu.tsx` | CREATE — context-aware dropdown |
| `apps/desktop/src/components/org/InviteCodeModal.tsx` | CREATE — new code modal |
| `apps/desktop/src/components/org/ChangeRoleModal.tsx` | CREATE |
| `apps/desktop/src/components/org/ManageMinistriesModal.tsx` | CREATE |
| `apps/desktop/src/components/org/RemoveMemberModal.tsx` | CREATE — confirm modal |
| `apps/desktop/src/components/org/TransferOwnershipModal.tsx` | CREATE |
| `apps/desktop/src/components/org/DeleteOrgModal.tsx` | CREATE — type-to-confirm |
| `apps/desktop/src/lib/permissions.ts` | CREATE — perm helpers |
| `apps/desktop/src/lib/sync.ts` | MODIFY — add city, timezone, label, roles, role_permissions, user_role_assignments, org_invite_codes pull |
| `apps/desktop/src/components/Sidebar.tsx` | MODIFY — un-comment the Organização link |
| `packages/core/src/types/` | MODIFY — add Role, RolePermission, OrgMember, InviteCode types |

---

## Data flow

All writes go to Supabase (mostly via RPCs), then trigger `syncOrg(orgId)` which pulls roles, role_permissions, user_role_assignments, org_invite_codes, and updated org metadata into SQLite. UI reads come from SQLite — same dual-DB pattern documented in CLAUDE.md.

`syncOrg` today doesn't pull these tables; this spec adds them. The sync metadata's `last_sync` timestamp gates incremental pulls for tables with `updated_at`; junction tables (`role_permissions`, `user_role_assignments`) are always full-re-fetched (same approach as `song_groups`).

---

## Error handling

Friendly Portuguese messages per [CLAUDE.md error rules](../../../CLAUDE.md#error-messages). Specific cases:

- "Código inválido ou expirado" already in [OrgSelect.tsx](apps/desktop/src/pages/OrgSelect.tsx) — reused for revoke flow.
- "Você não pode remover a si mesmo" — guard before showing the modal.
- "O dono não pode sair da organização" — guard with explicit message.
- "Esse papel ainda tem membros — atribua outro papel primeiro" — when deleting a role with members.
- Network/unknown: "Algo deu errado. Tente novamente."

All raw errors logged to `console.error` first.

---

## Out of scope (explicit)

- **Permission enforcement on existing app actions.** Defining roles ≠ enforcing them. Wiring `hasPermission()` into Library / Ministérios / Cultos buttons is a separate follow-up. v1 ships with role definitions visible but the rest of the app still permissive.
- **Activity log / audit feed.** Tabled to backlog.
- **Plano / cobrança.** Premature.
- **Bulk member actions** (bulk remove, bulk change role).
- **Custom permission per assignment scope** (e.g. "Líder no Louvor, Membro no Infantil"). The schema technically allows it via `group_id` on `user_role_assignments`, but the UI in v1 treats role as org-wide; scoped permissions remain a future enhancement.
- **External invites by email** (instead of code-based). Future.
- **Profile pages / member detail view.** Click on member row does nothing in v1 (the ⋯ menu is the only entry point to per-member actions).
- **Avatar upload.** Org avatar is always the gradient mark; member avatars are always initials.

---

## Open questions (resolved during brainstorming)

- **Sub-tabs vs single scrollable page** → sub-tabs (better as sections grow over time).
- **Sections in v1** → all 5 (user explicitly approved scope including Papéis, despite my initial recommendation to defer it).
- **Default roles** → only "Dono" is seeded automatically. All other roles are user-created from the Papéis sub-tab. (Changed from earlier draft that auto-seeded Admin / Líder / Voluntário.)
- **Member ⋯ menu** → 3 context variants as detailed above.

---

## Risks

- **Role definitions visible but not enforced** is a UX gap that could mislead users into thinking permissions are active. Mitigation: a one-line notice at the top of the Papéis sub-tab clarifying that permissions are being phased in, with no negative wording.
- **Backfilling "Dono" for existing orgs.** Any existing `organizations` row that already has a role named "Dono" (edge case — schema is there but no UI exposes it today, so empirically unlikely) is left as-is. Backfill is fully idempotent.
- **New members joining via invite arrive with no role.** Until the owner assigns one, the member sees only public reads of org content. Since v1 enforcement is permissive across the rest of the app, this doesn't lock them out functionally — but it does signal the owner (via the "Sem papel" pill) to take action.
- **`syncOrg` now pulls 4 new tables** — incremental pull latency on first sync after upgrade. Acceptable since these tables are tiny.
