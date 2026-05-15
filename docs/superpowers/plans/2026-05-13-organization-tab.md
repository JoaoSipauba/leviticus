# Organization Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the placeholder `/manage` page into a fully functional "Organização" tab with 5 sub-tabs: Informações, Membros, Convites, Papéis, Configurações.

**Architecture:** Schema migrations add `city`/`timezone` to `organizations`, `label` to `org_invite_codes`, and a trigger that seeds only the "Dono" role per new org. Six SECURITY DEFINER RPCs centralize multi-table writes (invites, transfer/delete, role assignment, member removal). The desktop app gains a permission helper backed by SQLite, plus 5 panel components driven by a sub-tab router inside `OrgManage.tsx`.

**Tech Stack:** Supabase (PostgreSQL), SQLite via tauri-plugin-sql, React 18, TypeScript, Zustand, lucide-react, vitest.

**Spec:** [docs/superpowers/specs/2026-05-13-organization-tab-design.md](../specs/2026-05-13-organization-tab-design.md)

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260513000002_org_settings_columns.sql` | CREATE |
| `supabase/migrations/20260513000003_seed_owner_role.sql` | CREATE |
| `supabase/migrations/20260513000004_org_rpcs.sql` | CREATE |
| `apps/desktop/src-tauri/migrations/005_org_settings_columns.sql` | CREATE |
| `packages/core/src/types/org.ts` | CREATE |
| `packages/core/src/types/index.ts` | MODIFY — re-export new types |
| `apps/desktop/src/lib/sync.ts` | MODIFY — pull new entities |
| `apps/desktop/src/lib/sync.test.ts` | MODIFY — extend test coverage |
| `apps/desktop/src/lib/permissions.ts` | CREATE |
| `apps/desktop/src/lib/permissions.test.ts` | CREATE |
| `apps/desktop/src/components/Sidebar.tsx` | MODIFY — un-comment Organização |
| `apps/desktop/src/pages/OrgManage.tsx` | REWRITE — tab shell |
| `apps/desktop/src/pages/org/OrgInfo.tsx` | CREATE |
| `apps/desktop/src/pages/org/OrgMembers.tsx` | CREATE |
| `apps/desktop/src/pages/org/OrgInvites.tsx` | CREATE |
| `apps/desktop/src/pages/org/OrgRoles.tsx` | CREATE |
| `apps/desktop/src/pages/org/OrgDanger.tsx` | CREATE |
| `apps/desktop/src/components/org/MemberRow.tsx` | CREATE |
| `apps/desktop/src/components/org/MemberMenu.tsx` | CREATE |
| `apps/desktop/src/components/org/ChangeRoleModal.tsx` | CREATE |
| `apps/desktop/src/components/org/ManageMinistriesModal.tsx` | CREATE |
| `apps/desktop/src/components/org/RemoveMemberModal.tsx` | CREATE |
| `apps/desktop/src/components/org/InviteCodeModal.tsx` | CREATE |
| `apps/desktop/src/components/org/TransferOwnershipModal.tsx` | CREATE |
| `apps/desktop/src/components/org/DeleteOrgModal.tsx` | CREATE |

---

## Task 1: Schema columns — city, timezone, invite label

**Files:**
- Create: `supabase/migrations/20260513000002_org_settings_columns.sql`
- Create: `apps/desktop/src-tauri/migrations/005_org_settings_columns.sql`

- [ ] **Step 1: Create the Supabase migration**

```sql
-- supabase/migrations/20260513000002_org_settings_columns.sql
ALTER TABLE organizations
  ADD COLUMN city text,
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE org_invite_codes
  ADD COLUMN label text;
```

- [ ] **Step 2: Create the SQLite mirror migration**

```sql
-- apps/desktop/src-tauri/migrations/005_org_settings_columns.sql
ALTER TABLE orgs ADD COLUMN city TEXT;
ALTER TABLE orgs ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE TABLE IF NOT EXISTS org_invite_codes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by TEXT NOT NULL,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  group_id TEXT
);

CREATE TABLE IF NOT EXISTS organization_members (
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_org ON user_role_assignments(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_org_invite_codes_org_id ON org_invite_codes(org_id);
```

(This migration also creates the local mirror tables for the org-side entities, which weren't in `001_local_schema.sql` because nothing read them before.)

- [ ] **Step 3: Apply Supabase migration locally**

```bash
supabase migration up
```

Expected: `Applying migration 20260513000002_org_settings_columns.sql... done`. If `supabase` is not running, start it first with `supabase start`.

- [ ] **Step 4: Verify columns**

```bash
supabase db diff --local
```

Expected: no pending diff.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260513000002_org_settings_columns.sql \
        apps/desktop/src-tauri/migrations/005_org_settings_columns.sql
git commit -m "feat(org): add city, timezone, invite label columns + local mirror"
```

---

## Task 2: Seed owner role trigger + backfill

**Files:**
- Create: `supabase/migrations/20260513000003_seed_owner_role.sql`

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260513000003_seed_owner_role.sql

-- ── trigger: on org insert, create the "Dono" role and assign it to the owner ──
CREATE OR REPLACE FUNCTION seed_owner_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  owner_role_id uuid;
BEGIN
  INSERT INTO roles (org_id, name)
    VALUES (NEW.id, 'Dono')
    RETURNING id INTO owner_role_id;

  INSERT INTO role_permissions (role_id, permission)
    SELECT owner_role_id, unnest(ARRAY[
      'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
      'add_songs_to_playlist', 'manage_members', 'manage_roles'
    ]);

  INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (NEW.owner_id, NEW.id, owner_role_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER seed_owner_role_trigger
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_owner_role();

-- ── idempotent backfill for existing orgs ──
DO $$
DECLARE
  org_row RECORD;
  v_role_id uuid;
BEGIN
  FOR org_row IN SELECT id, owner_id FROM organizations LOOP
    -- Create Dono only if no role named 'Dono' exists for this org
    SELECT id INTO v_role_id FROM roles WHERE org_id = org_row.id AND name = 'Dono' LIMIT 1;

    IF v_role_id IS NULL THEN
      INSERT INTO roles (org_id, name) VALUES (org_row.id, 'Dono') RETURNING id INTO v_role_id;

      INSERT INTO role_permissions (role_id, permission)
        SELECT v_role_id, unnest(ARRAY[
          'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
          'add_songs_to_playlist', 'manage_members', 'manage_roles'
        ]);
    END IF;

    -- Ensure owner is assigned to Dono
    IF NOT EXISTS (
      SELECT 1 FROM user_role_assignments
      WHERE user_id = org_row.owner_id AND org_id = org_row.id AND role_id = v_role_id
    ) THEN
      INSERT INTO user_role_assignments (user_id, org_id, role_id)
        VALUES (org_row.owner_id, org_row.id, v_role_id);
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply locally**

```bash
supabase migration up
```

- [ ] **Step 3: Verify the trigger works**

```bash
supabase db query "SELECT name FROM roles WHERE name = 'Dono' LIMIT 5;"
```

Expected: at least one row "Dono" (from backfill on existing orgs).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513000003_seed_owner_role.sql
git commit -m "feat(org): seed Dono role on org insert + backfill existing orgs"
```

---

## Task 3: TypeScript types

**Files:**
- Create: `packages/core/src/types/org.ts`
- Modify: `packages/core/src/types/index.ts`

- [ ] **Step 1: Locate the existing types index**

```bash
ls packages/core/src/types/
```

Confirm `index.ts` exists; if not, look at `packages/core/src/index.ts` and adjust subsequent steps.

- [ ] **Step 2: Create the org types**

```ts
// packages/core/src/types/org.ts
export type Permission =
  | 'add_songs'
  | 'manage_songs'
  | 'manage_groups'
  | 'manage_playlists'
  | 'add_songs_to_playlist'
  | 'manage_members'
  | 'manage_roles'

export type Organization = {
  id: string
  name: string
  owner_id: string
  city: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export type OrgMember = {
  user_id: string
  org_id: string
  joined_at: string
}

export type Role = {
  id: string
  org_id: string
  name: string
  updated_at: string
}

export type RolePermission = {
  role_id: string
  permission: Permission
}

export type UserRoleAssignment = {
  id: string
  user_id: string
  org_id: string
  role_id: string
  group_id: string | null
}

export type InviteCode = {
  id: string
  org_id: string
  code: string
  label: string | null
  created_by: string
  expires_at: string | null
  is_active: boolean
}
```

- [ ] **Step 3: Re-export from the types index**

Open `packages/core/src/types/index.ts` (or `packages/core/src/index.ts` if that's the entry). Add:

```ts
export * from './org.js'
```

- [ ] **Step 4: Build core**

```bash
cd packages/core && pnpm build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types/
git commit -m "feat(core): add Organization, Role, Permission, InviteCode types"
```

---

## Task 4: Sync — pull new entities

**Files:**
- Modify: `apps/desktop/src/lib/sync.ts`
- Modify: `apps/desktop/src/lib/sync.test.ts`

The current `syncOrg` pulls songs, groups, playlists, song_groups, playlist_songs. We extend it to also pull `organizations` (the one row), `organization_members`, `roles`, `role_permissions`, `user_role_assignments`, and `org_invite_codes`. Junction-ish tables (`role_permissions`, `user_role_assignments`) lack `updated_at` and are wiped + re-inserted per org, same pattern as `playlist_songs`.

- [ ] **Step 1: Add the new SELECTs in parallel**

Open `apps/desktop/src/lib/sync.ts`. After the existing `Promise.all([...])` (around line 11–37), the destructuring should look like this:

```ts
  const [
    songs, groups, playlists, songGroups, playlistSongs,
    org, members, roles, rolePerms, roleAssigns, invites,
  ] = await Promise.all([
    supabase.from('songs').select('id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, song_type, created_at, updated_at').eq('org_id', orgId).gte('updated_at', since),
    supabase.from('groups').select('id, org_id, name, color_index, updated_at').eq('org_id', orgId).gte('updated_at', since),
    supabase.from('playlists').select('id, org_id, name, scheduled_at, scheduled_end, created_at, updated_at').eq('org_id', orgId).gte('updated_at', since),
    supabase.from('song_groups').select('song_id, group_id, songs!inner(org_id)').eq('songs.org_id', orgId),
    supabase.from('playlist_songs').select('playlist_id, section_id, song_id, position, group_id, section_label, playlists!inner(org_id)').eq('playlists.org_id', orgId),
    supabase.from('organizations').select('id, name, owner_id, city, timezone, created_at, updated_at').eq('id', orgId).single(),
    supabase.from('organization_members').select('user_id, org_id, joined_at').eq('org_id', orgId),
    supabase.from('roles').select('id, org_id, name, updated_at').eq('org_id', orgId),
    supabase.from('role_permissions').select('role_id, permission, roles!inner(org_id)').eq('roles.org_id', orgId),
    supabase.from('user_role_assignments').select('id, user_id, org_id, role_id, group_id').eq('org_id', orgId),
    supabase.from('org_invite_codes').select('id, org_id, code, label, created_by, expires_at, is_active').eq('org_id', orgId),
  ])
```

- [ ] **Step 2: Add error checks for the new queries**

Right after the existing error checks (around line 39–43), append:

```ts
  if (org.error) throw new Error(`sync organization failed: ${org.error.message}`)
  if (members.error) throw new Error(`sync organization_members failed: ${members.error.message}`)
  if (roles.error) throw new Error(`sync roles failed: ${roles.error.message}`)
  if (rolePerms.error) throw new Error(`sync role_permissions failed: ${rolePerms.error.message}`)
  if (roleAssigns.error) throw new Error(`sync user_role_assignments failed: ${roleAssigns.error.message}`)
  if (invites.error) throw new Error(`sync org_invite_codes failed: ${invites.error.message}`)
```

- [ ] **Step 3: Add the new INSERT loops at the end of `syncOrg`**

Right before `await setLastSync(orgId, new Date().toISOString())`, add:

```ts
  // organizations (single row, INSERT OR REPLACE)
  if (org.data) {
    const o = org.data
    await db.execute(
      `INSERT OR REPLACE INTO orgs (id, name, owner_id, city, timezone, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [o.id, o.name, o.owner_id, o.city, o.timezone, o.updated_at]
    )
  }

  // organization_members — wipe + re-insert (no updated_at)
  await db.execute(`DELETE FROM organization_members WHERE org_id = ?`, [orgId])
  for (const m of members.data) {
    await db.execute(
      `INSERT INTO organization_members (user_id, org_id, joined_at) VALUES (?, ?, ?)`,
      [m.user_id, m.org_id, m.joined_at]
    )
  }

  // roles — incremental
  for (const r of roles.data) {
    await db.execute(
      `INSERT OR REPLACE INTO roles (id, org_id, name, updated_at) VALUES (?, ?, ?, ?)`,
      [r.id, r.org_id, r.name, r.updated_at]
    )
  }

  // role_permissions — wipe + re-insert per role belonging to this org
  const orgRoleIds = roles.data.map((r) => r.id)
  if (orgRoleIds.length > 0) {
    // SQLite parameter binding doesn't accept arrays; build the IN list manually
    const placeholders = orgRoleIds.map(() => '?').join(',')
    await db.execute(`DELETE FROM role_permissions WHERE role_id IN (${placeholders})`, orgRoleIds)
  }
  for (const rp of rolePerms.data) {
    await db.execute(
      `INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)`,
      [rp.role_id, rp.permission]
    )
  }

  // user_role_assignments — wipe + re-insert (no updated_at)
  await db.execute(`DELETE FROM user_role_assignments WHERE org_id = ?`, [orgId])
  for (const a of roleAssigns.data) {
    await db.execute(
      `INSERT INTO user_role_assignments (id, user_id, org_id, role_id, group_id) VALUES (?, ?, ?, ?, ?)`,
      [a.id, a.user_id, a.org_id, a.role_id, a.group_id]
    )
  }

  // org_invite_codes — incremental-ish (no updated_at on this table, so wipe + re-insert)
  await db.execute(`DELETE FROM org_invite_codes WHERE org_id = ?`, [orgId])
  for (const inv of invites.data) {
    await db.execute(
      `INSERT INTO org_invite_codes (id, org_id, code, label, created_by, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [inv.id, inv.org_id, inv.code, inv.label, inv.created_by, inv.expires_at, inv.is_active ? 1 : 0]
    )
  }
```

- [ ] **Step 4: Extend the sync test**

Open `apps/desktop/src/lib/sync.test.ts`. Find the "calls supabase for each entity type" test (around line 52). Add the new entities to the `expect` block:

```ts
  it('calls supabase for each entity type', async () => {
    const { supabase } = await import('./supabase.js')
    await syncOrg('org-1')
    expect(supabase.from).toHaveBeenCalledWith('songs')
    expect(supabase.from).toHaveBeenCalledWith('groups')
    expect(supabase.from).toHaveBeenCalledWith('playlists')
    expect(supabase.from).toHaveBeenCalledWith('song_groups')
    expect(supabase.from).toHaveBeenCalledWith('playlist_songs')
    expect(supabase.from).toHaveBeenCalledWith('organizations')
    expect(supabase.from).toHaveBeenCalledWith('organization_members')
    expect(supabase.from).toHaveBeenCalledWith('roles')
    expect(supabase.from).toHaveBeenCalledWith('role_permissions')
    expect(supabase.from).toHaveBeenCalledWith('user_role_assignments')
    expect(supabase.from).toHaveBeenCalledWith('org_invite_codes')
  })
```

Also note: the existing `makeChain` factory builds a chainable mock that supports `.select().eq().gte()` and `.select().eq()`. The new `organizations` query ends with `.single()`. Extend `makeChain` so `.single()` resolves to the result too. Replace the existing `makeChain` function with:

```ts
function makeChain(result = { data: [] as any[], error: null as any }) {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockResolvedValue(result)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.eq = vi.fn().mockImplementation(() => {
    const sub: any = {}
    sub.gte = vi.fn().mockResolvedValue(result)
    sub.single = vi.fn().mockResolvedValue(result)
    sub.then = (resolve: any) => Promise.resolve(result).then(resolve)
    sub.catch = (reject: any) => Promise.resolve(result).catch(reject)
    sub.finally = (fn: any) => Promise.resolve(result).finally(fn)
    return sub
  })
  chain.then = (resolve: any) => Promise.resolve(result).then(resolve)
  chain.catch = (reject: any) => Promise.resolve(result).catch(reject)
  chain.finally = (fn: any) => Promise.resolve(result).finally(fn)
  return chain
}
```

- [ ] **Step 5: Run the sync test**

```bash
cd apps/desktop && pnpm vitest run src/lib/sync.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 6: Typecheck**

```bash
cd apps/desktop && pnpm build
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/sync.ts apps/desktop/src/lib/sync.test.ts
git commit -m "feat(sync): pull org, members, roles, permissions, assignments, invites"
```

---

## Task 5: Org RPCs migration

**Files:**
- Create: `supabase/migrations/20260513000004_org_rpcs.sql`

Six RPCs following the project's `SECURITY DEFINER` + `RETURNS jsonb` envelope pattern (see [supabase/migrations/20260508100002_playlist_rpcs.sql](../../../supabase/migrations/20260508100002_playlist_rpcs.sql) for the established style). All gated by `is_org_owner` or `has_permission` from `20260506000002_rls_helpers.sql`.

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260513000004_org_rpcs.sql

-- ── create_invite_code ─────────────────────────────────────────────────────
-- Generates a 12-char base32 code (no I/O/0/1) and inserts. Retries once on
-- UNIQUE conflict — vanishingly unlikely twice.
CREATE OR REPLACE FUNCTION create_invite_code(
  p_org_id     uuid,
  p_label      text,
  p_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
  v_id   uuid;
  v_attempt int := 0;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF NOT has_permission(p_org_id, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  LOOP
    v_code := '';
    FOR i IN 1..12 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO org_invite_codes (org_id, code, label, created_by, expires_at, is_active)
        VALUES (p_org_id, v_code, p_label, v_user, p_expires_at, true)
        RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'code_collision');
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
END;
$$;
GRANT EXECUTE ON FUNCTION create_invite_code(uuid, text, timestamptz) TO authenticated;

-- ── revoke_invite_code ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION revoke_invite_code(p_code_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org  uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT org_id INTO v_org FROM org_invite_codes WHERE id = p_code_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT has_permission(v_org, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  UPDATE org_invite_codes SET is_active = false WHERE id = p_code_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION revoke_invite_code(uuid) TO authenticated;

-- ── transfer_ownership ─────────────────────────────────────────────────────
-- Moves the Dono role assignment from old owner to new owner and updates
-- organizations.owner_id atomically. The previous owner becomes a member
-- with no role until reassigned.
CREATE OR REPLACE FUNCTION transfer_ownership(
  p_org_id       uuid,
  p_new_owner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old_owner uuid;
  v_owner_role_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT owner_id INTO v_old_owner FROM organizations WHERE id = p_org_id;
  IF v_old_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_old_owner <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = p_new_owner_id AND org_id = p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_owner_not_member');
  END IF;

  SELECT id INTO v_owner_role_id FROM roles WHERE org_id = p_org_id AND name = 'Dono' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_owner_role');
  END IF;

  -- Remove Dono from old owner, then assign to new owner.
  DELETE FROM user_role_assignments
    WHERE org_id = p_org_id AND user_id = v_old_owner AND role_id = v_owner_role_id;
  INSERT INTO user_role_assignments (user_id, org_id, role_id)
    VALUES (p_new_owner_id, p_org_id, v_owner_role_id)
    ON CONFLICT DO NOTHING;

  UPDATE organizations SET owner_id = p_new_owner_id WHERE id = p_org_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION transfer_ownership(uuid, uuid) TO authenticated;

-- ── delete_organization ────────────────────────────────────────────────────
-- Only the owner can delete. ON DELETE CASCADE on the schema handles everything else.
CREATE OR REPLACE FUNCTION delete_organization(p_org_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT owner_id INTO v_owner FROM organizations WHERE id = p_org_id;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_owner <> v_user THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  DELETE FROM organizations WHERE id = p_org_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION delete_organization(uuid) TO authenticated;

-- ── assign_user_role ───────────────────────────────────────────────────────
-- p_role_id NULL → unassign role from user (and group_id, if scoped).
-- p_group_id NULL → org-wide role.
-- p_group_id set  → role scoped to a specific ministry.
CREATE OR REPLACE FUNCTION assign_user_role(
  p_user_id  uuid,
  p_org_id   uuid,
  p_role_id  uuid,
  p_group_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF NOT has_permission(p_org_id, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Remove existing org-wide assignment (group_id IS NULL) or specific scope match
  IF p_group_id IS NULL THEN
    DELETE FROM user_role_assignments
      WHERE user_id = p_user_id AND org_id = p_org_id AND group_id IS NULL;
  ELSE
    DELETE FROM user_role_assignments
      WHERE user_id = p_user_id AND org_id = p_org_id AND group_id = p_group_id;
  END IF;

  IF p_role_id IS NOT NULL THEN
    INSERT INTO user_role_assignments (user_id, org_id, role_id, group_id)
      VALUES (p_user_id, p_org_id, p_role_id, p_group_id);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION assign_user_role(uuid, uuid, uuid, uuid) TO authenticated;

-- ── remove_user_from_org ───────────────────────────────────────────────────
-- Cannot remove the owner. Self-removal allowed (becomes "leave org").
CREATE OR REPLACE FUNCTION remove_user_from_org(p_user_id uuid, p_org_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT owner_id INTO v_owner FROM organizations WHERE id = p_org_id;
  IF v_owner = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  END IF;
  IF v_user <> p_user_id AND NOT has_permission(p_org_id, 'manage_members') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM organization_members WHERE user_id = p_user_id AND org_id = p_org_id;
  -- user_role_assignments will cascade via FK ON DELETE CASCADE if defined;
  -- if not, clean up explicitly:
  DELETE FROM user_role_assignments WHERE user_id = p_user_id AND org_id = p_org_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION remove_user_from_org(uuid, uuid) TO authenticated;
```

- [ ] **Step 2: Apply locally**

```bash
supabase migration up
```

Expected: clean apply.

- [ ] **Step 3: Smoke-check the functions exist**

```bash
supabase db query "SELECT proname FROM pg_proc WHERE proname IN ('create_invite_code','revoke_invite_code','transfer_ownership','delete_organization','assign_user_role','remove_user_from_org');"
```

Expected: 6 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513000004_org_rpcs.sql
git commit -m "feat(org): RPCs for invites, ownership transfer, delete, role assignment"
```

---

## Task 6: Permission helper

**Files:**
- Create: `apps/desktop/src/lib/permissions.ts`
- Create: `apps/desktop/src/lib/permissions.test.ts`

A small pure module that joins `user_role_assignments` → `roles` → `role_permissions` from SQLite for the current user + org. No caching in v1; queries are cheap (3 indexed tables, <1KB of data per org).

- [ ] **Step 1: Write a failing test**

```ts
// apps/desktop/src/lib/permissions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasPermission, isOwner } from './permissions.js'

vi.mock('./db.js', () => ({
  getDb: vi.fn(),
}))

vi.mock('./supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
}))

function mockDb(rows: any[]) {
  return { select: vi.fn().mockResolvedValue(rows) }
}

describe('permissions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hasPermission returns true when the row exists', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ cnt: 1 }]) as any)

    const result = await hasPermission('manage_members', 'org-1')
    expect(result).toBe(true)
  })

  it('hasPermission returns false when no rows', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ cnt: 0 }]) as any)

    const result = await hasPermission('manage_members', 'org-1')
    expect(result).toBe(false)
  })

  it('hasPermission returns false when no auth', async () => {
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null } } as any)
    const result = await hasPermission('manage_members', 'org-1')
    expect(result).toBe(false)
  })

  it('isOwner returns true when owner_id matches', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ owner_id: 'u1' }]) as any)
    expect(await isOwner('org-1')).toBe(true)
  })

  it('isOwner returns false when owner_id differs', async () => {
    const { getDb } = await import('./db.js')
    const { supabase } = await import('./supabase.js')
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } } } as any)
    vi.mocked(getDb).mockResolvedValue(mockDb([{ owner_id: 'u2' }]) as any)
    expect(await isOwner('org-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd apps/desktop && pnpm vitest run src/lib/permissions.test.ts
```

Expected: FAIL with "Cannot find module './permissions.js'".

- [ ] **Step 3: Create the module**

```ts
// apps/desktop/src/lib/permissions.ts
import type { Permission } from '@leviticus/core'
import { getDb } from './db.js'
import { supabase } from './supabase.js'

/**
 * Returns true if the current authenticated user has `perm` for `orgId`.
 * Queries the local SQLite cache (populated by syncOrg).
 *
 * v1 callers: only the OrgManage sub-tabs and the member ⋯ menu use this.
 * Permission enforcement on the rest of the app is a future follow-up.
 */
export async function hasPermission(perm: Permission, orgId: string): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false

  const db = await getDb()
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt
     FROM user_role_assignments a
     JOIN role_permissions rp ON rp.role_id = a.role_id
     WHERE a.user_id = ? AND a.org_id = ? AND rp.permission = ?`,
    [data.user.id, orgId, perm]
  )
  return (rows[0]?.cnt ?? 0) > 0
}

/**
 * Returns true if the current user is the org owner. Checked against the
 * `orgs` SQLite table (populated by syncOrg → organizations row).
 */
export async function isOwner(orgId: string): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false
  const db = await getDb()
  const rows = await db.select<{ owner_id: string }[]>(
    `SELECT owner_id FROM orgs WHERE id = ?`,
    [orgId]
  )
  return rows[0]?.owner_id === data.user.id
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd apps/desktop && pnpm vitest run src/lib/permissions.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/permissions.ts apps/desktop/src/lib/permissions.test.ts
git commit -m "feat(org): add hasPermission and isOwner helpers"
```

---

## Task 7: Re-enable Sidebar link + OrgManage shell

**Files:**
- Modify: `apps/desktop/src/components/Sidebar.tsx`
- Rewrite: `apps/desktop/src/pages/OrgManage.tsx`

The shell holds the sub-tab state and renders a placeholder per panel. Each sub-tab panel is filled in by a subsequent task.

- [ ] **Step 1: Un-comment the Sidebar link**

Open `apps/desktop/src/components/Sidebar.tsx`. Find lines 29–34:

```tsx
const links = [
  { to: '/library', label: 'Biblioteca', Icon: Music },
  { to: '/ministries', label: 'Ministérios', Icon: LayoutGrid },
  { to: '/services', label: 'Cultos', Icon: CalendarDays },
  // { to: '/manage', label: 'Organização', Icon: Users }, // ocultado temporariamente — página ainda é um placeholder
]
```

Replace with:

```tsx
const links = [
  { to: '/library', label: 'Biblioteca', Icon: Music },
  { to: '/ministries', label: 'Ministérios', Icon: LayoutGrid },
  { to: '/services', label: 'Cultos', Icon: CalendarDays },
  { to: '/manage', label: 'Organização', Icon: Users },
]
```

Then update the lucide import at line 3:

```tsx
import { Music, LayoutGrid, CalendarDays, LogOut, Home, Users } from 'lucide-react'
```

- [ ] **Step 2: Rewrite OrgManage.tsx as the tab shell**

Open `apps/desktop/src/pages/OrgManage.tsx`. Current:

```tsx
export function OrgManage() { return <div className="p-6">Organização</div> }
```

Replace the entire file with:

```tsx
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info, Users, Mail, Shield, Settings } from 'lucide-react'
import { getDb } from '../lib/db.js'
import { hasPermission } from '../lib/permissions.js'
import { OrgInfo } from './org/OrgInfo.js'
import { OrgMembers } from './org/OrgMembers.js'
import { OrgInvites } from './org/OrgInvites.js'
import { OrgRoles } from './org/OrgRoles.js'
import { OrgDanger } from './org/OrgDanger.js'

type TabKey = 'info' | 'members' | 'invites' | 'roles' | 'danger'

type Tab = {
  key: TabKey
  label: string
  Icon: typeof Info
  requires: 'manage_members' | 'manage_roles' | null
}

const ALL_TABS: Tab[] = [
  { key: 'info',    label: 'Informações',  Icon: Info,     requires: null },
  { key: 'members', label: 'Membros',      Icon: Users,    requires: null },
  { key: 'invites', label: 'Convites',     Icon: Mail,     requires: 'manage_members' },
  { key: 'roles',   label: 'Papéis',       Icon: Shield,   requires: 'manage_roles' },
  { key: 'danger',  label: 'Configurações', Icon: Settings, requires: null },
]

export function OrgManage() {
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = (searchParams.get('tab') as TabKey) ?? 'members'
  const [tab, setTab] = useState<TabKey>(initial)
  const [orgName, setOrgName] = useState<string>('')
  const [allowedKeys, setAllowedKeys] = useState<Set<TabKey>>(new Set(['info', 'members', 'danger']))
  const [memberCount, setMemberCount] = useState<number>(0)
  const [inviteCount, setInviteCount] = useState<number>(0)
  const [roleCount, setRoleCount] = useState<number>(0)

  useEffect(() => {
    async function load() {
      const db = await getDb()
      const orgRows = await db.select<{ name: string }[]>(
        `SELECT name FROM orgs WHERE id = ?`,
        [orgId]
      )
      setOrgName(orgRows[0]?.name ?? '')

      const allowed = new Set<TabKey>(['info', 'members', 'danger'])
      if (await hasPermission('manage_members', orgId)) allowed.add('invites')
      if (await hasPermission('manage_roles', orgId)) allowed.add('roles')
      setAllowedKeys(allowed)

      const counts = await Promise.all([
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM organization_members WHERE org_id = ?`, [orgId]),
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM org_invite_codes WHERE org_id = ? AND is_active = 1`, [orgId]),
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM roles WHERE org_id = ?`, [orgId]),
      ])
      setMemberCount(counts[0][0]?.cnt ?? 0)
      setInviteCount(counts[1][0]?.cnt ?? 0)
      setRoleCount(counts[2][0]?.cnt ?? 0)
    }
    void load()
  }, [orgId])

  function selectTab(k: TabKey) {
    setTab(k)
    setSearchParams({ tab: k }, { replace: true })
  }

  // Hide tabs the user lacks permission for. If the currently-selected tab is
  // not allowed (e.g. arrived via ?tab=invites without permission), fall back
  // to Membros silently.
  const visibleTabs = ALL_TABS.filter((t) => allowedKeys.has(t.key))
  const effectiveTab: TabKey = allowedKeys.has(tab) ? tab : 'members'

  const countFor = (k: TabKey): number | null => {
    if (k === 'members') return memberCount
    if (k === 'invites') return inviteCount
    if (k === 'roles')   return roleCount
    return null
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6">
        <h1 className="text-[22px] font-bold text-heading">Organização</h1>
        <p className="text-[13px] text-muted mt-1">
          Gerencie membros, convites e papéis{orgName ? ` de ${orgName}` : ''}
        </p>
      </div>

      <div className="flex gap-1 px-8 pt-[18px] border-b border-divider">
        {visibleTabs.map(({ key, label, Icon }) => {
          const active = effectiveTab === key
          const count = countFor(key)
          return (
            <button
              key={key}
              onClick={() => selectTab(key)}
              className="flex items-center gap-[7px] px-[14px] py-[10px] text-[13.5px] font-medium transition-colors -mb-px"
              style={{
                background: 'transparent',
                border: 'none',
                color: active ? '#f3f4f6' : '#9ca3af',
                borderBottom: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              <Icon size={14} strokeWidth={2} />
              {label}
              {count !== null && (
                <span
                  className="text-[11px] font-semibold px-[6px] py-[1px] rounded-lg"
                  style={{
                    background: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.08)',
                    color: active ? '#93c5fd' : '#9ca3af',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-7 max-w-[1100px]">
        {effectiveTab === 'info' && <OrgInfo orgId={orgId} />}
        {effectiveTab === 'members' && <OrgMembers orgId={orgId} />}
        {effectiveTab === 'invites' && <OrgInvites orgId={orgId} />}
        {effectiveTab === 'roles' && <OrgRoles orgId={orgId} />}
        {effectiveTab === 'danger' && <OrgDanger orgId={orgId} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create placeholder panels so the build doesn't break**

Subsequent tasks fill these in. For now, each is a single-line component so `pnpm build` succeeds.

```bash
mkdir -p apps/desktop/src/pages/org
```

Then create each file. Repeat this content (changing only `OrgInfo`):

```tsx
// apps/desktop/src/pages/org/OrgInfo.tsx
export function OrgInfo({ orgId }: { orgId: string }) {
  return <div className="text-muted">Informações (placeholder · orgId={orgId})</div>
}
```

```tsx
// apps/desktop/src/pages/org/OrgMembers.tsx
export function OrgMembers({ orgId }: { orgId: string }) {
  return <div className="text-muted">Membros (placeholder · orgId={orgId})</div>
}
```

```tsx
// apps/desktop/src/pages/org/OrgInvites.tsx
export function OrgInvites({ orgId }: { orgId: string }) {
  return <div className="text-muted">Convites (placeholder · orgId={orgId})</div>
}
```

```tsx
// apps/desktop/src/pages/org/OrgRoles.tsx
export function OrgRoles({ orgId }: { orgId: string }) {
  return <div className="text-muted">Papéis (placeholder · orgId={orgId})</div>
}
```

```tsx
// apps/desktop/src/pages/org/OrgDanger.tsx
export function OrgDanger({ orgId }: { orgId: string }) {
  return <div className="text-muted">Configurações (placeholder · orgId={orgId})</div>
}
```

- [ ] **Step 4: Build**

```bash
cd apps/desktop && pnpm build
```

Expected: clean build.

- [ ] **Step 5: Smoke test in dev**

```bash
cd apps/desktop && pnpm tauri dev
```

Click "Organização" in the sidebar. Expected: title + sub-tab bar visible, default tab "Membros" highlighted, panel shows "Membros (placeholder ...)". Clicking other tabs switches panels. Close dev with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/Sidebar.tsx \
        apps/desktop/src/pages/OrgManage.tsx \
        apps/desktop/src/pages/org/
git commit -m "feat(org): re-enable sidebar link + OrgManage tab shell with sub-tabs"
```

---

## Task 8: OrgInfo panel

**Files:**
- Rewrite: `apps/desktop/src/pages/org/OrgInfo.tsx`

Stats cards + editable form. Save uses a direct `supabase.from('organizations').update(...)` followed by `syncOrg`. Edit form is gated by `manage_members`.

- [ ] **Step 1: Replace OrgInfo.tsx**

```tsx
// apps/desktop/src/pages/org/OrgInfo.tsx
import { useEffect, useState } from 'react'
import { Users, LayoutGrid, CalendarDays, Home } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { hasPermission } from '../../lib/permissions.js'

type Stats = { members: number; ministries: number; playlists: number }
type Form = { name: string; city: string; timezone: string }

export function OrgInfo({ orgId }: { orgId: string }) {
  const [stats, setStats] = useState<Stats>({ members: 0, ministries: 0, playlists: 0 })
  const [form, setForm] = useState<Form>({ name: '', city: '', timezone: 'America/Sao_Paulo' })
  const [original, setOriginal] = useState<Form>({ name: '', city: '', timezone: 'America/Sao_Paulo' })
  const [createdAt, setCreatedAt] = useState<string>('')
  const [canEdit, setCanEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const db = await getDb()
    const [orgRows, m, g, p, canEditNow] = await Promise.all([
      db.select<{ name: string; city: string | null; timezone: string; updated_at: string }[]>(
        `SELECT name, city, timezone, updated_at FROM orgs WHERE id = ?`, [orgId]
      ),
      db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM organization_members WHERE org_id = ?`, [orgId]),
      db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM groups WHERE org_id = ?`, [orgId]),
      db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM playlists WHERE org_id = ?`, [orgId]),
      hasPermission('manage_members', orgId),
    ])
    setStats({ members: m[0]?.cnt ?? 0, ministries: g[0]?.cnt ?? 0, playlists: p[0]?.cnt ?? 0 })
    if (orgRows[0]) {
      const f: Form = {
        name: orgRows[0].name,
        city: orgRows[0].city ?? '',
        timezone: orgRows[0].timezone,
      }
      setForm(f); setOriginal(f)
      setCreatedAt(orgRows[0].updated_at)
    }
    setCanEdit(canEditNow)
  }

  useEffect(() => { void load() }, [orgId])

  const dirty = form.name !== original.name || form.city !== original.city || form.timezone !== original.timezone

  async function handleSave() {
    if (!dirty || !canEdit) return
    if (!form.name.trim()) { setError('Nome obrigatório.'); return }
    setSaving(true); setError(null)
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ name: form.name.trim(), city: form.city.trim() || null, timezone: form.timezone.trim() || 'America/Sao_Paulo' })
      .eq('id', orgId)
    if (updateError) {
      console.error(updateError)
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }
    await syncOrg(orgId)
    await load()
    setSaving(false)
  }

  const STAT_CARDS = [
    { label: 'Membros', value: stats.members, bg: 'linear-gradient(135deg,#1e3a8a,#2563eb)', stroke: '#93c5fd', Icon: Users },
    { label: 'Ministérios', value: stats.ministries, bg: 'linear-gradient(135deg,#14532d,#16a34a)', stroke: '#86efac', Icon: LayoutGrid },
    { label: 'Cultos cadastrados', value: stats.playlists, bg: 'linear-gradient(135deg,#4c1d95,#7c3aed)', stroke: '#c4b5fd', Icon: CalendarDays },
  ]

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {STAT_CARDS.map((c) => (
          <div key={c.label} className="rounded-xl p-[16px_18px]" style={{ background: 'linear-gradient(135deg,#13131f,#161625)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-center mb-[10px]" style={{ width: 32, height: 32, borderRadius: 8, background: c.bg }}>
              <c.Icon size={16} stroke={c.stroke} strokeWidth={2} />
            </div>
            <div className="text-[24px] font-bold text-heading leading-none mb-1 tabular-nums">{c.value}</div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#13131f,#161625)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-4 pb-[18px] mb-[18px] border-b border-divider">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 64, height: 64, borderRadius: 14, background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 8px 24px -8px rgba(37,99,235,0.5)' }}>
            <Home size={28} color="#93c5fd" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[18px] font-bold text-heading">{original.name || '—'}</div>
            <div className="text-[12px] text-muted mt-[2px]">ID: {orgId.slice(0, 8)}…{orgId.slice(-4)}</div>
          </div>
        </div>

        <div className="mb-[14px]">
          <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-[6px]">Nome da organização</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            disabled={!canEdit}
            className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-[9px] text-[13.5px] text-heading outline-none focus:border-brand/50 focus:bg-white/[0.06] transition-colors disabled:opacity-60"
          />
        </div>

        <div className="flex gap-3 mb-[14px]">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-[6px]">Cidade (opcional)</label>
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              disabled={!canEdit}
              placeholder="Ex: São Paulo, SP"
              className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-[9px] text-[13.5px] text-heading outline-none focus:border-brand/50 focus:bg-white/[0.06] transition-colors disabled:opacity-60"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-[6px]">Fuso horário</label>
            <input
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              disabled={!canEdit}
              className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-[9px] text-[13.5px] text-heading outline-none focus:border-brand/50 focus:bg-white/[0.06] transition-colors disabled:opacity-60"
            />
          </div>
        </div>

        {error && <p className="text-[13px] text-red-400 mb-2">{error}</p>}

        {canEdit && (
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => setForm(original)}
              disabled={!dirty || saving}
              className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:bg-white/[0.07] hover:text-heading disabled:opacity-40 disabled:cursor-default cursor-pointer"
            >Cancelar</button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-brand text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-default cursor-pointer"
            >{saving ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

Note: if `text-muted` / `border-divider` / `bg-brand` aren't defined in this app's Tailwind config, swap them for the inline-style equivalents used throughout `Sidebar.tsx` (e.g. `color: '#9ca3af'`, `borderColor: 'rgba(255,255,255,0.06)'`, `background: '#2563eb'`). Check by trying to build first.

- [ ] **Step 2: Build**

```bash
cd apps/desktop && pnpm build
```

If errors reference unknown Tailwind tokens, replace those className tokens with inline styles per the note above and rebuild.

- [ ] **Step 3: Manual verification**

```bash
cd apps/desktop && pnpm tauri dev
```

Open the Organização tab, click "Informações". Expected: 3 stat cards on top, form below with current org name pre-filled, "Cancelar"/"Salvar alterações" buttons disabled until you edit a field. Edit the name and click Salvar — toast or silent success, name in the avatar block updates. Close dev.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/pages/org/OrgInfo.tsx
git commit -m "feat(org): OrgInfo panel — stats + editable name/city/timezone"
```

---

## Task 9: OrgMembers panel (list only, no menu actions yet)

**Files:**
- Rewrite: `apps/desktop/src/pages/org/OrgMembers.tsx`
- Create: `apps/desktop/src/components/org/MemberRow.tsx`

Renders the toolbar (search + filters) and the rows. The ⋯ button is present but does nothing yet — Task 10 wires it up.

- [ ] **Step 1: Create MemberRow.tsx**

```tsx
// apps/desktop/src/components/org/MemberRow.tsx
import { MoreVertical } from 'lucide-react'

export type RoleTagKind = 'owner' | 'custom' | 'none'

export type MemberDisplayRow = {
  userId: string
  name: string
  email: string
  roleName: string | null    // null when no role assigned
  roleKind: RoleTagKind
  ministries: string[]
  joinedAt: string           // ISO
  isYou: boolean
}

const AVATAR_BG = [
  'linear-gradient(135deg,#1e3a8a,#2563eb)',
  'linear-gradient(135deg,#14532d,#16a34a)',
  'linear-gradient(135deg,#4c1d95,#7c3aed)',
  'linear-gradient(135deg,#7c2d12,#ea580c)',
  'linear-gradient(135deg,#831843,#db2777)',
  'linear-gradient(135deg,#164e63,#0891b2)',
]

function avatarBg(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]!
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function fmtJoined(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MemberRow({
  row,
  showMenu,
  onMenuClick,
}: {
  row: MemberDisplayRow
  showMenu: boolean
  onMenuClick: (anchor: HTMLElement) => void
}) {
  const tagStyle =
    row.roleKind === 'owner'
      ? { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }
      : row.roleKind === 'custom'
      ? { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }
      : { background: 'transparent', color: '#6b7280', border: '1px dashed rgba(255,255,255,0.12)' }

  return (
    <div
      className="grid items-center gap-4 px-[18px] py-3 border-b border-divider hover:bg-white/[0.02] transition-colors"
      style={{ gridTemplateColumns: '1fr 140px 200px 100px 40px', borderBottomColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-[10px] min-w-0">
        <div
          className="rounded-full flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
          style={{ width: 32, height: 32, background: avatarBg(row.userId) }}
        >{initials(row.name)}</div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-heading truncate">
            {row.name}
            {row.isYou && (
              <span className="ml-[6px] text-[10px] font-semibold px-[5px] py-[1px] rounded align-middle"
                style={{ background: 'rgba(59,130,246,0.18)', color: '#93c5fd' }}>você</span>
            )}
          </div>
          <div className="text-[11.5px] text-muted truncate">{row.email}</div>
        </div>
      </div>

      <div>
        <span className="inline-flex items-center px-[8px] py-[3px] rounded-xl text-[11px] font-semibold" style={tagStyle}>
          {row.roleName ?? 'Sem papel'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {row.ministries.slice(0, 2).map((m) => (
          <span key={m} className="text-[10.5px] px-[7px] py-[2px] rounded-[10px] border" style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af', borderColor: 'rgba(255,255,255,0.08)' }}>{m}</span>
        ))}
        {row.ministries.length > 2 && (
          <span className="text-[10.5px] px-[7px] py-[2px] rounded-[10px] border" style={{ color: '#6b7280', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>+{row.ministries.length - 2}</span>
        )}
      </div>

      <div className="text-[11.5px] text-muted">{fmtJoined(row.joinedAt)}</div>

      <div>
        {showMenu ? (
          <button
            onClick={(e) => onMenuClick(e.currentTarget)}
            className="p-1 rounded text-muted hover:text-heading hover:bg-white/[0.05] cursor-pointer"
          ><MoreVertical size={14} strokeWidth={2} /></button>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace OrgMembers.tsx**

```tsx
// apps/desktop/src/pages/org/OrgMembers.tsx
import { useEffect, useMemo, useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { hasPermission, isOwner } from '../../lib/permissions.js'
import { MemberRow, type MemberDisplayRow } from '../../components/org/MemberRow.js'

type RawRow = {
  user_id: string
  joined_at: string
  role_name: string | null
  ministries: string | null  // comma-separated
  email: string | null
  display_name: string | null
}

export function OrgMembers({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<MemberDisplayRow[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('__all__')
  const [ministryFilter, setMinistryFilter] = useState<string>('__all__')
  const [roleOptions, setRoleOptions] = useState<string[]>([])
  const [ministryOptions, setMinistryOptions] = useState<string[]>([])
  const [me, setMe] = useState<string>('')
  const [canManage, setCanManage] = useState(false)
  const [ownerUserId, setOwnerUserId] = useState<string>('')

  async function load() {
    const db = await getDb()
    const { data: userData } = await supabase.auth.getUser()
    const myId = userData.user?.id ?? ''
    setMe(myId)

    // ownership
    const ownerRows = await db.select<{ owner_id: string }[]>(`SELECT owner_id FROM orgs WHERE id = ?`, [orgId])
    setOwnerUserId(ownerRows[0]?.owner_id ?? '')

    // Members joined with their org-wide role and ministries
    const raw = await db.select<RawRow[]>(
      `SELECT
         om.user_id,
         om.joined_at,
         (SELECT r.name FROM user_role_assignments a
            JOIN roles r ON r.id = a.role_id
            WHERE a.user_id = om.user_id AND a.org_id = om.org_id AND a.group_id IS NULL
            LIMIT 1) as role_name,
         (SELECT GROUP_CONCAT(g.name, ',') FROM user_role_assignments a
            JOIN groups g ON g.id = a.group_id
            WHERE a.user_id = om.user_id AND a.org_id = om.org_id AND a.group_id IS NOT NULL) as ministries,
         NULL as email,
         NULL as display_name
       FROM organization_members om
       WHERE om.org_id = ?
       ORDER BY om.joined_at ASC`,
      [orgId]
    )

    // We don't sync auth.users to SQLite, so fetch display name + email per
    // member from Supabase. Small payload (one query, one batch).
    const userIds = raw.map((r) => r.user_id)
    let userMap = new Map<string, { name: string; email: string }>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds)
      for (const p of profiles ?? []) {
        userMap.set(p.user_id, { name: p.full_name ?? '(sem nome)', email: p.email ?? '' })
      }
    }

    const display: MemberDisplayRow[] = raw.map((r) => {
      const u = userMap.get(r.user_id)
      const name = u?.name ?? r.user_id.slice(0, 8)
      const email = u?.email ?? ''
      const ministries = r.ministries ? r.ministries.split(',').filter(Boolean) : []
      const isOwnerRow = r.user_id === ownerRows[0]?.owner_id
      return {
        userId: r.user_id,
        name,
        email,
        roleName: r.role_name ?? (isOwnerRow ? 'Dono' : null),
        roleKind: isOwnerRow ? 'owner' : r.role_name ? 'custom' : 'none',
        ministries,
        joinedAt: r.joined_at,
        isYou: r.user_id === myId,
      }
    })

    // Sort: Dono first, then alphabetic by name
    display.sort((a, b) => {
      if (a.roleKind === 'owner' && b.roleKind !== 'owner') return -1
      if (b.roleKind === 'owner' && a.roleKind !== 'owner') return 1
      return a.name.localeCompare(b.name, 'pt-BR')
    })

    setRows(display)

    // Filter options
    const distinctRoles = Array.from(new Set(display.map((d) => d.roleName).filter((v): v is string => !!v)))
    setRoleOptions(distinctRoles)
    const distinctMins = Array.from(new Set(display.flatMap((d) => d.ministries)))
    setMinistryOptions(distinctMins)

    // Permissions
    setCanManage(await hasPermission('manage_members', orgId) || await isOwner(orgId))
  }

  useEffect(() => { void load() }, [orgId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false
      if (roleFilter !== '__all__' && r.roleName !== roleFilter) return false
      if (ministryFilter !== '__all__' && !r.ministries.includes(ministryFilter)) return false
      return true
    })
  }, [rows, search, roleFilter, ministryFilter])

  function handleMenuClick(row: MemberDisplayRow, _anchor: HTMLElement) {
    // Wired in Task 10
    console.log('menu click', row.userId)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-[14px]">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-[12px] top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder="Buscar por nome ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg pl-[36px] pr-3 py-[9px] text-[13.5px] text-heading outline-none focus:border-brand/50"
          />
        </div>
        <select
          value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-[9px] text-[13px] text-body cursor-pointer"
        >
          <option value="__all__">Todos os papéis</option>
          <option value="Dono">Dono</option>
          {roleOptions.filter((r) => r !== 'Dono').map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={ministryFilter} onChange={(e) => setMinistryFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-[9px] text-[13px] text-body cursor-pointer"
        >
          <option value="__all__">Todos os ministérios</option>
          {ministryOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {canManage && (
          <a
            href="/manage?tab=invites"
            className="flex items-center gap-[6px] px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer no-underline"
            style={{ background: '#2563eb', boxShadow: '0 4px 12px -4px rgba(37,99,235,0.5)' }}
          ><Plus size={14} strokeWidth={2.5} />Convidar</a>
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="grid gap-4 px-[18px] py-3 border-b text-[10.5px] font-bold uppercase tracking-wider text-muted"
          style={{ gridTemplateColumns: '1fr 140px 200px 100px 40px', borderBottomColor: 'rgba(255,255,255,0.06)' }}>
          <div>Membro</div>
          <div>Papel</div>
          <div>Ministérios</div>
          <div>Entrou em</div>
          <div></div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-muted text-[13px]">
            {rows.length === 0
              ? 'Você é o único membro. Convide outros pela aba Convites.'
              : 'Nenhum membro encontrado com esses filtros.'}
          </div>
        ) : (
          filtered.map((row) => {
            const showMenu = canManage || row.userId === me
            return (
              <MemberRow
                key={row.userId}
                row={row}
                showMenu={showMenu}
                onMenuClick={(a) => handleMenuClick(row, a)}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
```

> **Note on `user_profiles`:** the file references a `user_profiles` table for display name + email. If that view/table doesn't exist in the project, fall back to fetching only the current user's email via `supabase.auth.getUser()` and showing `user_id.slice(0,8)` for everyone else. Before writing this task to disk, run `grep -r 'user_profiles' supabase/` to confirm — if absent, replace the profile fetch with a minimal version showing user IDs only, and open a follow-up to add a profiles view. **Do not skip this check.**

- [ ] **Step 2: Check `user_profiles`**

```bash
grep -r "user_profiles" supabase/ apps/desktop/src/ 2>/dev/null
```

If no results: the panel currently won't show names/emails for other members. Two options:
1. **Fast path:** remove the `user_profiles` query and show `userId.slice(0,8)` as name and `''` as email for non-self rows. This is acceptable for v1 — the spec doesn't require profile names.
2. **Better path (recommended):** add a `user_profiles` Postgres view in a new migration:

```sql
-- supabase/migrations/20260513000005_user_profiles_view.sql
CREATE OR REPLACE VIEW user_profiles
WITH (security_invoker = true) AS
SELECT
  u.id as user_id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as full_name,
  u.email
FROM auth.users u;

GRANT SELECT ON user_profiles TO authenticated;
```

If you take option 2, add the file path to the File Map and apply via `supabase migration up`.

- [ ] **Step 3: Build**

```bash
cd apps/desktop && pnpm build
```

- [ ] **Step 4: Manual verification**

```bash
cd apps/desktop && pnpm tauri dev
```

Open Organização → Membros. Expected: your row visible with "Dono" amber tag and "você" badge. Filters render. Clicking ⋯ logs to console.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/org/MemberRow.tsx \
        apps/desktop/src/pages/org/OrgMembers.tsx
# Plus the user_profiles migration if taken
git commit -m "feat(org): OrgMembers list with search, filters, role tags, ministries"
```

---

## Task 10: Member ⋯ menu and action modals

**Files:**
- Create: `apps/desktop/src/components/org/MemberMenu.tsx`
- Create: `apps/desktop/src/components/org/ChangeRoleModal.tsx`
- Create: `apps/desktop/src/components/org/ManageMinistriesModal.tsx`
- Create: `apps/desktop/src/components/org/RemoveMemberModal.tsx`
- Modify: `apps/desktop/src/pages/org/OrgMembers.tsx` — wire up the menu

Three context variants per the spec ([Member row menu](../specs/2026-05-13-organization-tab-design.md#member-row-menu)): admin-on-member, admin-on-owner (disabled remove), self-view. Each menu item opens its dedicated modal.

- [ ] **Step 1: Create MemberMenu.tsx**

```tsx
// apps/desktop/src/components/org/MemberMenu.tsx
import { useEffect, useRef } from 'react'
import { Shield, LayoutGrid, Mail, UserMinus, LogOut, Lock } from 'lucide-react'

export type MenuVariant = 'admin-on-member' | 'admin-on-owner' | 'self'

export type MemberMenuAction = 'change-role' | 'manage-ministries' | 'view-ministries' | 'copy-email' | 'remove' | 'leave'

const ITEMS: Record<MenuVariant, Array<{ kind: 'item' | 'sep' | 'disabled'; action?: MemberMenuAction; label?: string; danger?: boolean; Icon?: typeof Shield }>> = {
  'admin-on-member': [
    { kind: 'item', action: 'change-role',       label: 'Alterar papel…',          Icon: Shield },
    { kind: 'item', action: 'manage-ministries', label: 'Gerenciar ministérios…',  Icon: LayoutGrid },
    { kind: 'sep' },
    { kind: 'item', action: 'copy-email',        label: 'Copiar e-mail',           Icon: Mail },
    { kind: 'sep' },
    { kind: 'item', action: 'remove',            label: 'Remover da organização',  Icon: UserMinus, danger: true },
  ],
  'admin-on-owner': [
    { kind: 'item', action: 'view-ministries',   label: 'Ver ministérios',         Icon: LayoutGrid },
    { kind: 'item', action: 'copy-email',        label: 'Copiar e-mail',           Icon: Mail },
    { kind: 'sep' },
    { kind: 'disabled',                          label: 'Remover · só após transferência', Icon: Lock },
  ],
  'self': [
    { kind: 'item', action: 'copy-email',        label: 'Copiar e-mail',           Icon: Mail },
    { kind: 'sep' },
    { kind: 'item', action: 'leave',             label: 'Sair da organização',     Icon: LogOut, danger: true },
  ],
}

export function MemberMenu({
  variant, anchor, onAction, onClose,
}: {
  variant: MenuVariant
  anchor: HTMLElement
  onAction: (a: MemberMenuAction) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [anchor, onClose])

  const rect = anchor.getBoundingClientRect()
  const top = rect.bottom + 4
  const right = window.innerWidth - rect.right

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-[11px] p-[6px] shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6)]"
      style={{ top, right, background: '#18182a', border: '1px solid rgba(255,255,255,0.1)', minWidth: 240 }}
    >
      {ITEMS[variant].map((it, i) => {
        if (it.kind === 'sep') return <div key={`s${i}`} className="h-px mx-[6px] my-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
        if (it.kind === 'disabled') {
          return (
            <div key={`d${i}`} className="flex items-center gap-[10px] px-[10px] py-2 rounded-[7px] text-[13px]" style={{ color: '#4b5563', cursor: 'not-allowed' }}>
              {it.Icon && <it.Icon size={14} stroke="#4b5563" strokeWidth={2} />}
              <span className="flex-1">{it.label}</span>
            </div>
          )
        }
        return (
          <button
            key={it.action}
            onClick={() => { it.action && onAction(it.action); onClose() }}
            className="flex items-center gap-[10px] px-[10px] py-2 rounded-[7px] text-[13px] w-full text-left cursor-pointer transition-colors"
            style={{ color: it.danger ? '#fca5a5' : '#d1d5db', background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = it.danger ? 'rgba(220,38,38,0.12)' : 'rgba(255,255,255,0.05)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            {it.Icon && <it.Icon size={14} stroke={it.danger ? '#f87171' : '#9ca3af'} strokeWidth={2} />}
            <span className="flex-1">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create ChangeRoleModal.tsx**

```tsx
// apps/desktop/src/components/org/ChangeRoleModal.tsx
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'

type RoleOpt = { id: string; name: string }

export function ChangeRoleModal({
  open, orgId, userId, memberName, currentRoleId, onClose, onSaved,
}: {
  open: boolean
  orgId: string
  userId: string
  memberName: string
  currentRoleId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [roles, setRoles] = useState<RoleOpt[]>([])
  const [pick, setPick] = useState<string | null>(currentRoleId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPick(currentRoleId)
    setError(null)
    void (async () => {
      const db = await getDb()
      // Hide 'Dono' from the selectable list — ownership is moved via "Transferir propriedade".
      const rows = await db.select<RoleOpt[]>(
        `SELECT id, name FROM roles WHERE org_id = ? AND name <> 'Dono' ORDER BY name`,
        [orgId]
      )
      setRoles(rows)
    })()
  }, [open, currentRoleId, orgId])

  async function handleSave() {
    setSaving(true); setError(null)
    const { data, error: rpcError } = await supabase.rpc('assign_user_role', {
      p_user_id: userId, p_org_id: orgId, p_role_id: pick, p_group_id: null,
    })
    if (rpcError || (data && (data as any).ok === false)) {
      console.error(rpcError ?? data)
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }
    await syncOrg(orgId)
    setSaving(false)
    onSaved()
    onClose()
  }

  if (!open) return null
  const emptyState = roles.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="animate-modal-in w-full max-w-md rounded-2xl"
        style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-bold text-heading">Alterar papel de {memberName}</h2>
          <button onClick={onClose} className="text-body hover:text-heading bg-transparent border-0 cursor-pointer"><X size={18} /></button>
        </div>

        <div className="px-5 pb-5">
          {emptyState ? (
            <div className="text-center py-6">
              <p className="text-[13.5px] text-body mb-3">Você ainda não criou nenhum papel.</p>
              <a href="/manage?tab=roles"
                className="inline-block px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white no-underline cursor-pointer"
                style={{ background: '#2563eb' }}>
                Criar papel agora
              </a>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 mb-4">
                <button
                  onClick={() => setPick(null)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-left text-[13.5px]"
                  style={{ background: pick === null ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${pick === null ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`, color: '#d1d5db' }}
                >
                  <span>Sem papel</span>
                </button>
                {roles.map((r) => (
                  <button key={r.id}
                    onClick={() => setPick(r.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-left text-[13.5px] font-semibold"
                    style={{ background: pick === r.id ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${pick === r.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`, color: '#f3f4f6' }}>
                    <span>{r.name}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">Cancelar</button>
                <button onClick={handleSave} disabled={saving || pick === currentRoleId}
                  className="px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{ background: '#2563eb' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ManageMinistriesModal.tsx**

```tsx
// apps/desktop/src/components/org/ManageMinistriesModal.tsx
import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'

type Ministry = { id: string; name: string }

/**
 * Toggles the user's membership in each ministry. Currently uses the
 * "Membro" pseudo-role: a user_role_assignments row with `group_id` set and
 * `role_id` pointing to the org-wide "Dono" role only as a sentinel for
 * presence — wait, that won't work. We need an explicit minimal role here.
 *
 * Simpler approach for v1: a single org-wide role per assignment with group_id
 * set means scope = "this user is in this ministry". The role_id can be the
 * org's "Dono" role only if we want owners to also appear; otherwise we need
 * a placeholder role. To avoid creating an opaque placeholder, this modal
 * INSERTS rows with role_id = the user's current org-wide role (if any), or
 * the Dono role as a last resort, and group_id set. This mirrors how the
 * schema is designed — a "scoped assignment" is what makes you a member of
 * a ministry, regardless of the role_id.
 */
export function ManageMinistriesModal({
  open, orgId, userId, memberName, onClose, onSaved,
}: {
  open: boolean
  orgId: string
  userId: string
  memberName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [available, setAvailable] = useState<Ministry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [original, setOriginal] = useState<Set<string>>(new Set())
  const [defaultRoleId, setDefaultRoleId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void (async () => {
      const db = await getDb()
      const ms = await db.select<Ministry[]>(`SELECT id, name FROM groups WHERE org_id = ? ORDER BY name`, [orgId])
      setAvailable(ms)
      const current = await db.select<{ group_id: string }[]>(
        `SELECT group_id FROM user_role_assignments WHERE user_id = ? AND org_id = ? AND group_id IS NOT NULL`,
        [userId, orgId]
      )
      const initial = new Set(current.map((c) => c.group_id))
      setSelected(initial); setOriginal(new Set(initial))

      // Pick a role_id to attach: user's org-wide role if any, else "Dono".
      const userRole = await db.select<{ role_id: string }[]>(
        `SELECT role_id FROM user_role_assignments WHERE user_id = ? AND org_id = ? AND group_id IS NULL LIMIT 1`,
        [userId, orgId]
      )
      if (userRole[0]) {
        setDefaultRoleId(userRole[0].role_id)
      } else {
        const dono = await db.select<{ id: string }[]>(`SELECT id FROM roles WHERE org_id = ? AND name = 'Dono' LIMIT 1`, [orgId])
        setDefaultRoleId(dono[0]?.id ?? '')
      }
    })()
  }, [open, orgId, userId])

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true); setError(null)
    const toAdd = [...selected].filter((id) => !original.has(id))
    const toRemove = [...original].filter((id) => !selected.has(id))

    for (const groupId of toAdd) {
      const { data, error: e } = await supabase.rpc('assign_user_role', {
        p_user_id: userId, p_org_id: orgId, p_role_id: defaultRoleId, p_group_id: groupId,
      })
      if (e || (data as any)?.ok === false) {
        console.error(e ?? data); setError('Algo deu errado. Tente novamente.'); setSaving(false); return
      }
    }
    for (const groupId of toRemove) {
      const { data, error: e } = await supabase.rpc('assign_user_role', {
        p_user_id: userId, p_org_id: orgId, p_role_id: null, p_group_id: groupId,
      })
      if (e || (data as any)?.ok === false) {
        console.error(e ?? data); setError('Algo deu errado. Tente novamente.'); setSaving(false); return
      }
    }
    await syncOrg(orgId)
    setSaving(false); onSaved(); onClose()
  }

  if (!open) return null
  const dirty = selected.size !== original.size || [...selected].some((id) => !original.has(id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl animate-modal-in"
        style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-bold text-heading">Ministérios de {memberName}</h2>
          <button onClick={onClose} className="text-body hover:text-heading bg-transparent border-0 cursor-pointer"><X size={18} /></button>
        </div>

        <div className="px-5 pb-5">
          {available.length === 0 ? (
            <div className="text-center py-6 text-body text-[13px]">Nenhum ministério criado ainda.</div>
          ) : (
            <div className="space-y-1.5 mb-4">
              {available.map((m) => {
                const on = selected.has(m.id)
                return (
                  <button key={m.id} onClick={() => toggle(m.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-left transition-colors"
                    style={{ background: on ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                    <div className="rounded flex items-center justify-center" style={{ width: 18, height: 18, background: on ? '#2563eb' : 'transparent', border: `1.5px solid ${on ? '#2563eb' : 'rgba(255,255,255,0.2)'}` }}>
                      {on && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                    <span className="text-[13.5px] font-semibold text-heading flex-1">{m.name}</span>
                  </button>
                )
              })}
            </div>
          )}
          {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !dirty}
              className="px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
              style={{ background: '#2563eb' }}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create RemoveMemberModal.tsx**

```tsx
// apps/desktop/src/components/org/RemoveMemberModal.tsx
import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { syncOrg } from '../../lib/sync.js'

export function RemoveMemberModal({
  open, orgId, userId, memberName, mode, onClose, onDone,
}: {
  open: boolean
  orgId: string
  userId: string
  memberName: string
  mode: 'remove' | 'leave'   // copy changes; same RPC
  onClose: () => void
  onDone: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return null

  async function handleConfirm() {
    setPending(true); setError(null)
    const { data, error: e } = await supabase.rpc('remove_user_from_org', {
      p_user_id: userId, p_org_id: orgId,
    })
    if (e || (data as any)?.ok === false) {
      console.error(e ?? data)
      const code = (data as any)?.error
      setError(
        code === 'cannot_remove_owner' ? 'O dono não pode ser removido. Transfira a propriedade primeiro.' :
        code === 'forbidden' ? 'Você não tem permissão pra esta ação.' :
        'Algo deu errado. Tente novamente.'
      )
      setPending(false)
      return
    }
    await syncOrg(orgId)
    setPending(false); onDone(); onClose()
  }

  const title = mode === 'remove' ? `Remover ${memberName}?` : 'Sair da organização?'
  const body = mode === 'remove'
    ? `${memberName} perderá acesso a todas as músicas, ministérios e cultos desta organização.`
    : 'Você perderá acesso a todas as músicas, ministérios e cultos desta organização. Pode voltar via um novo código de convite.'
  const cta = mode === 'remove' ? 'Remover' : 'Sair'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl animate-modal-in"
        style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-bold text-heading flex items-center gap-2">
            <AlertTriangle size={16} color="#f87171" />{title}
          </h2>
          <button onClick={onClose} className="text-body hover:text-heading bg-transparent border-0 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="px-5 pb-5">
          <p className="text-[13.5px] text-body mb-4 leading-relaxed">{body}</p>
          {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">Cancelar</button>
            <button onClick={handleConfirm} disabled={pending}
              className="px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
              style={{ background: '#dc2626' }}>{pending ? 'Aguarde…' : cta}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire the menu into OrgMembers.tsx**

In `apps/desktop/src/pages/org/OrgMembers.tsx`, add state for the menu + modals and rewrite `handleMenuClick` to open the appropriate variant. Add these imports at the top:

```tsx
import { MemberMenu, type MenuVariant, type MemberMenuAction } from '../../components/org/MemberMenu.js'
import { ChangeRoleModal } from '../../components/org/ChangeRoleModal.js'
import { ManageMinistriesModal } from '../../components/org/ManageMinistriesModal.js'
import { RemoveMemberModal } from '../../components/org/RemoveMemberModal.js'
import { getDb } from '../../lib/db.js'   // already imported, this is a check
```

Add new state right after the existing state declarations in the component:

```tsx
  const [menuFor, setMenuFor] = useState<{ row: MemberDisplayRow; anchor: HTMLElement; variant: MenuVariant } | null>(null)
  const [openChangeRole, setOpenChangeRole] = useState<MemberDisplayRow | null>(null)
  const [openManageMin, setOpenManageMin] = useState<MemberDisplayRow | null>(null)
  const [openRemove, setOpenRemove] = useState<{ row: MemberDisplayRow; mode: 'remove' | 'leave' } | null>(null)
```

Replace the `handleMenuClick` function:

```tsx
  function handleMenuClick(row: MemberDisplayRow, anchor: HTMLElement) {
    let variant: MenuVariant
    if (row.userId === me) variant = 'self'
    else if (row.userId === ownerUserId) variant = 'admin-on-owner'
    else variant = 'admin-on-member'
    setMenuFor({ row, anchor, variant })
  }

  async function handleMenuAction(row: MemberDisplayRow, action: MemberMenuAction) {
    if (action === 'copy-email') {
      if (row.email) {
        await navigator.clipboard.writeText(row.email)
      }
      return
    }
    if (action === 'change-role') { setOpenChangeRole(row); return }
    if (action === 'manage-ministries' || action === 'view-ministries') { setOpenManageMin(row); return }
    if (action === 'remove')         { setOpenRemove({ row, mode: 'remove' }); return }
    if (action === 'leave')          { setOpenRemove({ row, mode: 'leave' }); return }
  }
```

Add the menu + modal rendering at the bottom of the return, just before the final closing `</div>`:

```tsx
      {menuFor && (
        <MemberMenu
          variant={menuFor.variant}
          anchor={menuFor.anchor}
          onAction={(a) => handleMenuAction(menuFor.row, a)}
          onClose={() => setMenuFor(null)}
        />
      )}

      {openChangeRole && (
        <ChangeRoleModal
          open={true}
          orgId={orgId}
          userId={openChangeRole.userId}
          memberName={openChangeRole.name}
          currentRoleId={null /* deferred: looked up inside the modal isn't needed since we POST the chosen value */}
          onClose={() => setOpenChangeRole(null)}
          onSaved={() => { void load() }}
        />
      )}

      {openManageMin && (
        <ManageMinistriesModal
          open={true}
          orgId={orgId}
          userId={openManageMin.userId}
          memberName={openManageMin.name}
          onClose={() => setOpenManageMin(null)}
          onSaved={() => { void load() }}
        />
      )}

      {openRemove && (
        <RemoveMemberModal
          open={true}
          orgId={orgId}
          userId={openRemove.row.userId}
          memberName={openRemove.row.name}
          mode={openRemove.mode}
          onClose={() => setOpenRemove(null)}
          onDone={() => { void load() }}
        />
      )}
```

Also remove the `console.log` placeholder inside `handleMenuClick` if it remained.

- [ ] **Step 6: Build**

```bash
cd apps/desktop && pnpm build
```

- [ ] **Step 7: Manual verification**

```bash
cd apps/desktop && pnpm tauri dev
```

On Organização → Membros, click ⋯ on your own row — expect the "self" menu (Copiar e-mail, Sair). For a non-owner member (if any), expect the full admin menu. Copy e-mail should work (paste somewhere to verify). The other actions open their modals — close them with Cancelar; the actual save flows require a second member to truly test.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/components/org/MemberMenu.tsx \
        apps/desktop/src/components/org/ChangeRoleModal.tsx \
        apps/desktop/src/components/org/ManageMinistriesModal.tsx \
        apps/desktop/src/components/org/RemoveMemberModal.tsx \
        apps/desktop/src/pages/org/OrgMembers.tsx
git commit -m "feat(org): member ⋯ menu with change role / ministries / remove modals"
```

---

## Task 11: OrgInvites panel + InviteCodeModal

**Files:**
- Create: `apps/desktop/src/components/org/InviteCodeModal.tsx`
- Rewrite: `apps/desktop/src/pages/org/OrgInvites.tsx`

- [ ] **Step 1: Create InviteCodeModal.tsx**

```tsx
// apps/desktop/src/components/org/InviteCodeModal.tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { syncOrg } from '../../lib/sync.js'

type Expiry = '24h' | '7d' | '30d' | 'never'

const EXPIRY_LABELS: Record<Expiry, string> = {
  '24h': '24 horas',
  '7d': '7 dias',
  '30d': '30 dias',
  'never': 'Nunca',
}

function computeExpiresAt(opt: Expiry): string | null {
  if (opt === 'never') return null
  const ms = opt === '24h' ? 24 * 3600_000 : opt === '7d' ? 7 * 86400_000 : 30 * 86400_000
  return new Date(Date.now() + ms).toISOString()
}

export function InviteCodeModal({
  open, orgId, onClose, onCreated,
}: {
  open: boolean
  orgId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [label, setLabel] = useState('')
  const [expiry, setExpiry] = useState<Expiry>('7d')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setSaving(true); setError(null)
    const { data, error: e } = await supabase.rpc('create_invite_code', {
      p_org_id: orgId, p_label: label.trim() || null, p_expires_at: computeExpiresAt(expiry),
    })
    if (e || (data as any)?.ok === false) {
      console.error(e ?? data)
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }
    await syncOrg(orgId)
    setLabel(''); setExpiry('7d')
    setSaving(false)
    onCreated(); onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl animate-modal-in"
        style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-bold text-heading">Novo código de convite</h2>
          <button onClick={onClose} className="text-body hover:text-heading bg-transparent border-0 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="px-5 pb-5">
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-[6px]">Para quem é? (opcional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Pro pessoal do louvor"
              className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-[9px] text-[13.5px] text-heading outline-none focus:border-brand/50"
              autoFocus
            />
            <p className="text-[11px] text-muted mt-1">Só você vê esse rótulo — ajuda a lembrar pra quem criou.</p>
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-[6px]">Expiração</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(EXPIRY_LABELS) as Expiry[]).map((opt) => {
                const on = expiry === opt
                return (
                  <button key={opt} onClick={() => setExpiry(opt)}
                    className="px-3 py-[9px] rounded-lg text-[13px] font-semibold cursor-pointer transition-colors"
                    style={{ background: on ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)'}`, color: on ? '#eff6ff' : '#d1d5db' }}>
                    {EXPIRY_LABELS[opt]}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">Cancelar</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
              style={{ background: '#2563eb' }}>{saving ? 'Gerando…' : 'Gerar código'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite OrgInvites.tsx**

```tsx
// apps/desktop/src/pages/org/OrgInvites.tsx
import { useEffect, useState } from 'react'
import { Plus, Copy } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { InviteCodeModal } from '../../components/org/InviteCodeModal.js'

type Row = { id: string; code: string; label: string | null; expires_at: string | null; is_active: number; created_by: string }
type DisplayRow = Row & { status: 'active' | 'expired' | 'revoked'; creatorName: string }

function status(r: Row): 'active' | 'expired' | 'revoked' {
  if (!r.is_active) return 'revoked'
  if (r.expires_at && new Date(r.expires_at) < new Date()) return 'expired'
  return 'active'
}

function expiryLabel(r: Row): string {
  if (!r.is_active) return 'revogado'
  if (!r.expires_at) return 'sem expiração'
  const d = new Date(r.expires_at)
  if (d < new Date()) return `expirado em ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const days = Math.ceil((d.getTime() - Date.now()) / 86400_000)
  return days <= 1 ? 'expira em menos de 24h' : `expira em ${days} dias`
}

export function OrgInvites({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [showModal, setShowModal] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const db = await getDb()
    const raw = await db.select<Row[]>(
      `SELECT id, code, label, expires_at, is_active, created_by
       FROM org_invite_codes WHERE org_id = ? ORDER BY is_active DESC, expires_at DESC NULLS LAST`,
      [orgId]
    )
    // Resolve creator names from Supabase user_profiles (or fall back to user_id).
    const creators = Array.from(new Set(raw.map((r) => r.created_by)))
    const nameMap = new Map<string, string>()
    if (creators.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', creators)
      for (const p of profiles ?? []) nameMap.set(p.user_id, p.full_name ?? p.user_id.slice(0, 8))
    }
    setRows(raw.map((r) => ({ ...r, status: status(r), creatorName: nameMap.get(r.created_by) ?? r.created_by.slice(0, 8) })))
  }

  useEffect(() => { void load() }, [orgId])

  async function handleCopy(code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500)
  }

  async function handleRevoke(id: string) {
    if (!window.confirm('Revogar este código? Ninguém mais consegue entrar com ele.')) return
    const { data, error: e } = await supabase.rpc('revoke_invite_code', { p_code_id: id })
    if (e || (data as any)?.ok === false) {
      console.error(e ?? data); setError('Algo deu errado. Tente novamente.'); return
    }
    await syncOrg(orgId)
    await load()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-[14px]">
        <div className="flex-1 text-[13px] text-muted">Compartilhe um código pra novos membros entrarem na organização.</div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-[6px] px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer"
          style={{ background: '#2563eb', boxShadow: '0 4px 12px -4px rgba(37,99,235,0.5)' }}>
          <Plus size={14} strokeWidth={2.5} />Novo código
        </button>
      </div>

      {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}

      <div className="rounded-xl overflow-hidden" style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
        {rows.length === 0 ? (
          <div className="py-10 text-center text-muted text-[13px]">Nenhum código criado ainda.</div>
        ) : rows.map((r) => (
          <div key={r.id}
            className="grid items-center gap-4 px-[18px] py-[14px] border-b"
            style={{ gridTemplateColumns: '220px 1fr 130px 90px', borderBottomColor: 'rgba(255,255,255,0.06)', opacity: r.status === 'active' ? 1 : 0.6 }}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold tracking-wider px-2 py-1 rounded-md"
                style={{ background: 'rgba(59,130,246,0.08)', color: '#f3f4f6', border: '1px solid rgba(59,130,246,0.18)' }}>{r.code}</span>
              {r.status === 'active' && (
                <button onClick={() => handleCopy(r.code)} className="p-1 rounded text-muted hover:text-brand-soft hover:bg-blue-500/10 cursor-pointer bg-transparent border-0">
                  <Copy size={14} />
                </button>
              )}
              {copiedCode === r.code && <span className="text-[10px] text-green-400 font-semibold">copiado</span>}
            </div>

            <div className="text-[12px] text-muted">
              {r.label && <span className="text-body font-medium">{r.label} · </span>}
              criado por <span className="text-body font-medium">{r.creatorName}</span> · {expiryLabel(r)}
            </div>

            <div>
              <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold px-[7px] py-[2px] rounded-[10px]"
                style={r.status === 'active'
                  ? { background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'currentColor' }} />
                {r.status === 'active' ? 'Ativo' : r.status === 'expired' ? 'Expirado' : 'Revogado'}
              </span>
            </div>

            <div>
              <button
                onClick={() => handleRevoke(r.id)}
                disabled={r.status !== 'active'}
                className="px-[10px] py-[6px] rounded-md text-[12px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer disabled:opacity-40 disabled:cursor-default"
              >Revogar</button>
            </div>
          </div>
        ))}
      </div>

      <InviteCodeModal open={showModal} orgId={orgId} onClose={() => setShowModal(false)} onCreated={() => { void load() }} />
    </div>
  )
}
```

- [ ] **Step 3: Build**

```bash
cd apps/desktop && pnpm build
```

- [ ] **Step 4: Manual verification**

```bash
cd apps/desktop && pnpm tauri dev
```

Open Organização → Convites. Empty state appears. Click "Novo código". Modal opens; label optional, pick "7 dias", click "Gerar". Code shows in the list with copy and revoke buttons. Click copy → paste somewhere to verify. Click revoke → confirm dialog, then code shows "Revogado".

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/org/InviteCodeModal.tsx \
        apps/desktop/src/pages/org/OrgInvites.tsx
git commit -m "feat(org): OrgInvites panel — list, generate, copy, revoke codes"
```

---

## Task 12: OrgRoles panel

**Files:**
- Rewrite: `apps/desktop/src/pages/org/OrgRoles.tsx`

Split view: role list (left, ~280px) + permission detail (right). Default selection is the first non-Dono role, or Dono if none. The Dono row is read-only with all toggles forced on and disabled. Toggle changes save on toggle (debounced 400ms).

- [ ] **Step 1: Replace OrgRoles.tsx**

```tsx
// apps/desktop/src/pages/org/OrgRoles.tsx
import { useEffect, useRef, useState } from 'react'
import { Plus, Lock, Pencil, Trash2 } from 'lucide-react'
import type { Permission } from '@leviticus/core'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'

type Role = { id: string; name: string; memberCount: number }
type PermGroup = { title: string; items: Array<{ perm: Permission; label: string; desc: string }> }

const PERM_GROUPS: PermGroup[] = [
  {
    title: 'Músicas',
    items: [
      { perm: 'add_songs', label: 'Adicionar músicas', desc: 'Buscar no YouTube e salvar na biblioteca' },
      { perm: 'manage_songs', label: 'Editar e remover músicas', desc: 'Editar metadados e deletar do acervo' },
    ],
  },
  {
    title: 'Cultos e ministérios',
    items: [
      { perm: 'manage_groups', label: 'Gerenciar ministérios', desc: 'Criar, renomear e remover ministérios' },
      { perm: 'manage_playlists', label: 'Gerenciar cultos', desc: 'Criar e editar cultos da organização' },
      { perm: 'add_songs_to_playlist', label: 'Adicionar músicas a cultos', desc: 'Montar setlist de um culto existente' },
    ],
  },
  {
    title: 'Organização',
    items: [
      { perm: 'manage_members', label: 'Gerenciar membros', desc: 'Convidar, alterar papel e remover' },
      { perm: 'manage_roles', label: 'Gerenciar papéis', desc: 'Criar e editar papéis e permissões' },
    ],
  },
]

const ALL_PERMS = PERM_GROUPS.flatMap((g) => g.items.map((i) => i.perm))

export function OrgRoles({ orgId }: { orgId: string }) {
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [perms, setPerms] = useState<Set<Permission>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)

  async function load() {
    const db = await getDb()
    const r = await db.select<{ id: string; name: string; member_count: number }[]>(
      `SELECT r.id, r.name,
        (SELECT COUNT(*) FROM user_role_assignments a WHERE a.role_id = r.id AND a.group_id IS NULL) as member_count
       FROM roles r WHERE r.org_id = ? ORDER BY CASE WHEN r.name = 'Dono' THEN 1 ELSE 0 END, r.name`,
      [orgId]
    )
    const display = r.map((x) => ({ id: x.id, name: x.name, memberCount: x.member_count }))
    setRoles(display)
    if (!selectedId && display.length > 0) setSelectedId(display[0]!.id)
  }

  async function loadPerms(roleId: string) {
    const db = await getDb()
    const rows = await db.select<{ permission: Permission }[]>(
      `SELECT permission FROM role_permissions WHERE role_id = ?`, [roleId]
    )
    setPerms(new Set(rows.map((p) => p.permission)))
  }

  useEffect(() => { void load() }, [orgId])
  useEffect(() => { if (selectedId) void loadPerms(selectedId) }, [selectedId])

  const selected = roles.find((r) => r.id === selectedId) ?? null
  const isDono = selected?.name === 'Dono'

  async function togglePerm(perm: Permission) {
    if (!selectedId || isDono) return
    const next = new Set(perms)
    if (next.has(perm)) next.delete(perm); else next.add(perm)
    setPerms(next) // optimistic

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const wantOn = next.has(perm)
      if (wantOn) {
        const { error: e } = await supabase.from('role_permissions').insert({ role_id: selectedId, permission: perm })
        if (e && !e.message.includes('duplicate')) {
          console.error(e); setError('Algo deu errado ao salvar.'); await loadPerms(selectedId); return
        }
      } else {
        const { error: e } = await supabase.from('role_permissions').delete().match({ role_id: selectedId, permission: perm })
        if (e) {
          console.error(e); setError('Algo deu errado ao salvar.'); await loadPerms(selectedId); return
        }
      }
      setError(null)
    }, 400) as unknown as number
  }

  async function createRole() {
    if (!newName.trim()) return
    if (newName.trim() === 'Dono') { setError('"Dono" é reservado.'); return }
    const { data, error: e } = await supabase.from('roles').insert({ org_id: orgId, name: newName.trim() }).select().single()
    if (e || !data) { console.error(e); setError('Algo deu errado. Tente novamente.'); return }
    await syncOrg(orgId)
    setShowNew(false); setNewName('')
    setSelectedId(data.id)
    await load()
  }

  async function renameRole() {
    if (!selectedId || isDono || !renameValue.trim()) return
    const { error: e } = await supabase.from('roles').update({ name: renameValue.trim() }).eq('id', selectedId)
    if (e) { console.error(e); setError('Algo deu errado.'); return }
    await syncOrg(orgId)
    setEditingName(false)
    await load()
  }

  async function deleteRole() {
    if (!selectedId || isDono) return
    if (selected && selected.memberCount > 0) {
      setError('Esse papel ainda tem membros — atribua outro papel antes de deletar.')
      return
    }
    if (!window.confirm(`Deletar o papel "${selected?.name}"?`)) return
    const { error: e } = await supabase.from('roles').delete().eq('id', selectedId)
    if (e) { console.error(e); setError('Algo deu errado.'); return }
    await syncOrg(orgId)
    setSelectedId(null)
    await load()
  }

  function permActive(perm: Permission): boolean {
    return isDono ? true : perms.has(perm)
  }

  return (
    <div>
      <div className="mb-4 p-[10px_14px] rounded-lg flex items-start gap-2 text-[12px]"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px dashed rgba(245,158,11,0.25)', color: '#fbbf24', lineHeight: 1.5 }}>
        <span><strong style={{ color: '#fde68a' }}>Em construção:</strong> os papéis e permissões estão sendo definidos aqui, mas a aplicação dos checks no resto do app é progressiva.</span>
      </div>

      {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}

      <div className="grid gap-4" style={{ gridTemplateColumns: '280px 1fr' }}>
        {/* Left: role list */}
        <div className="rounded-xl p-2 h-fit" style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          {roles.map((r) => {
            const sel = r.id === selectedId
            const dono = r.name === 'Dono'
            return (
              <div key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="px-3 py-[10px] rounded-lg cursor-pointer flex items-center justify-between"
                style={{ background: sel ? 'rgba(30,58,138,0.19)' : 'transparent', border: `1px solid ${sel ? 'rgba(59,130,246,0.3)' : 'transparent'}` }}>
                <div>
                  <div className="text-[13.5px] font-semibold text-heading">{r.name}</div>
                  <div className="text-[11px] text-muted mt-[2px]">
                    {r.memberCount} {r.memberCount === 1 ? 'membro' : 'membros'}{dono ? ' · não editável' : ''}
                  </div>
                </div>
                {dono && <Lock size={12} color="#6b7280" />}
              </div>
            )
          })}
          {showNew ? (
            <div className="p-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
                placeholder="Nome do papel"
                onKeyDown={(e) => { if (e.key === 'Enter') void createRole(); if (e.key === 'Escape') { setShowNew(false); setNewName('') } }}
                className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-[13px] text-heading outline-none focus:border-brand/50" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setShowNew(false); setNewName('') }} className="flex-1 px-3 py-[6px] rounded-md text-[12px] bg-white/[0.05] border border-white/[0.08] text-body cursor-pointer">Cancelar</button>
                <button onClick={() => void createRole()} disabled={!newName.trim()} className="flex-1 px-3 py-[6px] rounded-md text-[12px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default" style={{ background: '#2563eb' }}>Criar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNew(true)} className="w-full flex items-center gap-[6px] px-3 py-[10px] rounded-lg cursor-pointer bg-transparent border-0"
              style={{ color: '#3b82f6' }}>
              <Plus size={13} strokeWidth={2.5} />Novo papel
            </button>
          )}
        </div>

        {/* Right: permission detail */}
        <div className="rounded-xl p-5" style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          {selected ? (
            <>
              <div className="flex items-start justify-between pb-4 mb-[18px] border-b" style={{ borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <div>
                  {editingName ? (
                    <div className="flex gap-2 items-center">
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') void renameRole(); if (e.key === 'Escape') setEditingName(false) }}
                        className="bg-white/[0.04] border border-white/[0.12] rounded-md px-2 py-1 text-[15px] text-heading outline-none" />
                      <button onClick={() => void renameRole()} className="text-[12px] text-brand-soft cursor-pointer bg-transparent border-0">salvar</button>
                    </div>
                  ) : (
                    <h3 className="text-[17px] font-bold text-heading m-0">{selected.name}</h3>
                  )}
                  <p className="text-[12px] text-muted mt-[3px]">
                    {selected.memberCount} {selected.memberCount === 1 ? 'membro com este papel' : 'membros com este papel'}
                  </p>
                </div>
                {!isDono && (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingName(true); setRenameValue(selected.name) }}
                      className="flex items-center gap-1 px-[10px] py-[6px] rounded-md text-[12px] bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">
                      <Pencil size={11} />Renomear
                    </button>
                    <button onClick={() => void deleteRole()}
                      className="flex items-center gap-1 px-[10px] py-[6px] rounded-md text-[12px] bg-red-900/20 border border-red-700/30 cursor-pointer"
                      style={{ color: '#fca5a5' }}>
                      <Trash2 size={11} />Deletar
                    </button>
                  </div>
                )}
              </div>

              {isDono && (
                <div className="mb-4 p-[10px_14px] rounded-lg text-[12px]" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', color: '#fbbf24' }}>
                  Dono tem todas as permissões e não pode ser editado.
                </div>
              )}

              {PERM_GROUPS.map((g) => (
                <div key={g.title} className="mb-4">
                  <div className="text-[10.5px] font-bold text-muted uppercase tracking-wider mb-[10px]">{g.title}</div>
                  {g.items.map((it, i) => {
                    const on = permActive(it.perm)
                    return (
                      <div key={it.perm} className="flex items-center justify-between py-[10px]"
                        style={{ borderBottom: i < g.items.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                        <div>
                          <div className="text-[13.5px] font-medium text-heading">{it.label}</div>
                          <div className="text-[11.5px] text-muted mt-[2px]">{it.desc}</div>
                        </div>
                        <button onClick={() => togglePerm(it.perm)} disabled={isDono}
                          className="cursor-pointer disabled:cursor-default" aria-pressed={on}
                          style={{ width: 36, height: 20, background: on ? '#2563eb' : 'rgba(255,255,255,0.08)', borderRadius: 12, position: 'relative', border: 'none', transition: 'background 0.18s', opacity: isDono ? 0.6 : 1 }}>
                          <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.18s' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </>
          ) : (
            <div className="text-center py-10 text-muted text-[13px]">Selecione um papel à esquerda.</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

Note on `ALL_PERMS`: unused intentionally in this file (the constant is here only as a documentation aid). If TypeScript's `noUnusedLocals` flag flags it, prefix with underscore or delete the line.

- [ ] **Step 2: Build**

```bash
cd apps/desktop && pnpm build
```

If you see an error about `ALL_PERMS` unused, delete the line `const ALL_PERMS = ...`.

- [ ] **Step 3: Manual verification**

```bash
cd apps/desktop && pnpm tauri dev
```

Navigate to Organização → Papéis. Expected: "Dono" appears with lock icon, all toggles on, disabled. Click "+ Novo papel", type "Líder", press Enter. New role appears selected with all toggles off. Toggle a few permissions — they save with a slight delay (400ms). Rename and delete buttons work for non-Dono roles. Deleting a role with members shows an error and keeps the role.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/pages/org/OrgRoles.tsx
git commit -m "feat(org): OrgRoles panel — CRUD roles + permission toggles"
```

---

## Task 13: OrgDanger panel + transfer/delete modals

**Files:**
- Create: `apps/desktop/src/components/org/TransferOwnershipModal.tsx`
- Create: `apps/desktop/src/components/org/DeleteOrgModal.tsx`
- Rewrite: `apps/desktop/src/pages/org/OrgDanger.tsx`

- [ ] **Step 1: Create TransferOwnershipModal.tsx**

```tsx
// apps/desktop/src/components/org/TransferOwnershipModal.tsx
import { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'

type Candidate = { user_id: string; name: string; email: string }

export function TransferOwnershipModal({
  open, orgId, onClose, onDone,
}: {
  open: boolean
  orgId: string
  onClose: () => void
  onDone: () => void
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPick(null); setConfirming(false); setError(null)
    void (async () => {
      const db = await getDb()
      const { data: userData } = await supabase.auth.getUser()
      const me = userData.user?.id ?? ''
      const rows = await db.select<{ user_id: string }[]>(
        `SELECT user_id FROM organization_members WHERE org_id = ? AND user_id <> ?`, [orgId, me]
      )
      const ids = rows.map((r) => r.user_id)
      if (ids.length === 0) { setCandidates([]); return }
      const { data: profiles } = await supabase
        .from('user_profiles').select('user_id, full_name, email').in('user_id', ids)
      const map = new Map((profiles ?? []).map((p) => [p.user_id, { name: p.full_name ?? '(sem nome)', email: p.email ?? '' }]))
      setCandidates(ids.map((id) => ({ user_id: id, name: map.get(id)?.name ?? id.slice(0, 8), email: map.get(id)?.email ?? '' })))
    })()
  }, [open, orgId])

  async function handleTransfer() {
    if (!pick) return
    setPending(true); setError(null)
    const { data, error: e } = await supabase.rpc('transfer_ownership', { p_org_id: orgId, p_new_owner_id: pick })
    if (e || (data as any)?.ok === false) {
      console.error(e ?? data); setError('Algo deu errado. Tente novamente.'); setPending(false); return
    }
    await syncOrg(orgId)
    setPending(false); onDone(); onClose()
  }

  if (!open) return null
  const picked = candidates.find((c) => c.user_id === pick)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl animate-modal-in"
        style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-bold text-heading">Transferir propriedade</h2>
          <button onClick={onClose} className="text-body hover:text-heading bg-transparent border-0 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="px-5 pb-5">
          {!confirming ? (
            <>
              <p className="text-[13px] text-body mb-3 leading-relaxed">
                Escolha o novo dono da organização. Após a transferência, você perde o papel "Dono" e passa a ser um membro sem papel — o novo dono pode te atribuir um.
              </p>
              {candidates.length === 0 ? (
                <p className="text-[13px] text-muted py-3">Não há outros membros pra transferir. Convide alguém primeiro.</p>
              ) : (
                <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
                  {candidates.map((c) => (
                    <button key={c.user_id} onClick={() => setPick(c.user_id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-left"
                      style={{ background: pick === c.user_id ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${pick === c.user_id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-heading">{c.name}</div>
                        <div className="text-[11.5px] text-muted truncate">{c.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">Cancelar</button>
                <button onClick={() => setConfirming(true)} disabled={!pick}
                  className="px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{ background: '#2563eb' }}>Continuar</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={18} color="#f87171" className="mt-0.5 flex-shrink-0" />
                <p className="text-[13px] text-body leading-relaxed">
                  Você está prestes a transferir a propriedade de <strong className="text-heading">{picked?.name}</strong>. Esta ação não pode ser desfeita pelo painel — o novo dono é quem decide se devolve.
                </p>
              </div>
              {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirming(false)} className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">Voltar</button>
                <button onClick={handleTransfer} disabled={pending}
                  className="px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  style={{ background: '#dc2626' }}>{pending ? 'Transferindo…' : 'Transferir'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create DeleteOrgModal.tsx**

```tsx
// apps/desktop/src/components/org/DeleteOrgModal.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'

export function DeleteOrgModal({
  open, orgId, orgName, onClose,
}: {
  open: boolean
  orgId: string
  orgName: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return null

  async function handleDelete() {
    setPending(true); setError(null)
    const { data, error: e } = await supabase.rpc('delete_organization', { p_org_id: orgId })
    if (e || (data as any)?.ok === false) {
      console.error(e ?? data); setError('Algo deu errado. Tente novamente.'); setPending(false); return
    }
    localStorage.removeItem('leviticus_org_id')
    setPending(false); onClose()
    navigate('/org', { replace: true })
  }

  const canDelete = typed.trim() === orgName.trim() && !pending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl animate-modal-in"
        style={{ background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(220,38,38,0.3)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-bold flex items-center gap-2" style={{ color: '#fca5a5' }}>
            <AlertTriangle size={16} color="#f87171" />Deletar organização
          </h2>
          <button onClick={onClose} className="text-body hover:text-heading bg-transparent border-0 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="px-5 pb-5">
          <p className="text-[13px] text-body mb-3 leading-relaxed">
            Isso apaga <strong className="text-heading">todas</strong> as músicas, ministérios, cultos e membros desta organização. Não há como desfazer.
          </p>
          <p className="text-[13px] text-body mb-2">
            Pra confirmar, digite o nome da organização abaixo:
          </p>
          <p className="text-[13px] mb-3 font-mono p-2 rounded-md" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)', color: '#fca5a5' }}>{orgName}</p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus
            placeholder="Nome da organização"
            className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-[9px] text-[13.5px] text-heading outline-none focus:border-red-400/50 mb-4" />
          {error && <p className="text-[13px] text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">Cancelar</button>
            <button onClick={handleDelete} disabled={!canDelete}
              className="px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
              style={{ background: '#dc2626' }}>{pending ? 'Deletando…' : 'Deletar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite OrgDanger.tsx**

```tsx
// apps/desktop/src/pages/org/OrgDanger.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDb } from '../../lib/db.js'
import { supabase } from '../../lib/supabase.js'
import { isOwner } from '../../lib/permissions.js'
import { TransferOwnershipModal } from '../../components/org/TransferOwnershipModal.js'
import { DeleteOrgModal } from '../../components/org/DeleteOrgModal.js'
import { RemoveMemberModal } from '../../components/org/RemoveMemberModal.js'

export function OrgDanger({ orgId }: { orgId: string }) {
  const navigate = useNavigate()
  const [owner, setOwner] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [me, setMe] = useState('')
  const [openTransfer, setOpenTransfer] = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [openLeave, setOpenLeave] = useState(false)

  async function load() {
    const db = await getDb()
    const row = await db.select<{ name: string }[]>(`SELECT name FROM orgs WHERE id = ?`, [orgId])
    setOrgName(row[0]?.name ?? '')
    setOwner(await isOwner(orgId))
    const { data: userData } = await supabase.auth.getUser()
    setMe(userData.user?.id ?? '')
  }

  useEffect(() => { void load() }, [orgId])

  function handleLeaveDone() {
    localStorage.removeItem('leviticus_org_id')
    navigate('/org', { replace: true })
  }

  const cardBase = 'rounded-xl p-5 mb-[14px] flex items-start gap-4 justify-between'

  return (
    <div>
      {owner && (
        <div className={cardBase} style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="min-w-0">
            <h4 className="text-[14px] font-bold text-heading m-0 mb-1">Transferir propriedade</h4>
            <p className="text-[12.5px] text-muted m-0 leading-relaxed">
              Passar o título de "Dono" pra outro membro. Você continua na organização sem papel — o novo dono decide o que te atribuir.
            </p>
          </div>
          <button onClick={() => setOpenTransfer(true)}
            className="flex-shrink-0 px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">
            Transferir…
          </button>
        </div>
      )}

      {owner ? (
        <div className={cardBase} style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="min-w-0">
            <h4 className="text-[14px] font-bold text-heading m-0 mb-1">Sair da organização</h4>
            <p className="text-[12.5px] text-muted m-0 leading-relaxed">
              Transfira a propriedade pra outro membro antes de sair.
            </p>
          </div>
        </div>
      ) : (
        <div className={cardBase} style={{ background: '#13131f', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="min-w-0">
            <h4 className="text-[14px] font-bold text-heading m-0 mb-1">Sair da organização</h4>
            <p className="text-[12.5px] text-muted m-0 leading-relaxed">
              Você perderá acesso à biblioteca, ministérios e cultos. Pode voltar via um novo código de convite.
            </p>
          </div>
          <button onClick={() => setOpenLeave(true)}
            className="flex-shrink-0 px-[14px] py-2 rounded-lg text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-body hover:text-heading cursor-pointer">
            Sair
          </button>
        </div>
      )}

      {owner && (
        <div className={cardBase} style={{ background: '#13131f', border: '1px solid rgba(220,38,38,0.35)' }}>
          <div className="min-w-0">
            <h4 className="text-[14px] font-bold m-0 mb-1" style={{ color: '#fca5a5' }}>Deletar organização</h4>
            <p className="text-[12.5px] text-muted m-0 leading-relaxed">
              Apaga permanentemente todas as músicas, ministérios, cultos e membros. <strong style={{ color: '#fca5a5' }}>Esta ação não pode ser desfeita.</strong>
            </p>
          </div>
          <button onClick={() => setOpenDelete(true)}
            className="flex-shrink-0 px-[14px] py-2 rounded-lg text-[13px] font-semibold text-white cursor-pointer"
            style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(220,38,38,0.45)', color: '#fca5a5' }}>
            Deletar…
          </button>
        </div>
      )}

      <TransferOwnershipModal open={openTransfer} orgId={orgId} onClose={() => setOpenTransfer(false)} onDone={() => { void load() }} />
      <DeleteOrgModal open={openDelete} orgId={orgId} orgName={orgName} onClose={() => setOpenDelete(false)} />
      <RemoveMemberModal open={openLeave} orgId={orgId} userId={me} memberName="você" mode="leave" onClose={() => setOpenLeave(false)} onDone={handleLeaveDone} />
    </div>
  )
}
```

- [ ] **Step 4: Build**

```bash
cd apps/desktop && pnpm build
```

- [ ] **Step 5: Manual verification**

```bash
cd apps/desktop && pnpm tauri dev
```

Open Organização → Configurações. Expected (as owner): 3 cards — Transferir, Sair (disabled-style), Deletar. Click "Transferir" — modal opens with member list (or empty state). Click "Deletar…" — type-to-confirm modal opens; button enables only when name matches exactly. Don't actually delete unless you want to start over.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/org/TransferOwnershipModal.tsx \
        apps/desktop/src/components/org/DeleteOrgModal.tsx \
        apps/desktop/src/pages/org/OrgDanger.tsx
git commit -m "feat(org): danger zone — transfer ownership, leave, delete org"
```

---

## Final push

- [ ] **Push to remote**

```bash
git push
```

Open a PR from `dev` if the workflow calls for it (the project ships from `main` via release-it, with `dev` as the staging branch).
