# Permission Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esconder na UI toda ação que o usuário não tem permissão de executar, fechar o gap dos 3 RPCs sem checagem, transformar erro de permissão em mensagem amigável, e remover o banner "Em construção" de Papéis.

**Architecture:** Um store Zustand (`usePermissionsStore`) carrega as permissões do usuário do SQLite local após cada `syncOrg`; o hook `usePermission(perm)` lê isso de forma síncrona. Componentes escondem controles com `{usePermission('x') && <Control/>}`. No backend, uma migration adiciona checagem inline aos RPCs `SECURITY DEFINER` que hoje bypassam o RLS.

**Tech Stack:** React 18, Zustand, TypeScript, Tauri SQLite (`tauri-plugin-sql`), Supabase (Postgres RLS + RPC), Vitest.

**Spec:** [docs/superpowers/specs/2026-05-22-permission-gating-design.md](../specs/2026-05-22-permission-gating-design.md) — issue [#120](https://github.com/JoaoSipauba/leviticus/issues/120).

**Branch:** `feat/permission-gating` (já existe, com o spec commitado).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `apps/desktop/src/store/permissions.ts` | Store Zustand: `perms`, `isOwner`, `refresh`, `clear` + hook `usePermission` (criar) |
| `apps/desktop/src/store/permissions.test.ts` | Testes do store (criar) |
| `apps/desktop/src/lib/permission-error.ts` | `permissionErrorMessage()` — mapeia erro RLS/RPC → pt-BR (criar) |
| `apps/desktop/src/lib/permission-error.test.ts` | Testes do helper (criar) |
| `apps/desktop/src/lib/permissions.ts` | Remover `hasPermission`/`isOwner` async (modificar/deletar) |
| `apps/desktop/src/App.tsx` | Chamar `refresh` no boot após `syncOrg` (modificar) |
| `apps/desktop/src/lib/data-sync.ts` | Chamar `refresh` no tick reativo (modificar) |
| `apps/desktop/src/pages/OrgManage.tsx`, `org/OrgMembers.tsx`, `org/OrgInfo.tsx`, `org/OrgIntegrations.tsx`, `org/OrgDanger.tsx`, `components/AddSongToPlaylistModal.tsx` | Migrar callers async → store (modificar) |
| `supabase/migrations/20260522000003_rpc_permission_checks.sql` | Checagem de permissão nos RPCs (criar) |
| `apps/desktop/src/pages/Library.tsx`, `components/SongCard.tsx`, `pages/Groups.tsx`, `pages/GroupDetail.tsx`, `pages/Playlists.tsx`, `pages/PlaylistDetail.tsx` | Gating de UI (modificar) |
| `apps/desktop/src/pages/org/OrgRoles.tsx` | Remover banner "Em construção" (modificar) |

---

## Task 1: Store de permissões

**Files:**
- Create: `apps/desktop/src/store/permissions.ts`
- Test: `apps/desktop/src/store/permissions.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/store/permissions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeDb = { select: vi.fn() }
vi.mock('../lib/db.js', () => ({ getDb: () => Promise.resolve(fakeDb) }))
vi.mock('./auth.js', () => ({
  useAuthStore: { getState: vi.fn(() => ({ user: { id: 'user-1' } })) },
}))

import { usePermissionsStore } from './permissions.js'

beforeEach(() => {
  fakeDb.select.mockReset()
  usePermissionsStore.getState().clear()
})

describe('usePermissionsStore.refresh', () => {
  it('popula perms e isОwner=false pra membro comum', async () => {
    fakeDb.select
      .mockResolvedValueOnce([{ owner_id: 'someone-else' }]) // orgs
      .mockResolvedValueOnce([{ permission: 'add_songs' }, { permission: 'manage_songs' }])
    await usePermissionsStore.getState().refresh('org-1')
    const s = usePermissionsStore.getState()
    expect(s.isOwner).toBe(false)
    expect(s.perms.has('add_songs')).toBe(true)
    expect(s.perms.has('manage_songs')).toBe(true)
    expect(s.perms.has('manage_roles')).toBe(false)
    expect(s.loaded).toBe(true)
  })

  it('isOwner=true quando o usuário é dono da org', async () => {
    fakeDb.select
      .mockResolvedValueOnce([{ owner_id: 'user-1' }])
      .mockResolvedValueOnce([])
    await usePermissionsStore.getState().refresh('org-1')
    expect(usePermissionsStore.getState().isOwner).toBe(true)
  })

  it('clear zera o estado', async () => {
    fakeDb.select
      .mockResolvedValueOnce([{ owner_id: 'user-1' }])
      .mockResolvedValueOnce([{ permission: 'add_songs' }])
    await usePermissionsStore.getState().refresh('org-1')
    usePermissionsStore.getState().clear()
    const s = usePermissionsStore.getState()
    expect(s.isOwner).toBe(false)
    expect(s.perms.size).toBe(0)
    expect(s.loaded).toBe(false)
  })

  it('sem usuário logado: estado vazio, loaded=true', async () => {
    const { useAuthStore } = await import('./auth.js')
    vi.mocked(useAuthStore.getState).mockReturnValueOnce({ user: null } as never)
    await usePermissionsStore.getState().refresh('org-1')
    const s = usePermissionsStore.getState()
    expect(s.perms.size).toBe(0)
    expect(s.loaded).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar os testes pra confirmar que falham**

Run: `cd apps/desktop && pnpm vitest run src/store/permissions.test.ts`
Expected: FAIL — `Cannot find module './permissions.js'`.

- [ ] **Step 3: Implementar o store**

`apps/desktop/src/store/permissions.ts`:

```ts
import { create } from 'zustand'
import type { Permission } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { useAuthStore } from './auth.js'

type PermissionsState = {
  /** Permissões globais do usuário na org atual. */
  perms: Set<Permission>
  /** true se o usuário é dono da org — owner tem todas as permissões. */
  isOwner: boolean
  /** true após o primeiro refresh resolver. */
  loaded: boolean
  /** Recarrega perms+owner do SQLite local. Chamar após cada syncOrg. */
  refresh: (orgId: string) => Promise<void>
  /** Zera (logout / troca de org). */
  clear: () => void
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  perms: new Set(),
  isOwner: false,
  loaded: false,
  refresh: async (orgId) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId || !orgId) {
      set({ perms: new Set(), isOwner: false, loaded: true })
      return
    }
    const db = await getDb()
    const ownerRows = await db.select<{ owner_id: string }[]>(
      'SELECT owner_id FROM orgs WHERE id = ?',
      [orgId],
    )
    // Só assignments globais (group_id IS NULL) — espelha o has_permission
    // do RLS pra ações globais. Permissão com escopo de grupo é follow-up.
    const permRows = await db.select<{ permission: Permission }[]>(
      `SELECT DISTINCT rp.permission
       FROM user_role_assignments a
       JOIN role_permissions rp ON rp.role_id = a.role_id
       WHERE a.user_id = ? AND a.org_id = ? AND a.group_id IS NULL`,
      [userId, orgId],
    )
    set({
      perms: new Set(permRows.map((r) => r.permission)),
      isOwner: ownerRows[0]?.owner_id === userId,
      loaded: true,
    })
  },
  clear: () => set({ perms: new Set(), isOwner: false, loaded: false }),
}))

/**
 * Hook síncrono: true se o usuário pode executar `perm` (owner sempre pode).
 * Esconder controles com `{usePermission('add_songs') && <Botão/>}`.
 */
export function usePermission(perm: Permission): boolean {
  return usePermissionsStore((s) => s.isOwner || s.perms.has(perm))
}
```

- [ ] **Step 4: Rodar os testes pra confirmar que passam**

Run: `cd apps/desktop && pnpm vitest run src/store/permissions.test.ts`
Expected: PASS — 4 testes verdes.

- [ ] **Step 5: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/store/permissions.ts apps/desktop/src/store/permissions.test.ts
git commit -m "feat: add permissions store with usePermission hook"
```

---

## Task 2: Plugar `refresh` no ciclo de sync

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/lib/data-sync.ts`

- [ ] **Step 1: Importar o store no App.tsx**

Em `apps/desktop/src/App.tsx`, adicionar junto aos outros imports de store:

```ts
import { usePermissionsStore } from './store/permissions.js'
```

- [ ] **Step 2: Chamar `refresh` após o `syncOrg` do boot**

Em `App.tsx`, no `useEffect` de boot, dentro do `.then()` encadeado após `syncOrg(orgId)` — no mesmo lugar onde hoje roda `useIntegrationsStore.getState().refreshAccount(orgId)` após o sync. Adicionar logo após aquela chamada de `refreshAccount`:

```ts
                void usePermissionsStore.getState().refresh(orgId)
```

- [ ] **Step 3: Chamar `refresh` no tick reativo do data-sync**

Em `apps/desktop/src/lib/data-sync.ts`, adicionar o import no topo:

```ts
import { usePermissionsStore } from '../store/permissions.js'
```

Localizar, dentro de `scheduleSync`, a linha `useUIStore.getState().bumpLibrary()` (após uma passada de sync reativo). Adicionar logo após ela:

```ts
        const currentOrg = localStorage.getItem('leviticus_org_id')
        if (currentOrg) void usePermissionsStore.getState().refresh(currentOrg)
```

- [ ] **Step 4: Limpar no signout**

Em `apps/desktop/src/store/auth.ts`, no `signOut`, adicionar a limpeza. Importar no topo:

```ts
import { usePermissionsStore } from './permissions.js'
```

E dentro de `signOut`, após o `set({ user: null, ... })`:

```ts
    usePermissionsStore.getState().clear()
```

- [ ] **Step 5: Verificar typecheck e testes afetados**

Run: `cd apps/desktop && pnpm exec tsc --noEmit && pnpm vitest run src/lib/data-sync.test.ts`
Expected: typecheck sem erros; testes de data-sync verdes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/lib/data-sync.ts apps/desktop/src/store/auth.ts
git commit -m "feat: refresh permissions store on sync and clear on signout"
```

---

## Task 3: Migrar callers async pro store e remover `hasPermission`/`isOwner`

**Files:**
- Modify: `apps/desktop/src/pages/OrgManage.tsx`, `org/OrgMembers.tsx`, `org/OrgInfo.tsx`, `org/OrgIntegrations.tsx`, `org/OrgDanger.tsx`, `components/AddSongToPlaylistModal.tsx`
- Modify/Delete: `apps/desktop/src/lib/permissions.ts`, `apps/desktop/src/lib/permissions.test.ts`

Hoje 6 arquivos chamam `hasPermission`/`isOwner` (async, query no SQLite) e guardam o resultado em `useState`. Cada um passa a usar o hook síncrono `usePermission` / o seletor do store.

- [ ] **Step 1: `OrgManage.tsx` — usar o store pras abas permitidas**

Em `OrgManage.tsx`: remover `import { hasPermission } from '../lib/permissions.js'`. Adicionar `import { usePermission } from '../store/permissions.js'`.

Substituir o cálculo async de `allowedKeys` (hoje num `useEffect` com `hasPermission`) por leitura síncrona. No corpo do componente:

```ts
  const canMembers = usePermission('manage_members')
  const canRoles = usePermission('manage_roles')
```

Remover o `useState` de `allowedKeys` e o trecho do `useEffect` que setava `allowed`. Calcular direto no render:

```ts
  const allowedKeys = new Set<TabKey>(['info', 'members', 'integrations', 'danger'])
  if (canMembers) allowedKeys.add('invites')
  if (canRoles) allowedKeys.add('roles')
```

> O `useEffect` de `load()` continua existindo só pros counts (`orgName`, `memberCount`, etc.) — só a parte de permissão sai dele.

- [ ] **Step 2: `OrgMembers.tsx` — `canManage` via store**

Em `OrgMembers.tsx`: remover `import { hasPermission, isOwner } from '../../lib/permissions.js'` e o `useState` `canManage`. Adicionar `import { usePermission } from '../../store/permissions.js'`. No corpo:

```ts
  const canManage = usePermission('manage_members')
```

Remover do `load()` a linha `setCanManage(await hasPermission('manage_members', orgId) || await isOwner(orgId))`. `usePermission` já cobre o owner.

- [ ] **Step 3: `OrgInfo.tsx` — migrar pro store**

Em `OrgInfo.tsx`: localizar o uso de `hasPermission('manage_members', orgId)`. Trocar pelo hook `usePermission('manage_members')` (síncrono, sem `useState`/`useEffect` async). Remover o import de `../../lib/permissions.js`.

- [ ] **Step 4: `OrgIntegrations.tsx` — migrar pro store**

Em `OrgIntegrations.tsx`: o uso de `hasPermission('manage_integrations', orgId)` que seta `canManage` vira `const canManage = usePermission('manage_integrations')`. Remover o import e o `useState`/`useEffect` async correspondentes.

> Nota: há uma query SQL direta em `OrgIntegrations.tsx:85` (`JOIN role_permissions`) — essa NÃO é o helper `hasPermission`, é outra coisa (lista admins). Deixar como está.

- [ ] **Step 5: `OrgDanger.tsx` — `isOwner` via store**

Em `OrgDanger.tsx`: trocar `isOwner(orgId)` (async, em `useEffect` → `useState owner`) pelo seletor: `const owner = usePermissionsStore((s) => s.isOwner)`. Importar `usePermissionsStore` de `../../store/permissions.js`. Remover o import de `../../lib/permissions.js` e o `useEffect` async.

- [ ] **Step 6: `AddSongToPlaylistModal.tsx` — `canAddNew` via store**

Em `AddSongToPlaylistModal.tsx`: hoje `void hasPermission('add_songs', orgId).then(setCanAddNew)`. Trocar por `const canAddNew = usePermission('add_songs')`. Remover o import de `../lib/permissions.js`, o `useState` `canAddNew` e o `useEffect`/`.then` async.

- [ ] **Step 7: Remover as funções async de `permissions.ts`**

Após os 6 passos acima, `hasPermission`/`isOwner` não têm mais callers. Apagar o arquivo `apps/desktop/src/lib/permissions.ts` e `apps/desktop/src/lib/permissions.test.ts`.

Run pra confirmar que não sobrou import: `cd apps/desktop && grep -rn "lib/permissions" src/` — Expected: nenhum resultado.

- [ ] **Step 8: Verificar typecheck e suíte**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros (`noUnusedLocals` pega imports/vars órfãos — corrigir se aparecer).

Run: `cd apps/desktop && pnpm vitest run src/pages/OrgManage.test.tsx src/pages/org/OrgMembers.test.tsx`
Expected: PASS. Se um teste mockava `../lib/permissions.js`, trocar o mock por `vi.mock('../store/permissions.js', () => ({ usePermission: () => true, usePermissionsStore: { getState: () => ({ isOwner: true }), subscribe: () => () => {} } }))` ajustando o caminho relativo. Confirmar se a expectativa do teste continua válida antes de só ajustar o mock.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/pages/OrgManage.tsx apps/desktop/src/pages/org/ apps/desktop/src/components/AddSongToPlaylistModal.tsx
git rm apps/desktop/src/lib/permissions.ts apps/desktop/src/lib/permissions.test.ts
git commit -m "refactor: migrate permission checks to permissions store"
```

---

## Task 4: Checagem de permissão nos RPCs backend

**Files:**
- Create: `supabase/migrations/20260522000003_rpc_permission_checks.sql`
- Modify: call sites de `update_song` / `update_song_groups` / `reorder_playlist_songs` no app (ver Step 4)

`update_song`, `update_song_groups` e `reorder_playlist_songs` são `SECURITY DEFINER` e hoje não checam permissão (bypassam o RLS). Recebem checagem inline. Os 3 retornam `void` hoje → passam pro envelope `{ok, error}`.

- [ ] **Step 1: Criar a migration**

`supabase/migrations/20260522000003_rpc_permission_checks.sql`:

```sql
-- Fecha o gap: 3 RPCs SECURITY DEFINER bypassavam o RLS sem checar permissão.
-- O bug histórico de auth.uid() via tauriFetch já não existe (os RPCs de
-- playlist usam has_permission com sucesso). Tipo de retorno muda de void
-- pra jsonb → DROP necessário antes do CREATE.

-- ── update_song ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS update_song(uuid, uuid, text, text, int, uuid, text, text, text, uuid[]);

CREATE OR REPLACE FUNCTION update_song(
  p_song_id        uuid,
  p_org_id         uuid,
  p_youtube_url    text,
  p_thumbnail_url  text,
  p_duration_seconds int,
  p_added_by       uuid,
  p_title          text,
  p_artist         text,
  p_song_type      text,
  p_group_ids      uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM songs WHERE id = p_song_id) INTO v_exists;
  -- Música existente → editar exige manage_songs. Música nova (upsert
  -- insere) → exige add_songs.
  IF v_exists THEN
    IF NOT (is_org_owner(p_org_id) OR has_permission(p_org_id, 'manage_songs')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  ELSE
    IF NOT (is_org_owner(p_org_id) OR has_permission(p_org_id, 'add_songs')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  INSERT INTO songs (id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, song_type, added_by, updated_at)
  VALUES (p_song_id, p_org_id, p_youtube_url, p_title, p_artist, p_thumbnail_url, p_duration_seconds, p_song_type, p_added_by, now())
  ON CONFLICT (id) DO UPDATE SET
    title      = EXCLUDED.title,
    artist     = EXCLUDED.artist,
    song_type  = EXCLUDED.song_type,
    updated_at = now();

  DELETE FROM song_groups WHERE song_id = p_song_id;
  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO song_groups (song_id, group_id)
    SELECT p_song_id, unnest(p_group_ids);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_song(uuid, uuid, text, text, int, uuid, text, text, text, uuid[]) TO authenticated;

-- ── update_song_groups ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS update_song_groups(uuid, uuid[]);

CREATE OR REPLACE FUNCTION update_song_groups(
  p_song_id  uuid,
  p_group_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM songs WHERE id = p_song_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT (is_org_owner(v_org_id) OR has_permission(v_org_id, 'manage_songs')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM song_groups WHERE song_id = p_song_id;
  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    INSERT INTO song_groups (song_id, group_id)
    SELECT p_song_id, unnest(p_group_ids);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION update_song_groups(uuid, uuid[]) TO authenticated;

-- ── reorder_playlist_songs ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS reorder_playlist_songs(uuid, uuid[]);

CREATE OR REPLACE FUNCTION reorder_playlist_songs(
  p_playlist_id uuid,
  p_song_ids    uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  i integer;
BEGIN
  SELECT org_id INTO v_org_id FROM playlists WHERE id = p_playlist_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT (is_org_owner(v_org_id) OR has_permission(v_org_id, 'manage_playlists')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_song_ids IS NOT NULL AND array_length(p_song_ids, 1) IS NOT NULL THEN
    FOR i IN 1 .. array_length(p_song_ids, 1) LOOP
      UPDATE playlist_songs
         SET position = i
       WHERE playlist_id = p_playlist_id
         AND song_id = p_song_ids[i];
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION reorder_playlist_songs(uuid, uuid[]) TO authenticated;

-- ── add_song_to_playlist: aceitar add_songs_to_playlist OU manage_playlists ─
-- Hoje o RPC só aceita manage_playlists, mas a intenção da permissão
-- add_songs_to_playlist (e o RLS da tabela playlist_songs) é justamente
-- permitir adicionar música ao culto. Alinha o RPC ao RLS.
CREATE OR REPLACE FUNCTION _can_add_to_playlist(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_org_owner(p_org_id)
    OR has_permission(p_org_id, 'manage_playlists')
    OR has_permission(p_org_id, 'add_songs_to_playlist')
$$;
```

> O `add_song_to_playlist` em si (definido em `20260508100002_playlist_rpcs.sql`) chama `_can_manage_playlist`. Trocar essa chamada por `_can_add_to_playlist` exige recriar a função inteira. Fazer isso: copiar o corpo de `add_song_to_playlist` da migration `20260508100002` pra esta migration, trocando só `IF NOT _can_manage_playlist(v_org) THEN` por `IF NOT _can_add_to_playlist(v_org) THEN`. Manter o resto idêntico.

- [ ] **Step 2: Aplicar a migration**

Run: `supabase migration up`
Expected: aplica `20260522000003_rpc_permission_checks` sem erro.

- [ ] **Step 3: Verificar — membro sem permissão é bloqueado**

Run (via docker psql, ajustar conforme o ambiente):
`docker exec supabase_db_leviticus psql postgresql://postgres:postgres@localhost:5432/postgres -c "\df update_song"`
Expected: `update_song` listada com tipo de retorno `jsonb`.

- [ ] **Step 4: Atualizar os call sites no app**

Os 3 RPCs agora retornam `{ok, error}` em vez de `void`. Localizar os call sites:

Run: `cd apps/desktop && grep -rn "update_song'\|update_song_groups'\|reorder_playlist_songs'" src/`

Para cada `supabase.rpc('update_song', ...)` / `'update_song_groups'` / `'reorder_playlist_songs'`: o código hoje trata o retorno como void/erro-direto. Ajustar pra ler o envelope — padrão já usado nos call sites de `delete_song` / RPCs de playlist no projeto:

```ts
const { data, error } = await supabase.rpc('update_song', { /* args */ })
if (error || !data?.ok) {
  const reason = data?.error ?? error?.message
  // ... tratamento (ver Task 5 pro mapeamento de 'forbidden')
}
```

Seguir exatamente o padrão de leitura de envelope que `EditSongModal` / `PlaylistDetail` já usam pra `delete_song` / `delete_playlist`. Não inventar formato novo.

- [ ] **Step 5: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260522000003_rpc_permission_checks.sql apps/desktop/src/
git commit -m "fix: add permission checks to update_song, update_song_groups, reorder RPCs"
```

---

## Task 5: Helper de erro amigável

**Files:**
- Create: `apps/desktop/src/lib/permission-error.ts`
- Test: `apps/desktop/src/lib/permission-error.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/lib/permission-error.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { permissionErrorMessage } from './permission-error.js'

describe('permissionErrorMessage', () => {
  it('detecta erro de RLS pelo code 42501', () => {
    expect(permissionErrorMessage({ code: '42501', message: 'permission denied' }))
      .toBe('Você não tem permissão para esta ação.')
  })

  it('detecta envelope de RPC com error forbidden', () => {
    expect(permissionErrorMessage({ ok: false, error: 'forbidden' }))
      .toBe('Você não tem permissão para esta ação.')
  })

  it('retorna null pra erro que não é de permissão', () => {
    expect(permissionErrorMessage({ code: '23505', message: 'duplicate' })).toBeNull()
    expect(permissionErrorMessage({ ok: false, error: 'not_found' })).toBeNull()
    expect(permissionErrorMessage(new Error('rede caiu'))).toBeNull()
    expect(permissionErrorMessage(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar pra confirmar que falham**

Run: `cd apps/desktop && pnpm vitest run src/lib/permission-error.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o helper**

`apps/desktop/src/lib/permission-error.ts`:

```ts
const MSG = 'Você não tem permissão para esta ação.'

/**
 * Detecta erro de permissão vindo de RLS (Postgres code 42501) ou de
 * envelope de RPC (`{ ok: false, error: 'forbidden' }`). Retorna a mensagem
 * amigável em pt-BR, ou null se o erro não for de permissão.
 */
export function permissionErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as Record<string, unknown>
  if (e.code === '42501') return MSG
  if (e.ok === false && e.error === 'forbidden') return MSG
  return null
}
```

- [ ] **Step 4: Rodar pra confirmar que passam**

Run: `cd apps/desktop && pnpm vitest run src/lib/permission-error.test.ts`
Expected: PASS — 3 testes verdes.

- [ ] **Step 5: Aplicar nos `catch` dos writes**

Nos call sites de write que podem dar erro de permissão (os RPCs da Task 4, e inserts/updates/deletes diretos em `songs`/`groups`/`playlists`/`playlist_songs`), no tratamento de erro: antes do fallback genérico, checar `permissionErrorMessage`. Padrão:

```ts
import { permissionErrorMessage } from '../lib/permission-error.js'
import { toastError } from '../store/toasts.js'
import { captureException } from '../lib/observability.js'

// no catch / no ramo de erro:
captureException(err, { feature: 'add-song', step: '...' })
const permMsg = permissionErrorMessage(err)
toastError(permMsg ?? 'Algo deu errado. Tente novamente.')
```

Aplicar nos arquivos: `EditSongModal.tsx`, `SongCard.tsx` (delete), `Groups.tsx`/`GroupDetail.tsx`, `Playlists.tsx`/`PlaylistDetail.tsx`, `AddSongModal.tsx`. Em cada um, localizar o `catch`/ramo de erro do write e inserir a checagem. Logar o erro cru com `captureException` antes (já é o padrão no projeto).

- [ ] **Step 6: Verificar typecheck e suíte**

Run: `cd apps/desktop && pnpm exec tsc --noEmit && pnpm test`
Expected: typecheck limpo; suíte verde.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/permission-error.ts apps/desktop/src/lib/permission-error.test.ts apps/desktop/src/
git commit -m "feat: friendly message for permission-denied errors"
```

---

## Task 6: Gating de UI — esconder controles sem permissão

**Files:**
- Modify: `apps/desktop/src/pages/Library.tsx`, `components/SongCard.tsx`, `pages/Groups.tsx`, `pages/GroupDetail.tsx`, `pages/Playlists.tsx`, `pages/PlaylistDetail.tsx`
- Test: os `.test.tsx` correspondentes

Padrão de gating (esconder por completo): `{usePermission('x') && <Controle/>}`. O hook é importado de `../store/permissions.js` (ajustar profundidade relativa por arquivo).

- [ ] **Step 1: Library — botão "Adicionar"**

Em `apps/desktop/src/pages/Library.tsx`: importar `usePermission`. No corpo: `const canAddSongs = usePermission('add_songs')`. Envolver os dois gatilhos de adicionar música — o botão "Adicionar" do header (~linha 184) e o "Adicionar primeira música" do empty-state (~linha 296) — em `{canAddSongs && ( ... )}`.

- [ ] **Step 2: Teste do gating da Library**

Em `Library.test.tsx`, adicionar mock de `../store/permissions.js` e 2 testes:

```ts
vi.mock('../store/permissions.js', () => ({
  usePermission: (p: string) => mockPerms.has(p),
}))
const mockPerms = new Set<string>()
// ... beforeEach: mockPerms.clear()

it('esconde "Adicionar" sem add_songs', () => {
  mockPerms.clear()
  // render Library com músicas — seguir o setup já usado no arquivo
  expect(screen.queryByText('Adicionar')).not.toBeInTheDocument()
})
it('mostra "Adicionar" com add_songs', () => {
  mockPerms.add('add_songs')
  // render
  expect(screen.getByText('Adicionar')).toBeInTheDocument()
})
```

> `vi.mock` é hoisted — declarar `mockPerms` com `vi.hoisted` (`const { mockPerms } = vi.hoisted(() => ({ mockPerms: new Set<string>() }))`). Copiar o setup de render já presente em `Library.test.tsx`.

Run: `cd apps/desktop && pnpm vitest run src/pages/Library.test.tsx` — Expected: PASS.

- [ ] **Step 3: SongCard — editar / excluir / remover do culto**

Em `apps/desktop/src/components/SongCard.tsx`: importar `usePermission`. No corpo:

```ts
  const canManageSongs = usePermission('manage_songs')
  const canManagePlaylists = usePermission('manage_playlists')
```

No menu de ações do card: envolver o item de **editar** e o de **excluir (servidor)** em `{canManageSongs && ...}`; o item **remover do culto** (`onRemoveFromPlaylist`) em `{canManagePlaylists && ...}`. **Não** gatear "Remover do dispositivo" (`onDeleteFromDevice`) nem "Exportar MP3" — operações locais.

- [ ] **Step 4: Teste do gating do SongCard**

Em `SongCard.test.tsx`: mock de `../store/permissions.js` (mesmo padrão hoisted do Step 2). 2 testes: sem `manage_songs` o menu não tem "Editar"/"Excluir"; com, tem. Copiar o setup de abertura do menu já usado no arquivo.

Run: `cd apps/desktop && pnpm vitest run src/components/SongCard.test.tsx` — Expected: PASS.

- [ ] **Step 5: Groups — botão "Novo" / "Criar primeiro ministério"**

Em `apps/desktop/src/pages/Groups.tsx`: importar `usePermission`. `const canManageGroups = usePermission('manage_groups')`. Envolver o botão "Novo" (~linha 148) e "Criar primeiro ministério" (~linha 165) em `{canManageGroups && ...}`.

- [ ] **Step 6: GroupDetail — editar / excluir ministério**

Em `apps/desktop/src/pages/GroupDetail.tsx`: importar `usePermission`. `const canManageGroups = usePermission('manage_groups')`. Envolver os controles de editar e excluir o ministério (o botão que chama `handleDelete` ~linha 404, e o de editar) em `{canManageGroups && ...}`.

- [ ] **Step 7: Playlists — "Novo culto" + menu editar/excluir**

Em `apps/desktop/src/pages/Playlists.tsx`: importar `usePermission`. `const canManagePlaylists = usePermission('manage_playlists')`. Envolver o botão "Novo culto" (~linha 146) e "Criar primeiro culto" (~linha 218) em `{canManagePlaylists && ...}`. Passar `canManagePlaylists` pros cards (`TodayCard`/`CompactCard`) e, dentro deles, esconder o `<ActionsMenu>` (editar/excluir) quando `false`.

- [ ] **Step 8: PlaylistDetail — seções, adicionar/remover música, editar/excluir culto**

Em `apps/desktop/src/pages/PlaylistDetail.tsx`: importar `usePermission`.

```ts
  const canManagePlaylists = usePermission('manage_playlists')
  const canAddToPlaylist = usePermission('add_songs_to_playlist')
```

Esconder com `{canManagePlaylists && ...}`: os botões "Adicionar seção" (~linhas 632 e 767), o menu de editar/excluir culto (`onDelete`/`onEdit` do header ~linha 636-639), os controles de renomear/excluir seção (`onRename`/`onDelete` da seção ~linha 745, 1079), e o remover-música do culto. Esconder com `{(canManagePlaylists || canAddToPlaylist) && ...}`: o botão "Adicionar música" (~linhas 632, 940).

- [ ] **Step 9: Testes de gating de Groups / GroupDetail / Playlists / PlaylistDetail**

Para cada um dos 4 arquivos, no `.test.tsx` correspondente: mock de `../store/permissions.js` / `../../store/permissions.js` (padrão hoisted) e 2 testes (esconde sem permissão / mostra com). Copiar o setup de render já presente em cada arquivo de teste.

Run: `cd apps/desktop && pnpm vitest run src/pages/Groups.test.tsx src/pages/GroupDetail.test.tsx src/pages/Playlists.test.tsx src/pages/PlaylistDetail.test.tsx`
Expected: PASS.

- [ ] **Step 10: Verificar typecheck + suíte completa**

Run: `cd apps/desktop && pnpm exec tsc --noEmit && pnpm test`
Expected: typecheck limpo; suíte verde.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/pages/ apps/desktop/src/components/SongCard.tsx
git commit -m "feat: hide actions the user lacks permission for"
```

---

## Task 7: Remover o banner "Em construção"

**Files:**
- Modify: `apps/desktop/src/pages/org/OrgRoles.tsx`
- Test: `apps/desktop/src/pages/org/OrgRoles.test.tsx`

- [ ] **Step 1: Remover o banner**

Em `apps/desktop/src/pages/org/OrgRoles.tsx`, localizar o bloco do banner "Em construção" (~linha 194, o `<div>` com o texto "Em construção: os papéis e permissões estão sendo definidos aqui..."). Remover o bloco JSX inteiro.

- [ ] **Step 2: Ajustar/remover teste do banner**

Run: `cd apps/desktop && grep -n "Em construção\|construção" src/pages/org/OrgRoles.test.tsx`
Se houver um teste que asserta a presença do banner, removê-lo (o banner não existe mais). Se nenhum, seguir.

- [ ] **Step 3: Verificar**

Run: `cd apps/desktop && pnpm vitest run src/pages/org/OrgRoles.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS, typecheck limpo.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/pages/org/OrgRoles.tsx apps/desktop/src/pages/org/OrgRoles.test.tsx
git commit -m "feat: remove 'Em construção' banner from Papéis (#120)"
```

---

## Task 8: Verificação final

- [ ] **Step 1: Suíte completa**

Run: `cd apps/desktop && pnpm test`
Expected: tudo verde. (Flakiness conhecida #130 — se algum teste de componente flakar, re-rodar o arquivo isolado pra confirmar.)

- [ ] **Step 2: Build**

Run: `cd apps/desktop && pnpm build`
Expected: `tsc && vite build` sem erros.

- [ ] **Step 3: Verificação manual no app dev**

Run: `cd apps/desktop && pnpm tauri dev` (com `supabase start` ativo).
Verificar com um usuário **sem** permissões (membro de org sem papel, ou papel sem perms):
- Library não mostra "Adicionar música".
- SongCard não mostra editar/excluir.
- Groups/Playlists não mostram criar.
- A aba Papéis não tem mais o banner "Em construção".
Verificar com o **dono** da org: todos os controles aparecem.
Verificar que mudar um papel (dar/tirar permissão) reflete na UI após o sync reativo, sem reabrir o app.

- [ ] **Step 4: Commit final (se a verificação manual exigir ajustes)**

Só se necessário. Caso contrário o trabalho já está commitado por task.

---

## Notas de execução

- **Branch:** `feat/permission-gating` (já criada, com o spec). PR pra `dev` ao fim.
- **Migration:** `20260522000002` é o próximo número após `20260522000001_analytics_events` (já em produção). Não precisa de migration espelho em SQLite — RPCs não são sincronizados.
- **Retrocompatibilidade:** os RPCs usam `CREATE OR REPLACE` + `DROP` (mudança de tipo de retorno). App antigo em produção que chama os RPCs vai passar a receber `jsonb` em vez de `void` — o app antigo ignora o retorno, então não quebra; e passa a ser corretamente bloqueado se não tiver permissão (comportamento desejado).
- **Banner por último:** Task 7 só roda depois de 1-6 — o banner sinaliza gating incompleto; removê-lo antes seria mentira.
