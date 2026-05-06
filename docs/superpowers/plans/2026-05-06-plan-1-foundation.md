# Leviticus — Plano 1: Fundação (Monorepo + Core + Supabase + Worker API)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar o monorepo, pacote de tipos TypeScript compartilhados, schema completo do Supabase com RLS e triggers, e a Worker API para download de áudio do YouTube via yt-dlp.

**Architecture:** pnpm monorepo com três workspaces: `packages/core` (tipos TypeScript + cliente Supabase), `worker` (Node.js + Express + yt-dlp, autenticado via JWT do Supabase), e `supabase` (migrações SQL). O Worker valida o JWT antes de qualquer processamento. O schema do Supabase implementa RLS com funções helper para verificar permissões por organização e grupo.

**Tech Stack:** pnpm workspaces, TypeScript 5, Supabase CLI, PostgreSQL, Node.js 20, Express 4, yt-dlp, Vitest, Supertest

---

## Estrutura de Arquivos

```
leviticus/
├── package.json                          # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── packages/
│   └── core/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── types/
│           │   ├── index.ts
│           │   ├── organization.ts
│           │   ├── song.ts
│           │   ├── group.ts
│           │   ├── playlist.ts
│           │   ├── role.ts
│           │   └── realtime.ts
│           └── supabase/
│               └── client.ts
├── worker/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts
│       ├── app.ts
│       ├── middleware/
│       │   └── auth.ts
│       ├── routes/
│       │   └── download.ts
│       ├── services/
│       │   └── ytdlp.ts
│       └── tests/
│           ├── auth.test.ts
│           ├── ytdlp.test.ts
│           └── download.test.ts
└── supabase/
    ├── config.toml
    └── migrations/
        ├── 20260506000001_schema.sql
        ├── 20260506000002_rls_helpers.sql
        ├── 20260506000003_rls_policies.sql
        └── 20260506000004_triggers.sql
```

---

## Task 1: Monorepo Root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Verificar que pnpm está instalado**

```bash
pnpm --version
```
Esperado: versão 8 ou superior. Se não estiver: `npm install -g pnpm`

- [ ] **Step 2: Criar package.json raiz**

```json
{
  "name": "leviticus",
  "private": true,
  "scripts": {
    "dev:worker": "pnpm --filter worker dev",
    "build:worker": "pnpm --filter worker build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

- [ ] **Step 3: Criar pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'worker'
```

- [ ] **Step 4: Criar tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Criar .gitignore**

```
node_modules/
dist/
.env
.env.local
*.mp3
*.mp4
supabase/.branches
supabase/.temp
```

- [ ] **Step 6: Inicializar git e fazer primeiro commit**

```bash
git init
git add .
git commit -m "chore: monorepo root setup"
```

---

## Task 2: Pacote Core — Setup

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Criar packages/core/package.json**

```json
{
  "name": "@leviticus/core",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.43.0"
  }
}
```

- [ ] **Step 2: Criar packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Instalar dependências**

```bash
pnpm install
```

- [ ] **Step 4: Criar packages/core/src/index.ts vazio por agora**

```typescript
export * from './types/index'
export * from './supabase/client'
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "chore: core package setup"
```

---

## Task 3: Pacote Core — Tipos TypeScript

**Files:**
- Create: `packages/core/src/types/organization.ts`
- Create: `packages/core/src/types/song.ts`
- Create: `packages/core/src/types/group.ts`
- Create: `packages/core/src/types/playlist.ts`
- Create: `packages/core/src/types/role.ts`
- Create: `packages/core/src/types/realtime.ts`
- Create: `packages/core/src/types/index.ts`

- [ ] **Step 1: Criar packages/core/src/types/organization.ts**

```typescript
export type Organization = {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
}

export type OrganizationMember = {
  user_id: string
  org_id: string
  joined_at: string
}

export type OrgInviteCode = {
  id: string
  org_id: string
  code: string
  created_by: string
  expires_at: string | null
  is_active: boolean
}
```

- [ ] **Step 2: Criar packages/core/src/types/role.ts**

```typescript
export type Permission =
  | 'add_songs'
  | 'manage_songs'
  | 'manage_groups'
  | 'manage_playlists'
  | 'add_songs_to_playlist'
  | 'manage_members'
  | 'manage_roles'

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
```

- [ ] **Step 3: Criar packages/core/src/types/group.ts**

```typescript
export type Group = {
  id: string
  org_id: string
  name: string
  updated_at: string
}
```

- [ ] **Step 4: Criar packages/core/src/types/song.ts**

```typescript
export type Song = {
  id: string
  org_id: string
  added_by: string | null
  youtube_url: string
  title: string
  artist: string
  thumbnail_url: string | null
  duration_seconds: number | null
  created_at: string
  updated_at: string
}

export type SongGroup = {
  song_id: string
  group_id: string
}

export type SongWithGroups = Song & {
  groups: string[] // group ids
}
```

- [ ] **Step 5: Criar packages/core/src/types/playlist.ts**

```typescript
export type Playlist = {
  id: string
  org_id: string
  name: string
  scheduled_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type PlaylistSong = {
  playlist_id: string
  song_id: string
  position: number
}

export type PlaylistWithSongs = Playlist & {
  songs: Array<PlaylistSong & { song: Song }>
}

import type { Song } from './song'
```

- [ ] **Step 6: Criar packages/core/src/types/realtime.ts**

```typescript
export type DevicePresence = {
  device_id: string
  device_name: string
  platform: 'desktop' | 'mobile'
}

export type RemoteCommand = {
  target_device_id: string
  payload:
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'seek'; position_seconds: number }
    | { type: 'set_volume'; volume: number }
    | { type: 'play_song'; song_id: string }
    | { type: 'next_in_playlist' }
    | { type: 'previous_in_playlist' }
    | { type: 'play_playlist'; playlist_id: string; position: number }
}

export type PlayerState = {
  device_id: string
  song_id: string | null
  playlist_id: string | null
  playlist_position: number | null
  playlist_total: number | null
  is_playing: boolean
  position_seconds: number
  volume: number
  is_downloading: boolean
  download_progress: number
}
```

- [ ] **Step 7: Criar packages/core/src/types/index.ts**

```typescript
export * from './organization'
export * from './role'
export * from './group'
export * from './song'
export * from './playlist'
export * from './realtime'
```

- [ ] **Step 8: Verificar que os tipos compilam sem erros**

```bash
cd packages/core && pnpm typecheck
```
Esperado: sem erros

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types/
git commit -m "feat(core): add TypeScript types for all domain entities"
```

---

## Task 4: Pacote Core — Cliente Supabase

**Files:**
- Create: `packages/core/src/supabase/client.ts`

- [ ] **Step 1: Criar packages/core/src/supabase/client.ts**

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type { SupabaseClient }

export function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

export function createSupabaseServiceClient(
  url: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd packages/core && pnpm typecheck
```
Esperado: sem erros

- [ ] **Step 3: Build do pacote core**

```bash
cd packages/core && pnpm build
```
Esperado: pasta `dist/` gerada sem erros

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/supabase/
git commit -m "feat(core): add Supabase client factory"
```

---

## Task 5: Supabase — Setup Local

**Files:**
- Create: `supabase/config.toml` (via CLI)

- [ ] **Step 1: Verificar que Supabase CLI está instalado**

```bash
supabase --version
```
Esperado: versão 1.x ou superior. Se não: `brew install supabase/tap/supabase`

- [ ] **Step 2: Verificar que Docker está rodando**

```bash
docker ps
```
Esperado: lista de containers (pode estar vazia). Se Docker não estiver rodando, abra o Docker Desktop.

- [ ] **Step 3: Inicializar Supabase no projeto**

```bash
supabase init
```
Esperado: pasta `supabase/` criada com `config.toml`

- [ ] **Step 4: Iniciar Supabase local**

```bash
supabase start
```
Esperado (após ~1 min):
```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
```
Anote a `anon key` exibida — será usada nos testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/.gitignore
git commit -m "chore: supabase local setup"
```

---

## Task 6: Supabase — Migration: Schema Completo

**Files:**
- Create: `supabase/migrations/20260506000001_schema.sql`

- [ ] **Step 1: Criar o arquivo de migração**

```bash
supabase migration new schema
```
Isso cria `supabase/migrations/TIMESTAMP_schema.sql`. Renomeie para `20260506000001_schema.sql`.

- [ ] **Step 2: Escrever o schema completo**

```sql
-- organizations
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- organization_members
CREATE TABLE organization_members (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- org_invite_codes
CREATE TABLE org_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

-- roles
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- role_permissions
CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'add_songs',
    'manage_songs',
    'manage_groups',
    'manage_playlists',
    'add_songs_to_playlist',
    'manage_members',
    'manage_roles'
  )),
  PRIMARY KEY (role_id, permission)
);

-- groups
CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- user_role_assignments
CREATE TABLE user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE
);

-- songs
CREATE TABLE songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  youtube_url text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  thumbnail_url text,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, youtube_url)
);

-- song_groups
CREATE TABLE song_groups (
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, group_id)
);

-- playlists
CREATE TABLE playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  scheduled_date date,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- playlist_songs
CREATE TABLE playlist_songs (
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (playlist_id, song_id)
);
```

- [ ] **Step 3: Aplicar a migração**

```bash
supabase db reset
```
Esperado: `Finished supabase db reset on branch main.`

- [ ] **Step 4: Verificar que as tabelas foram criadas**

```bash
supabase db diff
```
Esperado: sem diff (schema aplicado com sucesso)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260506000001_schema.sql
git commit -m "feat(db): add initial schema with all tables"
```

---

## Task 7: Supabase — Migration: Funções Helper de Permissão

**Files:**
- Create: `supabase/migrations/20260506000002_rls_helpers.sql`

- [ ] **Step 1: Criar migração**

```bash
supabase migration new rls_helpers
```
Renomeie para `20260506000002_rls_helpers.sql`.

- [ ] **Step 2: Escrever funções helper**

```sql
-- Verifica se o usuário autenticado é membro da org
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
  )
$$;

-- Verifica se o usuário autenticado é dono da org
CREATE OR REPLACE FUNCTION is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = p_org_id AND owner_id = auth.uid()
  )
$$;

-- Verifica se o usuário tem uma permissão na org
-- Se p_group_id for NULL, aceita tanto permissões globais quanto de grupo
-- Se p_group_id for fornecido, aceita permissões globais OU permissões do grupo específico
CREATE OR REPLACE FUNCTION has_permission(
  p_org_id uuid,
  p_permission text,
  p_group_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_role_assignments ura
    JOIN role_permissions rp ON rp.role_id = ura.role_id
    WHERE ura.user_id = auth.uid()
      AND ura.org_id = p_org_id
      AND rp.permission = p_permission
      AND (
        ura.group_id IS NULL
        OR (p_group_id IS NOT NULL AND ura.group_id = p_group_id)
      )
  )
  OR is_org_owner(p_org_id)
$$;
```

- [ ] **Step 3: Aplicar**

```bash
supabase db reset
```
Esperado: sem erros

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506000002_rls_helpers.sql
git commit -m "feat(db): add RLS helper functions for permission checks"
```

---

## Task 8: Supabase — Migration: RLS Policies

**Files:**
- Create: `supabase/migrations/20260506000003_rls_policies.sql`

- [ ] **Step 1: Criar migração**

```bash
supabase migration new rls_policies
```
Renomeie para `20260506000003_rls_policies.sql`.

- [ ] **Step 2: Habilitar RLS e escrever policies**

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "members can view their orgs"
  ON organizations FOR SELECT
  USING (is_org_member(id) OR owner_id = auth.uid());

CREATE POLICY "authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner can update org"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "owner can delete org"
  ON organizations FOR DELETE
  USING (owner_id = auth.uid());

-- organization_members
CREATE POLICY "members can view org members"
  ON organization_members FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "anyone can join via invite (handled by function)"
  ON organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "members can leave or admins can remove"
  ON organization_members FOR DELETE
  USING (user_id = auth.uid() OR has_permission(org_id, 'manage_members'));

-- org_invite_codes
CREATE POLICY "members can view invite codes"
  ON org_invite_codes FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "admins can create invite codes"
  ON org_invite_codes FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_members'));

CREATE POLICY "admins can update invite codes"
  ON org_invite_codes FOR UPDATE
  USING (has_permission(org_id, 'manage_members'));

-- roles
CREATE POLICY "members can view roles"
  ON roles FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "role managers can create roles"
  ON roles FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_roles'));

CREATE POLICY "role managers can update roles"
  ON roles FOR UPDATE
  USING (has_permission(org_id, 'manage_roles'));

CREATE POLICY "role managers can delete roles"
  ON roles FOR DELETE
  USING (has_permission(org_id, 'manage_roles'));

-- role_permissions
CREATE POLICY "members can view role permissions"
  ON role_permissions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM roles r WHERE r.id = role_id AND is_org_member(r.org_id)
  ));

CREATE POLICY "role managers can manage role permissions"
  ON role_permissions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM roles r WHERE r.id = role_id
      AND has_permission(r.org_id, 'manage_roles')
  ));

-- user_role_assignments
CREATE POLICY "members can view role assignments"
  ON user_role_assignments FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "role managers can assign roles"
  ON user_role_assignments FOR ALL
  USING (has_permission(org_id, 'manage_roles'));

-- groups
CREATE POLICY "members can view groups"
  ON groups FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "group managers can create groups"
  ON groups FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_groups'));

CREATE POLICY "group managers can update groups"
  ON groups FOR UPDATE
  USING (has_permission(org_id, 'manage_groups'));

CREATE POLICY "group managers can delete groups"
  ON groups FOR DELETE
  USING (has_permission(org_id, 'manage_groups'));

-- songs
CREATE POLICY "members can view songs"
  ON songs FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "users with add_songs can insert"
  ON songs FOR INSERT
  WITH CHECK (has_permission(org_id, 'add_songs'));

CREATE POLICY "users with manage_songs can update"
  ON songs FOR UPDATE
  USING (has_permission(org_id, 'manage_songs'));

CREATE POLICY "users with manage_songs can delete"
  ON songs FOR DELETE
  USING (has_permission(org_id, 'manage_songs'));

-- song_groups
CREATE POLICY "members can view song_groups"
  ON song_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id AND is_org_member(s.org_id)
  ));

CREATE POLICY "users with manage_songs can manage song_groups"
  ON song_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM songs s WHERE s.id = song_id
      AND has_permission(s.org_id, 'manage_songs', song_groups.group_id)
  ));

-- playlists
CREATE POLICY "members can view playlists"
  ON playlists FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "playlist managers can create playlists"
  ON playlists FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_playlists'));

CREATE POLICY "playlist managers can update playlists"
  ON playlists FOR UPDATE
  USING (has_permission(org_id, 'manage_playlists'));

CREATE POLICY "playlist managers can delete playlists"
  ON playlists FOR DELETE
  USING (has_permission(org_id, 'manage_playlists'));

-- playlist_songs
CREATE POLICY "members can view playlist songs"
  ON playlist_songs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM playlists p WHERE p.id = playlist_id AND is_org_member(p.org_id)
  ));

CREATE POLICY "users with add_songs_to_playlist can insert"
  ON playlist_songs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM playlists p
    JOIN songs s ON s.id = playlist_songs.song_id
    WHERE p.id = playlist_id
      AND p.org_id = s.org_id
      AND (
        has_permission(p.org_id, 'add_songs_to_playlist')
        OR EXISTS (
          SELECT 1 FROM song_groups sg
          JOIN user_role_assignments ura ON ura.group_id = sg.group_id
          JOIN role_permissions rp ON rp.role_id = ura.role_id
          WHERE sg.song_id = s.id
            AND ura.user_id = auth.uid()
            AND rp.permission = 'add_songs_to_playlist'
        )
      )
  ));

CREATE POLICY "playlist managers can remove playlist songs"
  ON playlist_songs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM playlists p WHERE p.id = playlist_id
      AND has_permission(p.org_id, 'manage_playlists')
  ));
```

- [ ] **Step 3: Aplicar**

```bash
supabase db reset
```
Esperado: sem erros

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506000003_rls_policies.sql
git commit -m "feat(db): add RLS policies for all tables"
```

---

## Task 9: Supabase — Migration: Triggers

**Files:**
- Create: `supabase/migrations/20260506000004_triggers.sql`

- [ ] **Step 1: Criar migração**

```bash
supabase migration new triggers
```
Renomeie para `20260506000004_triggers.sql`.

- [ ] **Step 2: Escrever triggers**

```sql
-- Função genérica para atualizar updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Aplicar updated_at em todas as tabelas relevantes
CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_roles
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_groups
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_songs
  BEFORE UPDATE ON songs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_playlists
  BEFORE UPDATE ON playlists
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Deleção em cascata: remove música da org quando não pertencer a nenhum grupo
CREATE OR REPLACE FUNCTION cleanup_orphaned_songs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM songs
  WHERE id = OLD.song_id
    AND NOT EXISTS (
      SELECT 1 FROM song_groups WHERE song_id = OLD.song_id
    );
  RETURN OLD;
END;
$$;

CREATE TRIGGER cleanup_songs_after_group_removal
  AFTER DELETE ON song_groups
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphaned_songs();
```

- [ ] **Step 3: Aplicar**

```bash
supabase db reset
```
Esperado: sem erros

- [ ] **Step 4: Testar o trigger de cascade manualmente via Studio**

Abra http://127.0.0.1:54323 → SQL Editor e execute:

```sql
-- Inserir dados de teste
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'test@test.com');

INSERT INTO organizations (id, name, owner_id) VALUES
  ('00000000-0000-0000-0000-000000000010', 'Igreja Teste',
   '00000000-0000-0000-0000-000000000001');

INSERT INTO groups (id, org_id, name) VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'Grupo A'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010', 'Grupo B');

INSERT INTO songs (id, org_id, youtube_url, title, artist) VALUES
  ('00000000-0000-0000-0000-000000000030',
   '00000000-0000-0000-0000-000000000010',
   'https://youtube.com/watch?v=test1', 'Música Teste', 'Artista');

INSERT INTO song_groups VALUES
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020'),
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000021');

-- Remover do grupo A — música deve permanecer (ainda está no grupo B)
DELETE FROM song_groups
WHERE song_id = '00000000-0000-0000-0000-000000000030'
  AND group_id = '00000000-0000-0000-0000-000000000020';

SELECT COUNT(*) FROM songs WHERE id = '00000000-0000-0000-0000-000000000030';
-- Esperado: 1

-- Remover do grupo B — música deve sumir
DELETE FROM song_groups
WHERE song_id = '00000000-0000-0000-0000-000000000030'
  AND group_id = '00000000-0000-0000-0000-000000000021';

SELECT COUNT(*) FROM songs WHERE id = '00000000-0000-0000-0000-000000000030';
-- Esperado: 0
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260506000004_triggers.sql
git commit -m "feat(db): add updated_at triggers and song cascade deletion"
```

---

## Task 10: Worker API — Setup e Auth Middleware

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/.env.example`
- Create: `worker/src/app.ts`
- Create: `worker/src/index.ts`
- Create: `worker/src/middleware/auth.ts`
- Create: `worker/tests/auth.test.ts`

- [ ] **Step 1: Verificar que yt-dlp está instalado**

```bash
yt-dlp --version
```
Se não: `brew install yt-dlp`

- [ ] **Step 2: Criar worker/package.json**

```json
{
  "name": "worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.43.0",
    "express": "^4.19.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 3: Criar worker/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Criar worker/.env.example**

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-anon-key-here
PORT=3001
```

- [ ] **Step 5: Instalar dependências do worker**

```bash
pnpm install
```

- [ ] **Step 6: Escrever o teste que falha para o middleware de auth**

Crie `worker/src/tests/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { requireAuth } from '../middleware/auth'

const app = express()
app.use(express.json())
app.get('/protected', requireAuth, (req, res) => {
  res.json({ ok: true })
})

describe('requireAuth middleware', () => {
  it('rejects request with no Authorization header', async () => {
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing token')
  })

  it('rejects request with invalid token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid token')
  })
})
```

- [ ] **Step 7: Rodar o teste para confirmar que falha**

```bash
cd worker && pnpm test
```
Esperado: FAIL — `Cannot find module '../middleware/auth'`

- [ ] **Step 8: Criar worker/src/middleware/auth.ts**

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Request, Response, NextFunction } from 'express'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    res.status(401).json({ error: 'Missing token' })
    return
  }

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  res.locals.user = data.user
  next()
}
```

- [ ] **Step 9: Criar worker/src/app.ts**

```typescript
import express from 'express'

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  return app
}
```

- [ ] **Step 10: Criar worker/src/index.ts**

```typescript
import { createApp } from './app.js'

const PORT = process.env.PORT ?? 3001
const app = createApp()

app.listen(PORT, () => {
  console.log(`Worker API running on port ${PORT}`)
})
```

- [ ] **Step 11: Rodar os testes**

```bash
cd worker && SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7NfFnzoVWYxvKL3hHoJuqJbCQaBrW5BmXxc pnpm test
```

Esperado:
```
✓ rejects request with no Authorization header
✓ rejects request with invalid token
```

- [ ] **Step 12: Commit**

```bash
git add worker/
git commit -m "feat(worker): setup Express app with JWT auth middleware"
```

---

## Task 11: Worker API — Serviço yt-dlp e Rota de Download

**Files:**
- Create: `worker/src/services/ytdlp.ts`
- Create: `worker/src/routes/download.ts`
- Modify: `worker/src/app.ts`
- Create: `worker/src/tests/download.test.ts`

- [ ] **Step 1: Escrever o teste que falha para a rota de download**

Crie `worker/src/tests/download.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app'

vi.mock('../middleware/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}))

vi.mock('../services/ytdlp', () => ({
  downloadAudio: vi.fn(),
}))

import { downloadAudio } from '../services/ytdlp'

const app = createApp()

describe('POST /download', () => {
  it('returns 400 when url is missing', async () => {
    const res = await request(app).post('/download').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Missing url')
  })

  it('returns 400 when url is not a string', async () => {
    const res = await request(app).post('/download').send({ url: 123 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Missing url')
  })

  it('returns 500 when yt-dlp fails', async () => {
    vi.mocked(downloadAudio).mockRejectedValueOnce(new Error('yt-dlp error'))
    const res = await request(app)
      .post('/download')
      .send({ url: 'https://youtube.com/watch?v=test' })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Download failed')
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd worker && pnpm test
```
Esperado: FAIL — `Cannot find module '../routes/download'`

- [ ] **Step 3: Criar worker/src/services/ytdlp.ts**

```typescript
import { spawn } from 'child_process'
import type { Readable } from 'stream'

export function downloadAudio(url: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--no-playlist',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', '-',
      url,
    ])

    let resolved = false

    proc.stdout.once('data', () => {
      if (!resolved) {
        resolved = true
        resolve(proc.stdout)
      }
    })

    proc.on('error', reject)

    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString()
      if (msg.includes('ERROR') && !resolved) {
        resolved = true
        reject(new Error(msg))
      }
    })

    proc.on('close', (code) => {
      if (code !== 0 && !resolved) {
        reject(new Error(`yt-dlp exited with code ${code}`))
      }
    })
  })
}
```

- [ ] **Step 4: Criar worker/src/routes/download.ts**

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { downloadAudio } from '../services/ytdlp.js'

const router = Router()

router.post('/', requireAuth, async (req, res) => {
  const { url } = req.body

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url' })
    return
  }

  try {
    const stream = await downloadAudio(url)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Transfer-Encoding', 'chunked')
    stream.pipe(res)
  } catch {
    res.status(500).json({ error: 'Download failed' })
  }
})

export { router as downloadRoute }
```

- [ ] **Step 5: Registrar a rota em app.ts**

```typescript
import express from 'express'
import { downloadRoute } from './routes/download.js'

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/download', downloadRoute)

  return app
}
```

- [ ] **Step 6: Rodar todos os testes**

```bash
cd worker && SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7NfFnzoVWYxvKL3hHoJuqJbCQaBrW5BmXxc pnpm test
```

Esperado:
```
✓ rejects request with no Authorization header
✓ rejects request with invalid token
✓ returns 400 when url is missing
✓ returns 400 when url is not a string
✓ returns 500 when yt-dlp fails
```

- [ ] **Step 7: Smoke test manual (requer URL real do YouTube)**

```bash
cd worker && cp .env.example .env
# Edite .env com os valores do `supabase start`
pnpm dev
```

Em outro terminal:
```bash
curl -X POST http://localhost:3001/download \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_JWT_AQUI" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  --output test.mp3
```
Esperado: arquivo `test.mp3` criado com áudio válido

- [ ] **Step 8: Commit final**

```bash
git add worker/src/
git commit -m "feat(worker): add yt-dlp download route with auth"
```

---

## Checklist de Self-Review

- [x] Schema cobre todas as tabelas do spec
- [x] UNIQUE constraints: `songs(org_id, youtube_url)`, `song_groups(song_id, group_id)`, `playlist_songs(playlist_id, song_id)`, `role_permissions(role_id, permission)`
- [x] Trigger de cascade: música removida de todos os grupos → deletada da org e playlists
- [x] Triggers de `updated_at` em: organizations, roles, groups, songs, playlists
- [x] `added_by` em songs: `ON DELETE SET NULL`
- [x] Worker API autentica via JWT do Supabase
- [x] Tipos TypeScript cobrem todas as entidades + tipos de Realtime
- [x] `add_songs` é global (sem scope de grupo) — validado pela RLS policy de INSERT em songs
- [x] `PlayerState.song_id` é `string | null`
- [x] `scheduled_date` em playlists presente

---

> **Próximo:** Plano 2 — App Desktop (Tauri + React)
