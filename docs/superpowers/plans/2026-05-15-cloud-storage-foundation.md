# Cloud Storage Foundation — Plano de Implementação (Plano 1 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer a fundação técnica de backup em nuvem: schema (Supabase + SQLite local), edge function `cloud-storage-proxy` com interface genérica e implementação concreta do Google Drive, módulo cliente `src/lib/cloud-storage/`, fluxo OAuth com deep link, e nova permissão granular. Esta camada **não tem UI** — entrega o backend testável que os planos 2-4 vão consumir.

**Architecture:** Edge function deno em `supabase/functions/cloud-storage-proxy/` faz dispatch baseado em `cloud_storage_accounts.provider`. Bytes de áudio nunca passam pela edge function — upload usa resumable session do provedor (cliente Tauri → Google direto), download usa URL temporária. Token OAuth do admin fica criptografado no Supabase via pgsodium. Cliente Tauri trata só JSON pequeno via `src/lib/cloud-storage/`.

**Tech Stack:** Supabase (PostgreSQL + Edge Functions Deno), Tauri v2, TypeScript, Vitest, Deno test, pgsodium, tauri-plugin-deep-link, tauri-plugin-http, ffmpeg sidecar (já existente), Google Drive API v3 (escopo `drive.file`).

---

## Pré-requisitos manuais (executar antes de começar)

Estes itens dependem de ações fora do código que o usuário deve fazer **antes** das tasks abaixo. Não são tarefas pra agente — são pendências de infra.

- [ ] **P1: Criar projeto no Google Cloud Console**
  - Acessar https://console.cloud.google.com
  - Criar projeto novo "Leviticus" (ou usar existente)
  - Habilitar "Google Drive API" em APIs & Services → Library
  - Criar OAuth client em APIs & Services → Credentials:
    - Tipo: "Web application"
    - Authorized redirect URIs: `https://<seu-supabase-projeto>.supabase.co/functions/v1/cloud-storage-proxy/oauth-callback`
    - Salvar `client_id` e `client_secret`
  - Configurar OAuth consent screen com:
    - User type: External
    - Scope: `https://www.googleapis.com/auth/drive.file`
    - Test users: emails dos devs durante desenvolvimento
  - Submeter pra verificação quando estiver pronto pra produção (~1-2 semanas)

- [ ] **P2: Adicionar secrets no Supabase**
  - Dashboard Supabase → Project Settings → Edge Functions → Secrets
  - Adicionar:
    - `GOOGLE_OAUTH_CLIENT_ID` = valor do passo P1
    - `GOOGLE_OAUTH_CLIENT_SECRET` = valor do passo P1
    - `OAUTH_STATE_SECRET` = string aleatória de 64 chars (use `openssl rand -hex 32`) — assina o state OAuth pra prevenir forging
    - `SUPABASE_URL` (já existe)
    - `SUPABASE_SERVICE_ROLE_KEY` (já existe)

- [ ] **P3: Habilitar pgsodium no Supabase local e remoto**
  - Local: `supabase db reset` — pgsodium vem habilitado por default em `supabase/config.toml`
  - Verificar: `psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT extversion FROM pg_extension WHERE extname = 'pgsodium'"`
  - Se não retornar nada, adicionar em `supabase/migrations/` a habilitação manual

Avise quando esses 3 itens estiverem prontos antes de iniciar as tasks de código.

---

## Estrutura de arquivos

### Criados

```
packages/core/src/types/cloud-storage.ts         # Tipos compartilhados (ProviderId, CloudFileStatus, etc.)
supabase/migrations/20260515000001_cloud_storage.sql
apps/desktop/src-tauri/migrations/006_cloud_storage.sql
supabase/functions/cloud-storage-proxy/
  ├── index.ts                                   # Entrypoint Deno (HTTP server + dispatcher)
  ├── deps.ts                                    # Imports centralizados
  ├── auth.ts                                    # Validação JWT + permissão
  ├── crypto.ts                                  # pgsodium wrappers
  ├── providers/
  │   ├── types.ts                               # Interface CloudStorageProvider
  │   ├── registry.ts                            # Map<ProviderId, impl>
  │   ├── google-drive.ts                        # Implementação Google Drive
  │   ├── onedrive.ts                            # Placeholder NotImplementedError
  │   └── dropbox.ts                             # Placeholder NotImplementedError
  └── tests/
      ├── google-drive.test.ts
      ├── auth.test.ts
      └── dispatch.test.ts
apps/desktop/src/lib/cloud-storage/
  ├── types.ts                                   # Re-exports + tipos client-side
  ├── client.ts                                  # Chamadas à edge function
  ├── upload.ts                                  # PUT chunked + retry
  ├── download.ts                                # GET stream + hash check
  ├── status.ts                                  # backup_status helpers
  ├── client.test.ts
  ├── upload.test.ts
  ├── download.test.ts
  └── status.test.ts
apps/desktop/src-tauri/src/cloud_storage.rs       # Comando hash_file
```

### Modificados

```
packages/core/src/types/org.ts                    # Adiciona 'manage_integrations' a Permission
packages/core/src/types/song.ts                   # Adiciona campos cloud_file_id, source, etc.
packages/core/src/index.ts                        # Re-export cloud-storage types
apps/desktop/src/lib/sync.ts                      # Sync das novas colunas e tabela cloud_storage_accounts
apps/desktop/src-tauri/src/lib.rs                 # Registra cloud_storage commands + deep link
apps/desktop/src-tauri/Cargo.toml                 # Adiciona tauri-plugin-deep-link
apps/desktop/src-tauri/tauri.conf.json            # Registra protocolo leviticus://
apps/desktop/package.json                         # Adiciona file-type npm
apps/desktop/src-tauri/capabilities/default.json  # Adiciona permissões pra deep link
```

---

## Task 1: Adicionar permission `manage_integrations` ao type Permission

**Files:**
- Modify: `packages/core/src/types/org.ts`
- Test: `packages/core/src/types/org.test.ts` (criar)

- [ ] **Step 1: Verificar que ainda não tem teste pro tipo Permission**

Run: `ls packages/core/src/types/org.test.ts 2>/dev/null || echo "no test yet"`
Expected: `no test yet`

- [ ] **Step 2: Escrever teste type-level que verifica que `manage_integrations` está no union**

Create `packages/core/src/types/org.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { Permission } from './org.js'

describe('Permission type', () => {
  it('includes manage_integrations', () => {
    const p: Permission = 'manage_integrations'
    expectTypeOf(p).toMatchTypeOf<Permission>()
  })

  it('still includes existing permissions', () => {
    const perms: Permission[] = [
      'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
      'add_songs_to_playlist', 'manage_members', 'manage_roles', 'manage_integrations'
    ]
    expectTypeOf(perms).toEqualTypeOf<Permission[]>()
  })
})
```

- [ ] **Step 3: Rodar teste, ver falha (`manage_integrations` não existe no union)**

Run: `cd packages/core && pnpm vitest run src/types/org.test.ts`
Expected: FAIL com erro de tipo "Type '\"manage_integrations\"' is not assignable to type 'Permission'"

- [ ] **Step 4: Adicionar `manage_integrations` ao tipo Permission**

Edit `packages/core/src/types/org.ts`:

```typescript
export type Permission =
  | 'add_songs'
  | 'manage_songs'
  | 'manage_groups'
  | 'manage_playlists'
  | 'add_songs_to_playlist'
  | 'manage_members'
  | 'manage_roles'
  | 'manage_integrations'
```

- [ ] **Step 5: Rodar teste, verificar que passa**

Run: `cd packages/core && pnpm vitest run src/types/org.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types/org.ts packages/core/src/types/org.test.ts
git commit -m "feat(core): adiciona permissão manage_integrations"
```

---

## Task 2: Tipos compartilhados de cloud storage

**Files:**
- Create: `packages/core/src/types/cloud-storage.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/types/cloud-storage.test.ts`

- [ ] **Step 1: Criar arquivo de tipos compartilhados**

Create `packages/core/src/types/cloud-storage.ts`:

```typescript
// Tipos compartilhados entre edge function, cliente Tauri e UI.

export type ProviderId = 'google_drive' | 'onedrive' | 'dropbox'

export type BackupStatus = 'pending' | 'uploaded' | 'failed' | 'no_account'

export type SongSource = 'youtube' | 'upload'

export type CloudStorageAccount = {
  org_id: string
  provider: ProviderId
  account_email: string
  account_user_id: string
  app_folder_id: string
  connected_by: string | null
  connected_at: string
  last_quota_total: number | null
  last_quota_used: number | null
  last_quota_check_at: string | null
  updated_at: string
}

export type QuotaInfo = {
  total: number
  used: number
  available: number
}

export type CloudFileInfo = {
  fileId: string
  size: number
  mimeType: string
  createdAt: string
  modifiedAt: string
}

export type UploadSession = {
  sessionUrl: string
  sessionId: string
  expiresAt: string
}
```

- [ ] **Step 2: Criar teste verificando shape dos tipos**

Create `packages/core/src/types/cloud-storage.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { ProviderId, BackupStatus, SongSource, CloudStorageAccount, QuotaInfo } from './cloud-storage.js'

describe('cloud-storage types', () => {
  it('ProviderId aceita os 3 providers válidos', () => {
    const g: ProviderId = 'google_drive'
    const o: ProviderId = 'onedrive'
    const d: ProviderId = 'dropbox'
    expectTypeOf<ProviderId>().toEqualTypeOf<'google_drive' | 'onedrive' | 'dropbox'>()
  })

  it('BackupStatus aceita os 4 estados', () => {
    expectTypeOf<BackupStatus>().toEqualTypeOf<'pending' | 'uploaded' | 'failed' | 'no_account'>()
  })

  it('SongSource aceita youtube ou upload', () => {
    expectTypeOf<SongSource>().toEqualTypeOf<'youtube' | 'upload'>()
  })

  it('CloudStorageAccount tem org_id como PK string', () => {
    const a: CloudStorageAccount = {
      org_id: 'uuid',
      provider: 'google_drive',
      account_email: 'a@b.c',
      account_user_id: 'u',
      app_folder_id: 'f',
      connected_by: null,
      connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: null,
      last_quota_used: null,
      last_quota_check_at: null,
      updated_at: '2026-05-15T00:00:00Z',
    }
    expectTypeOf(a).toMatchTypeOf<CloudStorageAccount>()
  })

  it('QuotaInfo é tudo number', () => {
    const q: QuotaInfo = { total: 100, used: 50, available: 50 }
    expectTypeOf(q).toMatchTypeOf<QuotaInfo>()
  })
})
```

- [ ] **Step 3: Rodar teste, deve passar (tipos criados, teste só valida shape)**

Run: `cd packages/core && pnpm vitest run src/types/cloud-storage.test.ts`
Expected: PASS

- [ ] **Step 4: Adicionar export no index.ts**

Edit `packages/core/src/index.ts`. Localizar o bloco de re-exports e adicionar:

```typescript
export * from './types/cloud-storage.js'
```

- [ ] **Step 5: Buildar packages/core**

Run: `cd packages/core && pnpm build`
Expected: build limpo, dist atualizado

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types/cloud-storage.ts packages/core/src/types/cloud-storage.test.ts packages/core/src/index.ts
git commit -m "feat(core): tipos compartilhados de cloud storage"
```

---

## Task 3: Estender tipo Song com campos de cloud storage

**Files:**
- Modify: `packages/core/src/types/song.ts`
- Test: `packages/core/src/types/song.test.ts` (criar)

- [ ] **Step 1: Ler o arquivo atual**

Run: `cat packages/core/src/types/song.ts`
Expected: vê o type `Song` com campos atuais (id, org_id, youtube_url, title, artist, etc.)

- [ ] **Step 2: Criar teste que exige os novos campos**

Create `packages/core/src/types/song.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { Song, BackupStatus, SongSource } from '../index.js'

describe('Song type — cloud storage fields', () => {
  it('tem cloud_file_id como string | null', () => {
    const s: Pick<Song, 'cloud_file_id'> = { cloud_file_id: null }
    expectTypeOf(s.cloud_file_id).toEqualTypeOf<string | null>()
  })

  it('tem source restrito a SongSource', () => {
    const s: Pick<Song, 'source'> = { source: 'upload' }
    expectTypeOf<Song['source']>().toEqualTypeOf<SongSource>()
  })

  it('tem backup_status restrito a BackupStatus', () => {
    const s: Pick<Song, 'backup_status'> = { backup_status: 'pending' }
    expectTypeOf<Song['backup_status']>().toEqualTypeOf<BackupStatus>()
  })

  it('tem cloud_file_size, cloud_file_hash, original_format', () => {
    const s: Pick<Song, 'cloud_file_size' | 'cloud_file_hash' | 'original_format'> = {
      cloud_file_size: 1024,
      cloud_file_hash: 'abc',
      original_format: 'wav',
    }
    expectTypeOf(s.cloud_file_size).toEqualTypeOf<number | null>()
    expectTypeOf(s.cloud_file_hash).toEqualTypeOf<string | null>()
    expectTypeOf(s.original_format).toEqualTypeOf<string | null>()
  })
})
```

- [ ] **Step 3: Rodar teste, ver falha**

Run: `cd packages/core && pnpm vitest run src/types/song.test.ts`
Expected: FAIL — campos não existem no tipo Song

- [ ] **Step 4: Estender Song com os novos campos**

Edit `packages/core/src/types/song.ts`. Adicionar ao type Song existente:

```typescript
import type { BackupStatus, SongSource } from './cloud-storage.js'

export type SongType = 'normal' | 'playback' | 'instrumental' | 'vs'

export type Song = {
  id: string
  org_id: string
  added_by: string | null
  youtube_url: string
  title: string
  artist: string
  thumbnail_url: string | null
  duration_seconds: number | null
  song_type: SongType
  created_at: string
  updated_at: string
  // Cloud storage backup fields
  cloud_file_id: string | null
  cloud_file_size: number | null
  cloud_file_hash: string | null
  source: SongSource
  original_format: string | null
  backup_status: BackupStatus
}

export type SongWithGroups = Song & { groups: string[] }
```

- [ ] **Step 5: Rodar teste e verificar que passa**

Run: `cd packages/core && pnpm vitest run src/types/song.test.ts`
Expected: PASS

- [ ] **Step 6: Buildar packages/core**

Run: `cd packages/core && pnpm build`
Expected: build limpo

- [ ] **Step 7: Verificar onde o app usa Song e ajustar quebras esperadas**

Run: `cd apps/desktop && pnpm tsc --noEmit 2>&1 | head -40`
Expected: pode ter erros em inserts/selects que não passam os novos campos. Anotar paths pra Task 4 (sync) e Task 19 (insert flow do AddSongModal). Por ora, **se houver TS errors em arquivos que ainda não serão tocados nesta task, adicionar `// @ts-expect-error — preenchido em task subsequente`** somente nas linhas que dependem dos novos campos.

- [ ] **Step 8: Rodar typecheck final**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: PASS (com possíveis @ts-expect-error comentados)

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types/song.ts packages/core/src/types/song.test.ts
git add -p apps/desktop/src  # apenas linhas com @ts-expect-error
git commit -m "feat(core): adiciona campos de cloud storage ao tipo Song"
```

---

## Task 4: Migration Supabase — cloud_storage_accounts + colunas em songs + pending_cloud_uploads

**Files:**
- Create: `supabase/migrations/20260515000001_cloud_storage.sql`
- Test: rodar `supabase db reset` e validar com SQL

- [ ] **Step 1: Verificar timestamp da migration mais recente pra evitar colisão**

Run: `ls supabase/migrations/ | sort | tail -3`
Expected: vê migrations existentes; usar timestamp `20260515000001` (deve ser maior que a última).

- [ ] **Step 2: Criar arquivo de migration**

Create `supabase/migrations/20260515000001_cloud_storage.sql`:

```sql
-- Habilitar pgsodium se ainda não estiver
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Tabela 1: conta de cloud storage por org (1 ativa por vez)
CREATE TABLE cloud_storage_accounts (
  org_id                  uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider                text NOT NULL CHECK (provider IN ('google_drive', 'onedrive', 'dropbox')),
  account_email           text NOT NULL,
  account_user_id         text NOT NULL,
  refresh_token_encrypted bytea NOT NULL,
  access_token            text,
  access_token_expires_at timestamptz,
  app_folder_id           text NOT NULL,
  connected_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at            timestamptz NOT NULL DEFAULT now(),
  last_quota_total        bigint,
  last_quota_used         bigint,
  last_quota_check_at     timestamptz,
  provider_metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_storage_accounts_updated_at
  ON cloud_storage_accounts(updated_at);

-- Tabela 2: fila de uploads pendentes (admin e membros contribuem)
CREATE TABLE pending_cloud_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id         uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id       uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_count   int NOT NULL DEFAULT 0,
  last_error      text,
  last_attempt_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, device_id)
);

CREATE INDEX idx_pending_cloud_uploads_org_id
  ON pending_cloud_uploads(org_id);
CREATE INDEX idx_pending_cloud_uploads_attempt
  ON pending_cloud_uploads(last_attempt_at);

-- Tabela 3: estender songs com campos de backup (aditivo, com defaults)
ALTER TABLE songs
  ADD COLUMN cloud_file_id   text,
  ADD COLUMN cloud_file_size bigint,
  ADD COLUMN cloud_file_hash text,
  ADD COLUMN source          text NOT NULL DEFAULT 'youtube'
    CHECK (source IN ('youtube', 'upload')),
  ADD COLUMN original_format text,
  ADD COLUMN backup_status   text NOT NULL DEFAULT 'pending'
    CHECK (backup_status IN ('pending', 'uploaded', 'failed', 'no_account'));

CREATE INDEX idx_songs_backup_status_org
  ON songs(org_id, backup_status);

-- Função genérica de checagem de permissão (já existe — apenas garantir)
-- has_permission(org_id, permission) é definida em migrations anteriores.
-- Nada a fazer aqui.

-- RLS pra cloud_storage_accounts
ALTER TABLE cloud_storage_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cloud_storage_accounts_select_org_members
  ON cloud_storage_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE org_id = cloud_storage_accounts.org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY cloud_storage_accounts_insert_with_perm
  ON cloud_storage_accounts FOR INSERT
  WITH CHECK (has_permission(org_id, 'manage_integrations'));

CREATE POLICY cloud_storage_accounts_update_with_perm
  ON cloud_storage_accounts FOR UPDATE
  USING (has_permission(org_id, 'manage_integrations'))
  WITH CHECK (has_permission(org_id, 'manage_integrations'));

CREATE POLICY cloud_storage_accounts_delete_with_perm
  ON cloud_storage_accounts FOR DELETE
  USING (has_permission(org_id, 'manage_integrations'));

-- IMPORTANTE: cloud_storage_accounts NÃO expõe refresh_token_encrypted ou access_token
-- aos clientes — apenas a edge function (service role) lê esses campos.
-- Criar VIEW pública que expõe somente o que o cliente pode ver.

CREATE VIEW cloud_storage_accounts_public AS
SELECT
  org_id, provider, account_email, account_user_id, app_folder_id,
  connected_by, connected_at,
  last_quota_total, last_quota_used, last_quota_check_at,
  updated_at
FROM cloud_storage_accounts;

GRANT SELECT ON cloud_storage_accounts_public TO authenticated;

-- RLS pra pending_cloud_uploads
ALTER TABLE pending_cloud_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_uploads_select_org_members
  ON pending_cloud_uploads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE org_id = pending_cloud_uploads.org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY pending_uploads_insert_self
  ON pending_cloud_uploads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pending_uploads_update_self
  ON pending_cloud_uploads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pending_uploads_delete_self
  ON pending_cloud_uploads FOR DELETE
  USING (user_id = auth.uid());

-- Trigger pra atualizar updated_at em cloud_storage_accounts
CREATE OR REPLACE FUNCTION touch_cloud_storage_accounts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cloud_storage_accounts_touch
  BEFORE UPDATE ON cloud_storage_accounts
  FOR EACH ROW
  EXECUTE FUNCTION touch_cloud_storage_accounts();
```

- [ ] **Step 3: Aplicar migration**

Run: `supabase db reset`
Expected: migration aplica sem erro. Mensagem final "Finished supabase db reset on branch main."

- [ ] **Step 4: Validar schema via SQL direto**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d cloud_storage_accounts" 2>&1 | head -20
```

Expected: vê coluna por coluna do schema novo, com tipos e defaults corretos.

- [ ] **Step 5: Validar coluna nova em songs**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'songs' AND column_name IN ('cloud_file_id', 'backup_status', 'source')"
```

Expected: 3 linhas com as colunas e tipos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260515000001_cloud_storage.sql
git commit -m "feat(db): migration cloud_storage_accounts + colunas backup em songs"
```

---

## Task 5: Migration SQLite local (espelho)

**Files:**
- Create: `apps/desktop/src-tauri/migrations/006_cloud_storage.sql`

- [ ] **Step 1: Verificar numbering atual**

Run: `ls apps/desktop/src-tauri/migrations/`
Expected: vê `001`...`005`. Usar `006`.

- [ ] **Step 2: Criar migration**

Create `apps/desktop/src-tauri/migrations/006_cloud_storage.sql`:

```sql
-- Espelho local das tabelas/colunas de cloud storage (sem campos sensíveis).

-- Estender songs (mesmo padrão da migration Supabase)
ALTER TABLE songs ADD COLUMN cloud_file_id   TEXT;
ALTER TABLE songs ADD COLUMN cloud_file_size INTEGER;
ALTER TABLE songs ADD COLUMN cloud_file_hash TEXT;
ALTER TABLE songs ADD COLUMN source          TEXT NOT NULL DEFAULT 'youtube';
ALTER TABLE songs ADD COLUMN original_format TEXT;
ALTER TABLE songs ADD COLUMN backup_status   TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_songs_backup_status
  ON songs(org_id, backup_status);

-- Cache local de cloud_storage_accounts (lê só do view público — sem tokens)
CREATE TABLE IF NOT EXISTS cloud_storage_accounts (
  org_id                  TEXT PRIMARY KEY,
  provider                TEXT NOT NULL,
  account_email           TEXT NOT NULL,
  account_user_id         TEXT NOT NULL,
  app_folder_id           TEXT NOT NULL,
  connected_by            TEXT,
  connected_at            TEXT NOT NULL,
  last_quota_total        INTEGER,
  last_quota_used         INTEGER,
  last_quota_check_at     TEXT,
  updated_at              TEXT NOT NULL
);

-- Fila local de uploads pendentes (sincronizada com Supabase)
CREATE TABLE IF NOT EXISTS pending_cloud_uploads (
  id              TEXT PRIMARY KEY,
  song_id         TEXT NOT NULL,
  org_id          TEXT NOT NULL,
  device_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  last_attempt_at TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE (song_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_uploads_org
  ON pending_cloud_uploads(org_id);
```

- [ ] **Step 3: Atualizar registro de migrations no lib.rs se necessário**

Run: `grep -n "include_str.*migrations" apps/desktop/src-tauri/src/lib.rs | head -5`
Expected: localizar onde migrations são listadas (geralmente em `tauri_plugin_sql::Builder`).

Editar `apps/desktop/src-tauri/src/lib.rs` adicionando a nova migration ao vetor de migrations. Padrão exato (ler o arquivo antes pra copiar o estilo):

```rust
tauri_plugin_sql::Migration {
    version: 6,
    description: "cloud_storage",
    sql: include_str!("../migrations/006_cloud_storage.sql"),
    kind: tauri_plugin_sql::MigrationKind::Up,
},
```

- [ ] **Step 4: Rodar app dev pra forçar aplicação da migration**

Run: `cd apps/desktop && pnpm tauri dev` (timeout 30s — só pra subir e ver logs de migration)
Expected: app sobe sem erro, logs mostram aplicação da migration 6.

(matar processo após confirmar)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/migrations/006_cloud_storage.sql apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(db): migration local SQLite cloud_storage"
```

---

## Task 6: Atualizar sync.ts pra puxar novas colunas/tabelas

**Files:**
- Modify: `apps/desktop/src/lib/sync.ts`
- Modify: `apps/desktop/src/lib/sync.test.ts`

- [ ] **Step 1: Ler sync.ts e identificar onde songs é fetched**

Run: `grep -n "songs.*select\|from('songs')" apps/desktop/src/lib/sync.ts`
Expected: ver a linha exata onde `supabase.from('songs').select(...)` está.

- [ ] **Step 2: Estender o select de songs com colunas novas**

Edit `apps/desktop/src/lib/sync.ts`. Localizar a linha do `supabase.from('songs').select(...)` e atualizar pra incluir os novos campos:

```typescript
supabase.from('songs').select(
  'id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, song_type, ' +
  'cloud_file_id, cloud_file_size, cloud_file_hash, source, original_format, backup_status, ' +
  'created_at, updated_at'
).eq('org_id', orgId).gte('updated_at', since)
```

- [ ] **Step 3: Adicionar fetch de cloud_storage_accounts_public**

Edit `apps/desktop/src/lib/sync.ts`. Adicionar ao Promise.all:

```typescript
supabase.from('cloud_storage_accounts_public').select(
  'org_id, provider, account_email, account_user_id, app_folder_id, ' +
  'connected_by, connected_at, last_quota_total, last_quota_used, last_quota_check_at, updated_at'
).eq('org_id', orgId).maybeSingle(),
```

(adicionar ao desestrutração também, no nome `cloudAccount`)

- [ ] **Step 4: Atualizar o upsert local de songs pra incluir os campos novos**

Edit `apps/desktop/src/lib/sync.ts`. Localizar o loop `for (const s of songs.data)` e estender o INSERT:

```typescript
for (const s of songs.data) {
  await db.execute(
    `INSERT OR REPLACE INTO songs
     (id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, song_type,
      cloud_file_id, cloud_file_size, cloud_file_hash, source, original_format, backup_status,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.org_id, s.youtube_url, s.title, s.artist,
     s.thumbnail_url, s.duration_seconds, s.song_type ?? 'normal',
     s.cloud_file_id, s.cloud_file_size, s.cloud_file_hash,
     s.source ?? 'youtube', s.original_format, s.backup_status ?? 'pending',
     s.created_at, s.updated_at]
  )
}
```

- [ ] **Step 5: Adicionar upsert de cloud_storage_accounts no SQLite**

Edit `apps/desktop/src/lib/sync.ts`. Após o loop de songs, adicionar:

```typescript
if (cloudAccount.data) {
  const a = cloudAccount.data
  await db.execute(
    `INSERT OR REPLACE INTO cloud_storage_accounts
     (org_id, provider, account_email, account_user_id, app_folder_id,
      connected_by, connected_at, last_quota_total, last_quota_used, last_quota_check_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.org_id, a.provider, a.account_email, a.account_user_id, a.app_folder_id,
     a.connected_by, a.connected_at, a.last_quota_total, a.last_quota_used, a.last_quota_check_at, a.updated_at]
  )
} else {
  // Conta desconectada — limpa cache local
  await db.execute(`DELETE FROM cloud_storage_accounts WHERE org_id = ?`, [orgId])
}
```

- [ ] **Step 6: Atualizar `sync.test.ts` com mocks dos novos campos**

Edit `apps/desktop/src/lib/sync.test.ts`. Localizar o mock do supabase e adicionar resposta pro novo fetch:

```typescript
// Dentro do mock vi.mock('./supabase.js', ...):
// adicionar quando from('cloud_storage_accounts_public') for chamado
if (table === 'cloud_storage_accounts_public') {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  }
}
```

E garantir que o teste existente passa: assert que após sync sem cloud account, a tabela `cloud_storage_accounts` local fica vazia.

- [ ] **Step 7: Rodar testes**

Run: `cd apps/desktop && pnpm vitest run src/lib/sync.test.ts`
Expected: PASS (incluindo o novo cenário de cloud_storage_accounts vazio)

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/lib/sync.ts apps/desktop/src/lib/sync.test.ts
git commit -m "feat(sync): sincroniza novos campos de cloud_storage"
```

---

## Task 7: Edge function — estrutura base e shared types

**Files:**
- Create: `supabase/functions/cloud-storage-proxy/deps.ts`
- Create: `supabase/functions/cloud-storage-proxy/providers/types.ts`

- [ ] **Step 1: Criar diretório e deps.ts**

Run: `mkdir -p supabase/functions/cloud-storage-proxy/providers supabase/functions/cloud-storage-proxy/tests`

Create `supabase/functions/cloud-storage-proxy/deps.ts`:

```typescript
// Imports centralizados — facilita troca de versão e import maps no Deno
export { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
export { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
export type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
```

- [ ] **Step 2: Criar arquivo providers/types.ts**

Create `supabase/functions/cloud-storage-proxy/providers/types.ts`:

```typescript
// Interface genérica que todos os provedores de cloud storage implementam.
// Edge function despacha pra implementação correta com base em cloud_storage_accounts.provider.

export type ProviderId = 'google_drive' | 'onedrive' | 'dropbox'

export type AccountInfo = {
  email: string
  userId: string
  displayName?: string
}

export type QuotaInfo = {
  total: number    // bytes
  used: number     // bytes
  available: number
}

export type UploadSession = {
  sessionUrl: string
  sessionId: string
  expiresAt: string
}

export type FileInfo = {
  fileId: string
  size: number
  mimeType: string
  createdAt: string
  modifiedAt: string
}

export type OAuthInitResult = {
  authUrl: string
  state: string
}

export type TokenSet = {
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: string
}

export interface CloudStorageProvider {
  id: ProviderId
  displayName: string

  // OAuth
  initOAuth(redirectUri: string, state: string): OAuthInitResult
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet & { account: AccountInfo }>
  refreshAccessToken(refreshToken: string): Promise<Pick<TokenSet, 'accessToken' | 'accessTokenExpiresAt'>>
  revokeToken(refreshToken: string): Promise<void>

  // Pasta da app
  ensureAppFolder(accessToken: string, folderName: string): Promise<{ folderId: string }>

  // Operações de arquivo (bytes nunca passam pela edge function)
  getQuota(accessToken: string): Promise<QuotaInfo>
  createUploadSession(accessToken: string, params: {
    folderId: string
    filename: string
    size: number
    mimeType: string
  }): Promise<UploadSession>
  generateDownloadUrl(accessToken: string, fileId: string): Promise<{ url: string; expiresAt: string }>
  getFileInfo(accessToken: string, fileId: string): Promise<FileInfo | null>
  deleteFile(accessToken: string, fileId: string): Promise<void>
}

// Erros tipados que provedores podem lançar
export class NotImplementedError extends Error {
  constructor(provider: ProviderId) {
    super(`Provider ${provider} not implemented yet`)
    this.name = 'NotImplementedError'
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly code: 'invalid_grant' | 'quota_exceeded' | 'rate_limited' | 'not_found' | 'unknown',
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(`[${provider}] ${code}: ${message}`)
    this.name = 'ProviderError'
  }
}
```

- [ ] **Step 3: Verificar Deno aceita os imports**

Run: `cd supabase/functions/cloud-storage-proxy && deno check providers/types.ts`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/
git commit -m "feat(edge): tipos compartilhados da interface de provedor"
```

---

## Task 8: Edge function — placeholders OneDrive e Dropbox

**Files:**
- Create: `supabase/functions/cloud-storage-proxy/providers/onedrive.ts`
- Create: `supabase/functions/cloud-storage-proxy/providers/dropbox.ts`

- [ ] **Step 1: Criar onedrive.ts placeholder**

Create `supabase/functions/cloud-storage-proxy/providers/onedrive.ts`:

```typescript
import { CloudStorageProvider, NotImplementedError } from './types.ts'

// Placeholder — não implementado no MVP. Mantém o registry tipado.
// Quando OneDrive for implementado, este arquivo é totalmente substituído.
export const oneDriveProvider: CloudStorageProvider = {
  id: 'onedrive',
  displayName: 'OneDrive',

  initOAuth() { throw new NotImplementedError('onedrive') },
  exchangeCode() { throw new NotImplementedError('onedrive') },
  refreshAccessToken() { throw new NotImplementedError('onedrive') },
  revokeToken() { throw new NotImplementedError('onedrive') },
  ensureAppFolder() { throw new NotImplementedError('onedrive') },
  getQuota() { throw new NotImplementedError('onedrive') },
  createUploadSession() { throw new NotImplementedError('onedrive') },
  generateDownloadUrl() { throw new NotImplementedError('onedrive') },
  getFileInfo() { throw new NotImplementedError('onedrive') },
  deleteFile() { throw new NotImplementedError('onedrive') },
}
```

- [ ] **Step 2: Criar dropbox.ts placeholder**

Create `supabase/functions/cloud-storage-proxy/providers/dropbox.ts`:

```typescript
import { CloudStorageProvider, NotImplementedError } from './types.ts'

// Placeholder — não implementado no MVP.
export const dropboxProvider: CloudStorageProvider = {
  id: 'dropbox',
  displayName: 'Dropbox',

  initOAuth() { throw new NotImplementedError('dropbox') },
  exchangeCode() { throw new NotImplementedError('dropbox') },
  refreshAccessToken() { throw new NotImplementedError('dropbox') },
  revokeToken() { throw new NotImplementedError('dropbox') },
  ensureAppFolder() { throw new NotImplementedError('dropbox') },
  getQuota() { throw new NotImplementedError('dropbox') },
  createUploadSession() { throw new NotImplementedError('dropbox') },
  generateDownloadUrl() { throw new NotImplementedError('dropbox') },
  getFileInfo() { throw new NotImplementedError('dropbox') },
  deleteFile() { throw new NotImplementedError('dropbox') },
}
```

- [ ] **Step 3: Verificar tipos**

Run: `cd supabase/functions/cloud-storage-proxy && deno check providers/onedrive.ts providers/dropbox.ts`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/providers/onedrive.ts supabase/functions/cloud-storage-proxy/providers/dropbox.ts
git commit -m "feat(edge): placeholders OneDrive e Dropbox"
```

---

## Task 9: Edge function — Google Drive provider (parte 1: OAuth)

**Files:**
- Create: `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`
- Create: `supabase/functions/cloud-storage-proxy/tests/google-drive-oauth.test.ts`

- [ ] **Step 1: Criar arquivo google-drive.ts com função `initOAuth`**

Create `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`:

```typescript
import {
  CloudStorageProvider,
  ProviderError,
  AccountInfo,
  TokenSet,
  OAuthInitResult,
  QuotaInfo,
  UploadSession,
  FileInfo,
} from './types.ts'

const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new ProviderError('google_drive', 'unknown', 'Missing GOOGLE_OAUTH_CLIENT_ID/SECRET env')
  }
  return { clientId, clientSecret }
}

export const googleDriveProvider: CloudStorageProvider = {
  id: 'google_drive',
  displayName: 'Google Drive',

  initOAuth(redirectUri: string, state: string): OAuthInitResult {
    const { clientId } = getClientCreds()
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      state,
      access_type: 'offline',
      prompt: 'consent', // força refresh_token mesmo se usuário já autorizou antes
    })
    return {
      authUrl: `${AUTH_URL}?${params.toString()}`,
      state,
    }
  },

  async exchangeCode(code: string, redirectUri: string): Promise<TokenSet & { account: AccountInfo }> {
    const { clientId, clientSecret } = getClientCreds()
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new ProviderError('google_drive', 'invalid_grant', `Token exchange failed: ${err}`)
    }
    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!userRes.ok) {
      throw new ProviderError('google_drive', 'unknown', 'Failed to fetch user info')
    }
    const userInfo = await userRes.json() as { sub: string; email: string; name?: string }

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      account: {
        email: userInfo.email,
        userId: userInfo.sub,
        displayName: userInfo.name,
      },
    }
  },

  async refreshAccessToken(refreshToken: string): Promise<Pick<TokenSet, 'accessToken' | 'accessTokenExpiresAt'>> {
    const { clientId, clientSecret } = getClientCreds()
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const err = await res.text()
      const code = err.includes('invalid_grant') ? 'invalid_grant' : 'unknown'
      throw new ProviderError('google_drive', code, `Refresh failed: ${err}`)
    }
    const tokens = await res.json() as { access_token: string; expires_in: number }
    return {
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }
  },

  async revokeToken(refreshToken: string): Promise<void> {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
    // Não falhamos se revoke falhar — pode ser que o token já estava inválido.
  },

  // Métodos restantes implementados em tasks subsequentes
  ensureAppFolder() { throw new Error('Not yet implemented — task 10') },
  getQuota() { throw new Error('Not yet implemented — task 10') },
  createUploadSession() { throw new Error('Not yet implemented — task 11') },
  generateDownloadUrl() { throw new Error('Not yet implemented — task 11') },
  getFileInfo() { throw new Error('Not yet implemented — task 11') },
  deleteFile() { throw new Error('Not yet implemented — task 11') },
}
```

- [ ] **Step 2: Criar teste de initOAuth e exchangeCode**

Create `supabase/functions/cloud-storage-proxy/tests/google-drive-oauth.test.ts`:

```typescript
import { assertEquals, assertExists, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { googleDriveProvider } from '../providers/google-drive.ts'
import { ProviderError } from '../providers/types.ts'

Deno.test('initOAuth — gera URL com scope e state', () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'fake-id')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'fake-secret')

  const result = googleDriveProvider.initOAuth('https://app.example/cb', 'nonce-xyz')

  assertExists(result.authUrl)
  assertEquals(result.state, 'nonce-xyz')

  const url = new URL(result.authUrl)
  assertEquals(url.hostname, 'accounts.google.com')
  assertEquals(url.searchParams.get('client_id'), 'fake-id')
  assertEquals(url.searchParams.get('redirect_uri'), 'https://app.example/cb')
  assertEquals(url.searchParams.get('state'), 'nonce-xyz')
  assertEquals(url.searchParams.get('access_type'), 'offline')
  assertEquals(url.searchParams.get('prompt'), 'consent')

  const scope = url.searchParams.get('scope')
  assertExists(scope)
  if (!scope.includes('drive.file')) throw new Error('scope deve incluir drive.file')
})

Deno.test('initOAuth — falha sem env vars', () => {
  Deno.env.delete('GOOGLE_OAUTH_CLIENT_ID')
  Deno.env.delete('GOOGLE_OAUTH_CLIENT_SECRET')

  try {
    googleDriveProvider.initOAuth('cb', 'state')
    throw new Error('deveria ter lançado erro')
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e
    assertEquals(e.code, 'unknown')
  }
})

Deno.test('exchangeCode — trata 400 do Google como invalid_grant', async () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'id')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'secret')

  // Mock fetch global
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('invalid code', { status: 400 })

  try {
    await assertRejects(
      () => googleDriveProvider.exchangeCode('bad-code', 'cb'),
      ProviderError,
      'invalid_grant'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

- [ ] **Step 3: Rodar testes**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-env --allow-net tests/google-drive-oauth.test.ts`
Expected: 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/providers/google-drive.ts supabase/functions/cloud-storage-proxy/tests/google-drive-oauth.test.ts
git commit -m "feat(edge): provider Google Drive — OAuth (initOAuth/exchange/refresh/revoke)"
```

---

## Task 10: Google Drive provider — pasta + quota

**Files:**
- Modify: `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`
- Create: `supabase/functions/cloud-storage-proxy/tests/google-drive-folder-quota.test.ts`

- [ ] **Step 1: Escrever teste pra ensureAppFolder**

Create `supabase/functions/cloud-storage-proxy/tests/google-drive-folder-quota.test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { googleDriveProvider } from '../providers/google-drive.ts'

Deno.test('ensureAppFolder — cria pasta se não existe', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls++
    const u = String(url)
    if (u.includes('files?q=')) {
      // busca: retorna vazio (pasta não existe)
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }
    if (u.endsWith('/files') && init?.method === 'POST') {
      // create: retorna o ID novo
      return new Response(JSON.stringify({ id: 'folder-123' }), { status: 200 })
    }
    return new Response('unexpected', { status: 500 })
  }

  try {
    const result = await googleDriveProvider.ensureAppFolder('token-abc', 'Leviticus')
    assertEquals(result.folderId, 'folder-123')
    assertEquals(calls, 2) // 1 search + 1 create
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('ensureAppFolder — reusa pasta existente', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(
      JSON.stringify({ files: [{ id: 'existing-456', name: 'Leviticus' }] }),
      { status: 200 }
    )
  }

  try {
    const result = await googleDriveProvider.ensureAppFolder('token-abc', 'Leviticus')
    assertEquals(result.folderId, 'existing-456')
    assertEquals(calls, 1) // só search, sem create
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('getQuota — parseia storageQuota corretamente', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    storageQuota: { limit: '16106127360', usage: '5368709120' } // 15 GB, 5 GB usados
  }), { status: 200 })

  try {
    const q = await googleDriveProvider.getQuota('token')
    assertEquals(q.total, 16106127360)
    assertEquals(q.used, 5368709120)
    assertEquals(q.available, 16106127360 - 5368709120)
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

- [ ] **Step 2: Rodar teste e ver falha**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-env --allow-net tests/google-drive-folder-quota.test.ts`
Expected: FAIL — "Not yet implemented — task 10"

- [ ] **Step 3: Implementar ensureAppFolder e getQuota**

Edit `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`. Substituir os stubs por:

```typescript
async ensureAppFolder(accessToken: string, folderName: string): Promise<{ folderId: string }> {
  // 1. Procura pasta existente (criada pelo próprio app via drive.file scope)
  const query = encodeURIComponent(
    `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )
  const searchRes = await fetch(`${DRIVE_API}/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!searchRes.ok) {
    throw new ProviderError('google_drive', 'unknown', `Folder search failed: ${await searchRes.text()}`)
  }
  const searchData = await searchRes.json() as { files: Array<{ id: string; name: string }> }
  if (searchData.files.length > 0) {
    return { folderId: searchData.files[0].id }
  }

  // 2. Cria pasta
  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  if (!createRes.ok) {
    throw new ProviderError('google_drive', 'unknown', `Folder create failed: ${await createRes.text()}`)
  }
  const folder = await createRes.json() as { id: string }
  return { folderId: folder.id }
},

async getQuota(accessToken: string): Promise<QuotaInfo> {
  const res = await fetch(`${DRIVE_API}/about?fields=storageQuota`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new ProviderError('google_drive', 'unknown', `Quota check failed: ${await res.text()}`)
  }
  const data = await res.json() as { storageQuota: { limit?: string; usage?: string } }
  const total = parseInt(data.storageQuota.limit ?? '0', 10)
  const used = parseInt(data.storageQuota.usage ?? '0', 10)
  return { total, used, available: Math.max(0, total - used) }
},
```

- [ ] **Step 4: Rodar testes e verificar que passam**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-env --allow-net tests/google-drive-folder-quota.test.ts`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/providers/google-drive.ts supabase/functions/cloud-storage-proxy/tests/google-drive-folder-quota.test.ts
git commit -m "feat(edge): Google Drive — ensureAppFolder + getQuota"
```

---

## Task 11: Google Drive provider — upload, download, file info, delete

**Files:**
- Modify: `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`
- Create: `supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts`

- [ ] **Step 1: Escrever teste pros 4 métodos**

Create `supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts`:

```typescript
import { assertEquals, assertExists, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { googleDriveProvider } from '../providers/google-drive.ts'
import { ProviderError } from '../providers/types.ts'

Deno.test('createUploadSession — devolve resumable upload URL', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    const headers = new Headers()
    headers.set('location', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=xyz')
    return new Response(null, { status: 200, headers })
  }

  try {
    const session = await googleDriveProvider.createUploadSession('token', {
      folderId: 'folder-1',
      filename: 'song.opus',
      size: 1024,
      mimeType: 'audio/opus',
    })
    assertExists(session.sessionUrl)
    assertExists(session.sessionId)
    assertEquals(session.sessionId, 'xyz')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('generateDownloadUrl — anexa access_token como query', async () => {
  const result = await googleDriveProvider.generateDownloadUrl('access-tok', 'file-99')
  if (!result.url.includes('file-99')) throw new Error('url deve referenciar file_id')
  if (!result.url.includes('alt=media')) throw new Error('url deve usar alt=media pra download direto')
  assertExists(result.expiresAt)
})

Deno.test('getFileInfo — retorna metadata', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: 'f1', size: '12345', mimeType: 'audio/opus',
    createdTime: '2026-05-15T00:00:00Z', modifiedTime: '2026-05-15T00:01:00Z',
  }), { status: 200 })

  try {
    const info = await googleDriveProvider.getFileInfo('tok', 'f1')
    assertExists(info)
    assertEquals(info.fileId, 'f1')
    assertEquals(info.size, 12345)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('getFileInfo — retorna null se 404', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('not found', { status: 404 })

  try {
    const info = await googleDriveProvider.getFileInfo('tok', 'gone')
    assertEquals(info, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('deleteFile — chama DELETE no endpoint correto', async () => {
  const originalFetch = globalThis.fetch
  let called = ''
  globalThis.fetch = async (url, init) => {
    called = `${init?.method} ${url}`
    return new Response(null, { status: 204 })
  }

  try {
    await googleDriveProvider.deleteFile('tok', 'doomed-file')
    if (!called.includes('DELETE')) throw new Error('deve usar método DELETE')
    if (!called.includes('doomed-file')) throw new Error('url deve referenciar file_id')
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

- [ ] **Step 2: Rodar e ver falha**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-env --allow-net tests/google-drive-files.test.ts`
Expected: FAIL — "Not yet implemented — task 11"

- [ ] **Step 3: Implementar os 4 métodos**

Edit `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`. Substituir os stubs restantes:

```typescript
async createUploadSession(accessToken, params): Promise<UploadSession> {
  const metadata = {
    name: params.filename,
    parents: [params.folderId],
  }
  const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': params.mimeType,
      'X-Upload-Content-Length': String(params.size),
    },
    body: JSON.stringify(metadata),
  })
  if (!res.ok) {
    const text = await res.text()
    const code = text.includes('storageQuotaExceeded') ? 'quota_exceeded' : 'unknown'
    throw new ProviderError('google_drive', code, `Upload session failed: ${text}`)
  }
  const sessionUrl = res.headers.get('location')
  if (!sessionUrl) throw new ProviderError('google_drive', 'unknown', 'Missing Location header')
  // Extrai upload_id da URL
  const sessionId = new URL(sessionUrl).searchParams.get('upload_id') ?? sessionUrl
  // Sessions Google Drive expiram em 7 dias
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  return { sessionUrl, sessionId, expiresAt }
},

async generateDownloadUrl(accessToken: string, fileId: string): Promise<{ url: string; expiresAt: string }> {
  // Google Drive não emite URLs pre-assinadas. Em vez disso, devolvemos
  // a URL da API com access_token via querystring — válido por ~1h.
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&access_token=${encodeURIComponent(accessToken)}`
  // Validade ≈ vida do access_token (refreshado pela edge function antes de expirar)
  const expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString()
  return { url, expiresAt }
},

async getFileInfo(accessToken: string, fileId: string): Promise<FileInfo | null> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,size,mimeType,createdTime,modifiedTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new ProviderError('google_drive', 'unknown', `File info failed: ${await res.text()}`)
  const data = await res.json() as {
    id: string; size: string; mimeType: string; createdTime: string; modifiedTime: string
  }
  return {
    fileId: data.id,
    size: parseInt(data.size, 10),
    mimeType: data.mimeType,
    createdAt: data.createdTime,
    modifiedAt: data.modifiedTime,
  }
},

async deleteFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return // já apagado, ok
  if (!res.ok) throw new ProviderError('google_drive', 'unknown', `Delete failed: ${await res.text()}`)
},
```

- [ ] **Step 4: Rodar testes e verificar que passam**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-env --allow-net tests/google-drive-files.test.ts`
Expected: 5/5 pass

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/providers/google-drive.ts supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts
git commit -m "feat(edge): Google Drive — upload session, download URL, file info, delete"
```

---

## Task 12: Edge function — registry

**Files:**
- Create: `supabase/functions/cloud-storage-proxy/providers/registry.ts`
- Create: `supabase/functions/cloud-storage-proxy/tests/registry.test.ts`

- [ ] **Step 1: Criar registry**

Create `supabase/functions/cloud-storage-proxy/providers/registry.ts`:

```typescript
import { CloudStorageProvider, ProviderId } from './types.ts'
import { googleDriveProvider } from './google-drive.ts'
import { oneDriveProvider } from './onedrive.ts'
import { dropboxProvider } from './dropbox.ts'

const REGISTRY: Record<ProviderId, CloudStorageProvider> = {
  google_drive: googleDriveProvider,
  onedrive: oneDriveProvider,
  dropbox: dropboxProvider,
}

export function getProvider(id: ProviderId): CloudStorageProvider {
  const p = REGISTRY[id]
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return p
}

export function listImplementedProviderIds(): ProviderId[] {
  return (Object.keys(REGISTRY) as ProviderId[]).filter((id) => {
    try {
      // initOAuth nos placeholders lança NotImplementedError
      REGISTRY[id].initOAuth('test', 'test')
      return true
    } catch {
      return false
    }
  })
}
```

- [ ] **Step 2: Criar teste**

Create `supabase/functions/cloud-storage-proxy/tests/registry.test.ts`:

```typescript
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getProvider, listImplementedProviderIds } from '../providers/registry.ts'

Deno.test('getProvider — retorna implementação concreta pra google_drive', () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'x')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'y')

  const p = getProvider('google_drive')
  assertEquals(p.id, 'google_drive')
  assertEquals(p.displayName, 'Google Drive')
})

Deno.test('getProvider — onedrive retorna placeholder', () => {
  const p = getProvider('onedrive')
  assertEquals(p.id, 'onedrive')
  // chamar qualquer método lança NotImplementedError
  assertThrows(() => p.initOAuth('cb', 'state'), Error, 'not implemented')
})

Deno.test('listImplementedProviderIds — só google_drive no MVP', () => {
  Deno.env.set('GOOGLE_OAUTH_CLIENT_ID', 'x')
  Deno.env.set('GOOGLE_OAUTH_CLIENT_SECRET', 'y')
  const ids = listImplementedProviderIds()
  assertEquals(ids, ['google_drive'])
})
```

- [ ] **Step 3: Rodar teste**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-env --allow-net tests/registry.test.ts`
Expected: 3/3 pass

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/providers/registry.ts supabase/functions/cloud-storage-proxy/tests/registry.test.ts
git commit -m "feat(edge): registry de provedores"
```

---

## Task 13: Edge function — crypto wrapper (pgsodium)

**Files:**
- Create: `supabase/functions/cloud-storage-proxy/crypto.ts`
- Create: `supabase/functions/cloud-storage-proxy/tests/crypto.test.ts`

- [ ] **Step 1: Criar wrapper de crypto**

Create `supabase/functions/cloud-storage-proxy/crypto.ts`:

```typescript
import { createClient, SupabaseClient } from './deps.ts'

// Criptografa/descriptografa secrets usando pgsodium.crypto_aead_det_encrypt/decrypt.
// Usa uma chave gerenciada pelo Supabase Vault.

const KEY_NAME = 'cloud_storage_refresh_token'

export async function encryptSecret(client: SupabaseClient, plaintext: string): Promise<Uint8Array> {
  // pgsodium expõe a função via RPC.
  const { data, error } = await client.rpc('encrypt_cloud_secret', { plaintext })
  if (error) throw new Error(`Encryption failed: ${error.message}`)
  if (!data) throw new Error('Encryption returned no data')
  return new Uint8Array(data as ArrayBuffer)
}

export async function decryptSecret(client: SupabaseClient, ciphertext: Uint8Array): Promise<string> {
  const { data, error } = await client.rpc('decrypt_cloud_secret', { ciphertext })
  if (error) throw new Error(`Decryption failed: ${error.message}`)
  if (!data) throw new Error('Decryption returned no data')
  return String(data)
}
```

- [ ] **Step 2: Adicionar funções SQL helpers à migration**

Edit `supabase/migrations/20260515000001_cloud_storage.sql`. Adicionar no FINAL do arquivo:

```sql
-- Chave gerenciada pelo Vault pra criptografar refresh_tokens
SELECT pgsodium.create_key(name => 'cloud_storage_refresh_token');

CREATE OR REPLACE FUNCTION encrypt_cloud_secret(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  key_id uuid;
BEGIN
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'cloud_storage_refresh_token' LIMIT 1;
  RETURN pgsodium.crypto_aead_det_encrypt(
    convert_to(plaintext, 'utf8'),
    convert_to('cloud_storage', 'utf8'),  -- additional data (não criptografada, mas autenticada)
    key_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_cloud_secret(ciphertext bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  key_id uuid;
BEGIN
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'cloud_storage_refresh_token' LIMIT 1;
  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(
      ciphertext,
      convert_to('cloud_storage', 'utf8'),
      key_id
    ),
    'utf8'
  );
END;
$$;

-- Restringir execução: somente service_role pode descriptografar
REVOKE EXECUTE ON FUNCTION decrypt_cloud_secret FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION encrypt_cloud_secret FROM PUBLIC;
GRANT EXECUTE ON FUNCTION encrypt_cloud_secret TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_cloud_secret TO service_role;
```

- [ ] **Step 3: Re-aplicar migration**

Run: `supabase db reset`
Expected: aplica sem erros.

- [ ] **Step 4: Criar teste**

Create `supabase/functions/cloud-storage-proxy/tests/crypto.test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from '../deps.ts'
import { encryptSecret, decryptSecret } from '../crypto.ts'

Deno.test('encrypt/decrypt roundtrip preserva o secret', async () => {
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // local dev key
  )

  const plain = 'super-secret-refresh-token-abc123'
  const enc = await encryptSecret(client, plain)
  // Ciphertext deve ser binário e diferente do plaintext
  if (enc.length === 0) throw new Error('Encryption produced empty result')

  const back = await decryptSecret(client, enc)
  assertEquals(back, plain)
})
```

- [ ] **Step 5: Buscar service_role key local**

Run: `supabase status | grep service_role`
Expected: linha com a chave longa. Anotar.

- [ ] **Step 6: Rodar teste com env**

Run:
```bash
cd supabase/functions/cloud-storage-proxy && \
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<cole-aqui> \
deno test --allow-env --allow-net tests/crypto.test.ts
```
Expected: 1/1 pass

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260515000001_cloud_storage.sql supabase/functions/cloud-storage-proxy/crypto.ts supabase/functions/cloud-storage-proxy/tests/crypto.test.ts
git commit -m "feat(edge): pgsodium wrapper pra criptografar refresh_tokens"
```

---

## Task 14: Edge function — auth + permission middleware

**Files:**
- Create: `supabase/functions/cloud-storage-proxy/auth.ts`
- Create: `supabase/functions/cloud-storage-proxy/tests/auth.test.ts`

- [ ] **Step 1: Criar auth.ts**

Create `supabase/functions/cloud-storage-proxy/auth.ts`:

```typescript
import { createClient, SupabaseClient } from './deps.ts'

export type AuthContext = {
  userId: string
  orgId: string
  serviceClient: SupabaseClient    // bypassa RLS
  userClient: SupabaseClient       // respeita RLS do usuário
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing permission: ${permission}`)
    this.name = 'ForbiddenError'
  }
}

export async function authenticate(req: Request, orgId: string): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header')
  }
  const jwt = authHeader.substring('Bearer '.length)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) throw new UnauthorizedError('Invalid JWT')

  const serviceClient = createClient(supabaseUrl, serviceKey)

  // Verificar que o user é membro da org
  const { count, error: memberErr } = await serviceClient
    .from('organization_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userData.user.id)
    .eq('org_id', orgId)

  if (memberErr) throw new Error(`Membership check failed: ${memberErr.message}`)
  if ((count ?? 0) === 0) {
    throw new UnauthorizedError('Not a member of this org')
  }

  return {
    userId: userData.user.id,
    orgId,
    serviceClient,
    userClient,
  }
}

export async function requirePermission(ctx: AuthContext, perm: string): Promise<void> {
  // Owners têm tudo
  const { data: orgRow } = await ctx.serviceClient
    .from('organizations')
    .select('owner_id')
    .eq('id', ctx.orgId)
    .single()
  if (orgRow?.owner_id === ctx.userId) return

  const { count } = await ctx.serviceClient
    .from('user_role_assignments')
    .select('id, role_permissions!inner(permission)', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .eq('org_id', ctx.orgId)
    .eq('role_permissions.permission', perm)

  if ((count ?? 0) === 0) throw new ForbiddenError(perm)
}
```

- [ ] **Step 2: Criar teste de auth**

Create `supabase/functions/cloud-storage-proxy/tests/auth.test.ts`:

```typescript
import { assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { authenticate, UnauthorizedError } from '../auth.ts'

Deno.test('authenticate — sem header rejeita', async () => {
  const req = new Request('http://x/y', { method: 'POST' })
  await assertRejects(() => authenticate(req, 'some-org'), UnauthorizedError, 'Authorization')
})

Deno.test('authenticate — JWT inválido rejeita', async () => {
  Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321')
  Deno.env.set('SUPABASE_ANON_KEY', 'fake-anon-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake-svc-key')

  const req = new Request('http://x/y', {
    method: 'POST',
    headers: { Authorization: 'Bearer not-a-real-jwt' },
  })
  await assertRejects(() => authenticate(req, 'some-org'), UnauthorizedError, 'Invalid JWT')
})

// Teste de integração com Supabase real fica no plano de E2E (plano 4).
// Aqui ficamos só com testes unitários da camada de auth.
```

- [ ] **Step 3: Rodar testes**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-env --allow-net tests/auth.test.ts`
Expected: 2/3 pass (o teste de integração fica skipped por default)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/auth.ts supabase/functions/cloud-storage-proxy/tests/auth.test.ts
git commit -m "feat(edge): auth + permission middleware"
```

---

## Task 15: Edge function — dispatcher index.ts

**Files:**
- Create: `supabase/functions/cloud-storage-proxy/index.ts`

- [ ] **Step 1: Criar dispatcher principal**

Create `supabase/functions/cloud-storage-proxy/index.ts`:

```typescript
import { serve } from './deps.ts'
import { getProvider } from './providers/registry.ts'
import { ProviderId, ProviderError, NotImplementedError } from './providers/types.ts'
import { authenticate, requirePermission, UnauthorizedError, ForbiddenError } from './auth.ts'
import { encryptSecret, decryptSecret } from './crypto.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: unknown): Response {
  console.error('[cloud-storage-proxy] error:', error)
  if (error instanceof UnauthorizedError) return jsonResponse({ error: error.message }, 401)
  if (error instanceof ForbiddenError) return jsonResponse({ error: error.message, permission: error.permission }, 403)
  if (error instanceof NotImplementedError) return jsonResponse({ error: error.message }, 501)
  if (error instanceof ProviderError) {
    const status = error.code === 'quota_exceeded' ? 507 : error.code === 'invalid_grant' ? 401 : 502
    return jsonResponse({ error: error.message, code: error.code, retryable: error.retryable }, status)
  }
  return jsonResponse({ error: 'Internal error' }, 500)
}

// Renova access_token se expirado. Retorna token válido pra uso imediato.
async function ensureFreshAccessToken(serviceClient: any, orgId: string): Promise<{
  provider: ProviderId
  accessToken: string
  appFolderId: string
}> {
  const { data: acct, error } = await serviceClient
    .from('cloud_storage_accounts')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load account: ${error.message}`)
  if (!acct) throw new UnauthorizedError('No cloud storage account for this org')

  const provider = getProvider(acct.provider as ProviderId)
  const expiresAt = acct.access_token_expires_at ? new Date(acct.access_token_expires_at).getTime() : 0
  const margin = 60 * 1000 // refresh 1 min antes de expirar

  if (acct.access_token && expiresAt - margin > Date.now()) {
    return { provider: acct.provider, accessToken: acct.access_token, appFolderId: acct.app_folder_id }
  }

  // Refresh
  const refreshToken = await decryptSecret(serviceClient, new Uint8Array(acct.refresh_token_encrypted))
  const fresh = await provider.refreshAccessToken(refreshToken)
  await serviceClient
    .from('cloud_storage_accounts')
    .update({
      access_token: fresh.accessToken,
      access_token_expires_at: fresh.accessTokenExpiresAt,
    })
    .eq('org_id', orgId)
  return { provider: acct.provider, accessToken: fresh.accessToken, appFolderId: acct.app_folder_id }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/cloud-storage-proxy/, '').replace(/^\//, '') || ''

  try {
    // OAuth callback — não exige auth do usuário (vem do redirect do Google).
    if (path === 'oauth-callback' && req.method === 'GET') {
      return await handleOAuthCallback(url)
    }

    // Demais endpoints exigem auth + payload com org_id.
    const body = req.method === 'GET'
      ? Object.fromEntries(url.searchParams.entries())
      : await req.json().catch(() => ({}))
    const orgId = body.org_id ?? url.searchParams.get('org_id')
    if (!orgId) return jsonResponse({ error: 'org_id required' }, 400)

    const ctx = await authenticate(req, orgId)

    switch (`${req.method} ${path}`) {
      case 'POST oauth-init':
        return await handleOAuthInit(ctx, body)
      case 'POST quota':
        return await handleQuota(ctx)
      case 'POST upload-session':
        return await handleUploadSession(ctx, body)
      case 'POST download-url':
        return await handleDownloadUrl(ctx, body)
      case 'POST file-info':
        return await handleFileInfo(ctx, body)
      case 'DELETE file':
        return await handleDeleteFile(ctx, body)
      case 'POST disconnect':
        return await handleDisconnect(ctx)
      default:
        return jsonResponse({ error: `Unknown endpoint: ${req.method} ${path}` }, 404)
    }
  } catch (err) {
    return errorResponse(err)
  }
})

// Handlers (cada um abaixo só faz dispatch + chama o provider)

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function handleOAuthInit(ctx: any, body: any): Promise<Response> {
  await requirePermission(ctx, 'manage_integrations')
  const provider = getProvider(body.provider as ProviderId)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET')
  if (!stateSecret) return jsonResponse({ error: 'Server misconfigured: OAUTH_STATE_SECRET missing' }, 500)

  const redirectUri = `${supabaseUrl}/functions/v1/cloud-storage-proxy/oauth-callback`
  const statePayload = `${crypto.randomUUID()}:${ctx.orgId}`
  const stateSig = await hmacSign(statePayload, stateSecret)
  const state = `${statePayload}|${stateSig}`

  const result = provider.initOAuth(redirectUri, state)
  return jsonResponse(result)
}

async function handleOAuthCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 })
  }
  const orgId = state.split(':')[1]
  if (!orgId) return new Response('Invalid state', { status: 400 })

  // Decisão: state é assinado em handleOAuthInit usando HMAC-SHA256(state, OAUTH_STATE_SECRET)
  // e validado aqui. Se a validação falhar, abortar.
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET')
  if (!stateSecret) return new Response('Server misconfigured: OAUTH_STATE_SECRET missing', { status: 500 })

  const [statePayload, stateSig] = state.split('|')
  if (!statePayload || !stateSig) return new Response('Malformed state', { status: 400 })
  const expectedSig = await hmacSign(statePayload, stateSecret)
  if (expectedSig !== stateSig) return new Response('Invalid state signature', { status: 400 })

  // statePayload = "nonce:orgId" — reusar parsing acima do statePayload
  const [, payloadOrgId] = statePayload.split(':')
  if (payloadOrgId !== orgId) return new Response('Org mismatch', { status: 400 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceClient = (await import('./deps.ts')).createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const provider = getProvider('google_drive')
  const tokens = await provider.exchangeCode(code, `${supabaseUrl}/functions/v1/cloud-storage-proxy/oauth-callback`)
  const folder = await provider.ensureAppFolder(tokens.accessToken, 'Leviticus')

  const encryptedRefresh = await encryptSecret(serviceClient, tokens.refreshToken)
  await serviceClient.from('cloud_storage_accounts').upsert({
    org_id: orgId,
    provider: 'google_drive',
    account_email: tokens.account.email,
    account_user_id: tokens.account.userId,
    refresh_token_encrypted: encryptedRefresh,
    access_token: tokens.accessToken,
    access_token_expires_at: tokens.accessTokenExpiresAt,
    app_folder_id: folder.folderId,
  })

  // Redireciona pro app via deep link
  return new Response(null, {
    status: 302,
    headers: { Location: `leviticus://oauth-success?org_id=${orgId}` },
  })
}

async function handleQuota(ctx: any): Promise<Response> {
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const quota = await getProvider(provider as ProviderId).getQuota(accessToken)
  // Cache na DB
  await ctx.serviceClient.from('cloud_storage_accounts').update({
    last_quota_total: quota.total,
    last_quota_used: quota.used,
    last_quota_check_at: new Date().toISOString(),
  }).eq('org_id', ctx.orgId)
  return jsonResponse(quota)
}

async function handleUploadSession(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken, appFolderId } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const session = await getProvider(provider as ProviderId).createUploadSession(accessToken, {
    folderId: appFolderId,
    filename: body.filename,
    size: body.size,
    mimeType: body.mime_type,
  })
  return jsonResponse(session)
}

async function handleDownloadUrl(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const result = await getProvider(provider as ProviderId).generateDownloadUrl(accessToken, body.file_id)
  return jsonResponse(result)
}

async function handleFileInfo(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const info = await getProvider(provider as ProviderId).getFileInfo(accessToken, body.file_id)
  return jsonResponse(info)
}

async function handleDeleteFile(ctx: any, body: any): Promise<Response> {
  await requirePermission(ctx, 'manage_integrations')
  const { provider, accessToken } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  await getProvider(provider as ProviderId).deleteFile(accessToken, body.file_id)
  return jsonResponse({ ok: true })
}

async function handleDisconnect(ctx: any): Promise<Response> {
  await requirePermission(ctx, 'manage_integrations')
  const { data: acct } = await ctx.serviceClient
    .from('cloud_storage_accounts')
    .select('refresh_token_encrypted, provider')
    .eq('org_id', ctx.orgId)
    .maybeSingle()
  if (acct) {
    const refreshToken = await decryptSecret(ctx.serviceClient, new Uint8Array(acct.refresh_token_encrypted))
    try {
      await getProvider(acct.provider as ProviderId).revokeToken(refreshToken)
    } catch (e) {
      console.warn('Revoke failed (ignoring):', e)
    }
  }
  await ctx.serviceClient.from('cloud_storage_accounts').delete().eq('org_id', ctx.orgId)
  return jsonResponse({ ok: true })
}
```

- [ ] **Step 2: Deploy local da edge function**

Run: `supabase functions serve cloud-storage-proxy --no-verify-jwt`
Expected: server sobe na porta 54321/functions/v1. Deixar rodando em terminal separado.

- [ ] **Step 3: Smoke test — curl em endpoint inexistente**

Run (em outro terminal):

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/cloud-storage-proxy/whatever \
  -H "Authorization: Bearer fake" \
  -H "Content-Type: application/json" \
  -d '{"org_id": "x"}'
```
Expected: `{"error":"Invalid JWT"}` ou similar (401)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/index.ts
git commit -m "feat(edge): dispatcher cloud-storage-proxy"
```

---

## Task 16: Cliente Tauri — types + client.ts

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/types.ts`
- Create: `apps/desktop/src/lib/cloud-storage/client.ts`
- Create: `apps/desktop/src/lib/cloud-storage/client.test.ts`

- [ ] **Step 1: Criar arquivo de types (re-export do core)**

Create `apps/desktop/src/lib/cloud-storage/types.ts`:

```typescript
// Tipos client-side de cloud storage.
// Re-exporta tipos compartilhados do core e adiciona variantes client-only.
export type {
  ProviderId,
  BackupStatus,
  SongSource,
  CloudStorageAccount,
  QuotaInfo,
  CloudFileInfo,
  UploadSession,
} from '@leviticus/core'

export type EdgeFunctionError = {
  error: string
  code?: 'invalid_grant' | 'quota_exceeded' | 'rate_limited' | 'not_found' | 'unknown'
  permission?: string
  retryable?: boolean
}
```

- [ ] **Step 2: Criar client.ts**

Create `apps/desktop/src/lib/cloud-storage/client.ts`:

```typescript
import { supabase } from '../supabase.js'
import type {
  ProviderId,
  QuotaInfo,
  UploadSession,
  CloudFileInfo,
  EdgeFunctionError,
} from './types.js'

const FUNCTION_NAME = 'cloud-storage-proxy'

async function callEdge<T>(path: string, body: Record<string, unknown>, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) throw new Error('Not authenticated')

  const url = `${supabase.functions.url}/${FUNCTION_NAME}/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const err = data as EdgeFunctionError
    const e = new Error(err.error || 'Edge function error') as Error & EdgeFunctionError
    Object.assign(e, err)
    throw e
  }
  return data as T
}

export async function initOAuth(orgId: string, provider: ProviderId = 'google_drive'): Promise<{ authUrl: string; state: string }> {
  return callEdge('oauth-init', { org_id: orgId, provider })
}

export async function getQuota(orgId: string): Promise<QuotaInfo> {
  return callEdge('quota', { org_id: orgId })
}

export async function createUploadSession(orgId: string, params: {
  filename: string
  size: number
  mimeType: string
}): Promise<UploadSession> {
  return callEdge('upload-session', {
    org_id: orgId,
    filename: params.filename,
    size: params.size,
    mime_type: params.mimeType,
  })
}

export async function generateDownloadUrl(orgId: string, fileId: string): Promise<{ url: string; expiresAt: string }> {
  return callEdge('download-url', { org_id: orgId, file_id: fileId })
}

export async function getFileInfo(orgId: string, fileId: string): Promise<CloudFileInfo | null> {
  return callEdge('file-info', { org_id: orgId, file_id: fileId })
}

export async function deleteFile(orgId: string, fileId: string): Promise<void> {
  await callEdge('file', { org_id: orgId, file_id: fileId }, 'DELETE')
}

export async function disconnect(orgId: string): Promise<void> {
  await callEdge('disconnect', { org_id: orgId })
}
```

- [ ] **Step 3: Criar teste com fetch mockado**

Create `apps/desktop/src/lib/cloud-storage/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'jwt' } } }) },
    functions: { url: 'http://localhost:54321/functions/v1' },
  },
}))

import { initOAuth, getQuota, createUploadSession, generateDownloadUrl } from './client.js'

describe('cloud-storage/client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('initOAuth chama oauth-init com provider', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ authUrl: 'https://x', state: 's' }), { status: 200 })
    )
    const result = await initOAuth('org-1', 'google_drive')
    expect(result.authUrl).toBe('https://x')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/oauth-init'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"provider":"google_drive"'),
      })
    )
  })

  it('getQuota parseia resposta corretamente', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ total: 100, used: 50, available: 50 }), { status: 200 })
    )
    const q = await getQuota('org-1')
    expect(q.total).toBe(100)
    expect(q.available).toBe(50)
  })

  it('lança erro tipado em resposta não-OK', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ error: 'quota exceeded', code: 'quota_exceeded' }), { status: 507 })
    )
    await expect(createUploadSession('org-1', { filename: 'a', size: 1, mimeType: 'b' }))
      .rejects.toMatchObject({ message: 'quota exceeded', code: 'quota_exceeded' })
  })

  it('generateDownloadUrl envia file_id', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://dl', expiresAt: '2026-01-01' }), { status: 200 })
    )
    await generateDownloadUrl('org-1', 'file-42')
    expect((globalThis.fetch as any).mock.calls[0][1].body).toContain('"file_id":"file-42"')
  })
})
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/client.test.ts`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/
git commit -m "feat(cloud-storage): cliente HTTP da edge function"
```

---

## Task 17: Cliente Tauri — upload.ts (resumable)

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/upload.ts`
- Create: `apps/desktop/src/lib/cloud-storage/upload.test.ts`

- [ ] **Step 1: Criar upload.ts**

Create `apps/desktop/src/lib/cloud-storage/upload.ts`:

```typescript
import { readFile } from '@tauri-apps/plugin-fs'
import type { UploadSession } from './types.js'

const CHUNK_SIZE = 8 * 1024 * 1024 // 8 MiB (múltiplo de 256 KiB exigido pelo Google)

export type UploadProgress = {
  uploaded: number  // bytes
  total: number     // bytes
  pct: number       // 0..100
}

export type UploadOptions = {
  filePath: string                              // path absoluto no device
  session: UploadSession                        // criada via client.createUploadSession
  onProgress?: (p: UploadProgress) => void
  signal?: AbortSignal
}

/**
 * Faz upload chunked via Content-Range pro endpoint resumable.
 * Em caso de 5xx, retry com backoff (até 5 tentativas).
 * Retorna quando o último chunk é aceito (server responde 200/201).
 */
export async function uploadResumable(opts: UploadOptions): Promise<void> {
  const fileBytes = await readFile(opts.filePath)
  const total = fileBytes.length
  let offset = 0
  let attempts = 0

  while (offset < total) {
    if (opts.signal?.aborted) throw new Error('Upload aborted')

    const end = Math.min(offset + CHUNK_SIZE, total)
    const chunk = fileBytes.slice(offset, end)
    const contentRange = `bytes ${offset}-${end - 1}/${total}`

    const res = await fetch(opts.session.sessionUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': contentRange,
        'Content-Length': String(chunk.length),
      },
      body: chunk,
      signal: opts.signal,
    })

    if (res.status === 308) {
      // Continue — chunk aceito parcialmente, server pede mais
      const range = res.headers.get('range')
      if (range) {
        // Parse "bytes=0-N" — próxima janela começa em N+1
        const match = range.match(/bytes=\d+-(\d+)/)
        if (match) offset = parseInt(match[1], 10) + 1
        else offset = end
      } else {
        offset = end
      }
      attempts = 0
      opts.onProgress?.({ uploaded: offset, total, pct: Math.round((offset / total) * 100) })
      continue
    }

    if (res.status === 200 || res.status === 201) {
      // Upload completo
      opts.onProgress?.({ uploaded: total, total, pct: 100 })
      return
    }

    if (res.status >= 500 || res.status === 429) {
      // Retry com backoff
      attempts++
      if (attempts > 5) throw new Error(`Upload failed after 5 retries (status ${res.status})`)
      await new Promise((r) => setTimeout(r, Math.min(60_000, 1000 * 2 ** attempts)))
      continue
    }

    // Outros: falha fatal
    const text = await res.text()
    throw new Error(`Upload failed: ${res.status} ${text}`)
  }
}
```

- [ ] **Step 2: Criar teste**

Create `apps/desktop/src/lib/cloud-storage/upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
}))

import { readFile } from '@tauri-apps/plugin-fs'
import { uploadResumable } from './upload.js'

describe('uploadResumable', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('chunked: completa em uma chamada quando arquivo pequeno', async () => {
    ;(readFile as any).mockResolvedValue(new Uint8Array(1024))
    ;(globalThis.fetch as any).mockResolvedValue(new Response(null, { status: 200 }))

    const progress: number[] = []
    await uploadResumable({
      filePath: '/fake/path',
      session: { sessionUrl: 'https://up', sessionId: 's', expiresAt: 'x' },
      onProgress: (p) => progress.push(p.pct),
    })

    expect(progress).toContain(100)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('retry em 503', async () => {
    ;(readFile as any).mockResolvedValue(new Uint8Array(100))
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await uploadResumable({
      filePath: '/x',
      session: { sessionUrl: 'https://u', sessionId: 's', expiresAt: 'x' },
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('falha após 5 retries em 5xx', async () => {
    ;(readFile as any).mockResolvedValue(new Uint8Array(100))
    ;(globalThis.fetch as any).mockResolvedValue(new Response(null, { status: 500 }))

    await expect(
      uploadResumable({
        filePath: '/x',
        session: { sessionUrl: 'https://u', sessionId: 's', expiresAt: 'x' },
      })
    ).rejects.toThrow('5 retries')
  })

  it('respeita signal aborted', async () => {
    ;(readFile as any).mockResolvedValue(new Uint8Array(100))
    const ctrl = new AbortController()
    ctrl.abort()

    await expect(
      uploadResumable({
        filePath: '/x',
        session: { sessionUrl: 'https://u', sessionId: 's', expiresAt: 'x' },
        signal: ctrl.signal,
      })
    ).rejects.toThrow('aborted')
  })
})
```

- [ ] **Step 3: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/upload.test.ts`
Expected: 4/4 pass

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/upload.ts apps/desktop/src/lib/cloud-storage/upload.test.ts
git commit -m "feat(cloud-storage): resumable upload com retry"
```

---

## Task 18: Cliente Tauri — download.ts + verificação de hash

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/download.ts`
- Create: `apps/desktop/src/lib/cloud-storage/download.test.ts`

- [ ] **Step 1: Criar download.ts**

Create `apps/desktop/src/lib/cloud-storage/download.ts`:

```typescript
import { writeFile, exists, remove } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'

export type DownloadProgress = {
  downloaded: number
  total: number
  pct: number
}

export type DownloadOptions = {
  url: string
  destPath: string                  // path absoluto onde salvar
  expectedHash?: string             // SHA-256 hex; se fornecido, valida ao final
  expectedSize?: number
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
}

/**
 * Baixa um arquivo de URL pro filesystem local de forma atômica
 * (escreve em <destPath>.partial e renomeia ao final).
 * Valida hash se fornecido — em caso de mismatch, apaga e lança erro.
 */
export async function downloadToFile(opts: DownloadOptions): Promise<void> {
  const partialPath = `${opts.destPath}.partial`

  // Limpa qualquer .partial órfão
  if (await exists(partialPath)) await remove(partialPath)

  const res = await fetch(opts.url, { signal: opts.signal })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

  const total = parseInt(res.headers.get('content-length') ?? '0', 10) || opts.expectedSize || 0
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const chunks: Uint8Array[] = []
  let downloaded = 0

  while (true) {
    if (opts.signal?.aborted) throw new Error('Download aborted')
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloaded += value.length
    if (total > 0) {
      opts.onProgress?.({
        downloaded,
        total,
        pct: Math.round((downloaded / total) * 100),
      })
    }
  }

  // Concatena
  const buffer = new Uint8Array(downloaded)
  let offset = 0
  for (const c of chunks) {
    buffer.set(c, offset)
    offset += c.length
  }

  await writeFile(partialPath, buffer)

  // Valida hash via Tauri command (calculado no Rust nativo, mais rápido)
  if (opts.expectedHash) {
    const actualHash = await invoke<string>('cloud_storage_hash_file', { path: partialPath })
    if (actualHash !== opts.expectedHash) {
      await remove(partialPath)
      throw new Error(`Hash mismatch: expected ${opts.expectedHash}, got ${actualHash}`)
    }
  }

  // Move atômico
  await invoke('cloud_storage_rename_file', { from: partialPath, to: opts.destPath })
}
```

- [ ] **Step 2: Criar teste**

Create `apps/desktop/src/lib/cloud-storage/download.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
  remove: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { downloadToFile } from './download.js'
import { invoke } from '@tauri-apps/api/core'
import { writeFile, remove } from '@tauri-apps/plugin-fs'

function makeResponseWithBody(content: Uint8Array, total?: number): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(content)
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: total ? { 'content-length': String(total) } : {},
  })
}

describe('downloadToFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('baixa pra .partial e renomeia', async () => {
    const payload = new TextEncoder().encode('hello')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, 5))

    await downloadToFile({ url: 'https://x', destPath: '/dest/song.opus' })

    expect(writeFile).toHaveBeenCalledWith('/dest/song.opus.partial', expect.any(Uint8Array))
    expect(invoke).toHaveBeenCalledWith('cloud_storage_rename_file', {
      from: '/dest/song.opus.partial',
      to: '/dest/song.opus',
    })
  })

  it('valida hash quando fornecido — sucesso', async () => {
    const payload = new TextEncoder().encode('xyz')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, 3))
    ;(invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cloud_storage_hash_file') return Promise.resolve('abc123')
      return Promise.resolve(undefined)
    })

    await downloadToFile({ url: 'https://x', destPath: '/d', expectedHash: 'abc123' })
    expect(remove).not.toHaveBeenCalled()
  })

  it('valida hash — mismatch limpa e lança erro', async () => {
    const payload = new TextEncoder().encode('xyz')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, 3))
    ;(invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'cloud_storage_hash_file') return Promise.resolve('actual-hash')
      return Promise.resolve(undefined)
    })

    await expect(
      downloadToFile({ url: 'https://x', destPath: '/d', expectedHash: 'expected-hash' })
    ).rejects.toThrow('Hash mismatch')
    expect(remove).toHaveBeenCalledWith('/d.partial')
  })

  it('reporta progresso', async () => {
    const payload = new TextEncoder().encode('hello world!!!')
    ;(globalThis.fetch as any).mockResolvedValue(makeResponseWithBody(payload, payload.length))

    const progresses: number[] = []
    await downloadToFile({
      url: 'https://x',
      destPath: '/d',
      onProgress: (p) => progresses.push(p.pct),
    })
    expect(progresses).toContain(100)
  })
})
```

- [ ] **Step 3: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/download.test.ts`
Expected: 4/4 pass

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/download.ts apps/desktop/src/lib/cloud-storage/download.test.ts
git commit -m "feat(cloud-storage): download com verificação de hash"
```

---

## Task 19: Tauri commands — hash + rename

**Files:**
- Create: `apps/desktop/src-tauri/src/cloud_storage.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

- [ ] **Step 1: Adicionar dep sha2**

Edit `apps/desktop/src-tauri/Cargo.toml`. Localizar `[dependencies]` e adicionar (se não existir):

```toml
sha2 = "0.10"
```

- [ ] **Step 2: Criar cloud_storage.rs**

Create `apps/desktop/src-tauri/src/cloud_storage.rs`:

```rust
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::PathBuf;

#[tauri::command]
pub async fn cloud_storage_hash_file(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut file = fs::File::open(&path).map_err(|e| format!("open: {e}"))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let n = file.read(&mut buffer).map_err(|e| format!("read: {e}"))?;
            if n == 0 { break }
            hasher.update(&buffer[..n]);
        }
        let result = hasher.finalize();
        Ok(hex::encode(result))
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn cloud_storage_rename_file(from: String, to: String) -> Result<(), String> {
    let from_path = PathBuf::from(&from);
    let to_path = PathBuf::from(&to);
    tokio::fs::rename(&from_path, &to_path)
        .await
        .map_err(|e| format!("rename {from} -> {to}: {e}"))
}
```

- [ ] **Step 3: Adicionar `hex` dep se não existir**

Edit `apps/desktop/src-tauri/Cargo.toml`:

```toml
hex = "0.4"
```

- [ ] **Step 4: Registrar comandos no lib.rs**

Edit `apps/desktop/src-tauri/src/lib.rs`. No topo do arquivo:

```rust
mod cloud_storage;
```

Localizar a chamada `.invoke_handler(tauri::generate_handler![...])` e adicionar os 2 comandos:

```rust
.invoke_handler(tauri::generate_handler![
    // ... comandos existentes ...
    cloud_storage::cloud_storage_hash_file,
    cloud_storage::cloud_storage_rename_file,
])
```

- [ ] **Step 5: Buildar Rust**

Run: `cd apps/desktop/src-tauri && cargo build`
Expected: build limpo

- [ ] **Step 6: Smoke test com unit test Rust**

Create test inline em `cloud_storage.rs` (no final do arquivo):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[tokio::test]
    async fn test_hash_known_content() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let path = tmp.path().to_string_lossy().to_string();
        tmp.as_file().write_all(b"hello").unwrap();
        let hash = cloud_storage_hash_file(path).await.unwrap();
        // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        assert_eq!(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    }
}
```

Adicionar `tempfile` ao Cargo.toml em `[dev-dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 7: Rodar teste Rust**

Run: `cd apps/desktop/src-tauri && cargo test cloud_storage::tests`
Expected: 1/1 pass

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/cloud_storage.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
git commit -m "feat(tauri): comandos cloud_storage_hash_file + rename_file"
```

---

## Task 20: Cliente Tauri — status.ts (state machine)

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/status.ts`
- Create: `apps/desktop/src/lib/cloud-storage/status.test.ts`

- [ ] **Step 1: Criar status.ts**

Create `apps/desktop/src/lib/cloud-storage/status.ts`:

```typescript
import type { BackupStatus } from './types.js'
import { getDb } from '../db.js'
import { supabase } from '../supabase.js'

/**
 * Transições válidas do backup_status.
 * - pending: padrão; ainda não subiu.
 * - uploaded: subiu com sucesso.
 * - failed: falhou após retries — pendente investigação.
 * - no_account: nenhum cloud_storage_account ativo na org.
 */
const VALID_TRANSITIONS: Record<BackupStatus, BackupStatus[]> = {
  pending: ['uploaded', 'failed', 'no_account'],
  uploaded: ['pending', 'failed'],          // pending se o arquivo foi apagado do Drive
  failed: ['pending', 'uploaded'],          // retry pode levar a uploaded ou voltar a pending
  no_account: ['pending'],                  // ao conectar, vai pra pending
}

export function canTransition(from: BackupStatus, to: BackupStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Atualiza backup_status no Supabase + cache local. Valida transição.
 * Lança se transição inválida.
 */
export async function setBackupStatus(
  songId: string,
  to: BackupStatus,
  extras?: { cloud_file_id?: string | null; cloud_file_size?: number | null; cloud_file_hash?: string | null }
): Promise<void> {
  const db = await getDb()
  const rows = await db.select<{ backup_status: BackupStatus }[]>(
    `SELECT backup_status FROM songs WHERE id = ?`,
    [songId]
  )
  const from = rows[0]?.backup_status ?? 'pending'
  if (from === to && !extras) return  // no-op
  if (from !== to && !canTransition(from, to)) {
    throw new Error(`Invalid backup_status transition: ${from} -> ${to}`)
  }

  const update: Record<string, unknown> = { backup_status: to }
  if (extras?.cloud_file_id !== undefined) update.cloud_file_id = extras.cloud_file_id
  if (extras?.cloud_file_size !== undefined) update.cloud_file_size = extras.cloud_file_size
  if (extras?.cloud_file_hash !== undefined) update.cloud_file_hash = extras.cloud_file_hash

  const { error } = await supabase.from('songs').update(update).eq('id', songId)
  if (error) throw new Error(`Supabase update failed: ${error.message}`)

  // Atualiza cache local
  const setClauses = Object.keys(update).map((k) => `${k} = ?`).join(', ')
  const values = Object.values(update)
  await db.execute(`UPDATE songs SET ${setClauses} WHERE id = ?`, [...values, songId])
}
```

- [ ] **Step 2: Criar teste**

Create `apps/desktop/src/lib/cloud-storage/status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbMock = {
  select: vi.fn(),
  execute: vi.fn(),
}
vi.mock('../db.js', () => ({ getDb: vi.fn().mockResolvedValue(dbMock) }))
vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  },
}))

import { canTransition, setBackupStatus } from './status.js'

describe('canTransition', () => {
  it('pending → uploaded é válido', () => {
    expect(canTransition('pending', 'uploaded')).toBe(true)
  })
  it('uploaded → uploaded é "no-op" mas tratado como sem transição', () => {
    // canTransition compara from === to externo. Aqui: uploaded NÃO está em VALID_TRANSITIONS.uploaded
    expect(canTransition('uploaded', 'uploaded')).toBe(false)
  })
  it('no_account → pending é válido', () => {
    expect(canTransition('no_account', 'pending')).toBe(true)
  })
  it('uploaded → no_account é inválido', () => {
    expect(canTransition('uploaded', 'no_account')).toBe(false)
  })
})

describe('setBackupStatus', () => {
  beforeEach(() => {
    dbMock.select.mockReset()
    dbMock.execute.mockReset()
  })

  it('chama Supabase update + execute local', async () => {
    dbMock.select.mockResolvedValue([{ backup_status: 'pending' }])
    dbMock.execute.mockResolvedValue(undefined)

    await setBackupStatus('song-1', 'uploaded', { cloud_file_id: 'f1', cloud_file_size: 100, cloud_file_hash: 'abc' })

    expect(dbMock.execute).toHaveBeenCalled()
  })

  it('rejeita transição inválida', async () => {
    dbMock.select.mockResolvedValue([{ backup_status: 'uploaded' }])
    await expect(setBackupStatus('song-1', 'no_account')).rejects.toThrow('Invalid')
  })
})
```

- [ ] **Step 3: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/status.test.ts`
Expected: 6/6 pass

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/status.ts apps/desktop/src/lib/cloud-storage/status.test.ts
git commit -m "feat(cloud-storage): máquina de estados de backup_status"
```

---

## Task 21: Deep link setup — tauri-plugin-deep-link

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Adicionar dependência Rust**

Edit `apps/desktop/src-tauri/Cargo.toml`. Em `[dependencies]`:

```toml
tauri-plugin-deep-link = "2"
```

- [ ] **Step 2: Adicionar dep JS**

Edit `apps/desktop/package.json`. Em `dependencies`:

```json
"@tauri-apps/plugin-deep-link": "^2.0.0",
```

Run: `cd apps/desktop && pnpm install`
Expected: instala sem erros.

- [ ] **Step 3: Registrar plugin no Rust**

Edit `apps/desktop/src-tauri/src/lib.rs`. Localizar `.plugin(...)` chain e adicionar:

```rust
.plugin(tauri_plugin_deep_link::init())
```

- [ ] **Step 4: Registrar protocolo no tauri.conf.json**

Edit `apps/desktop/src-tauri/tauri.conf.json`. Adicionar (ou completar) bloco em `plugins`:

```json
"plugins": {
  "deep-link": {
    "desktop": {
      "schemes": ["leviticus"]
    }
  }
}
```

E em `bundle.macOS`:

```json
"macOS": {
  ...
}
```

(no Info.plist: o plugin gera automaticamente a entry via configuração — não precisa editar manualmente)

- [ ] **Step 5: Habilitar permissão no default.json**

Edit `apps/desktop/src-tauri/capabilities/default.json`. Adicionar em `permissions`:

```json
"deep-link:default",
"deep-link:allow-get-current"
```

- [ ] **Step 6: Buildar e validar**

Run: `cd apps/desktop && pnpm tauri build --debug` (timeout 600s — pode demorar)
Expected: build completa. Se falhar, ajustar capabilities.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock \
        apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tauri.conf.json \
        apps/desktop/src-tauri/capabilities/default.json apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "feat(tauri): instala tauri-plugin-deep-link e registra protocolo leviticus://"
```

---

## Task 22: HTTP allow-list pra Supabase functions + Google APIs

**Files:**
- Modify: `apps/desktop/src-tauri/capabilities/default.json`

- [ ] **Step 1: Inspecionar permissões atuais**

Run: `cat apps/desktop/src-tauri/capabilities/default.json | grep -A 5 "http"`
Expected: ver bloco com URLs permitidas atuais (127.0.0.1 e *.supabase.co)

- [ ] **Step 2: Adicionar URLs necessárias pro Google e upload sessions**

Edit `apps/desktop/src-tauri/capabilities/default.json`. Localizar a entrada `http:allow-fetch` (ou similar) e adicionar URLs:

```json
{
  "identifier": "http:default",
  "allow": [
    { "url": "http://127.0.0.1:54321/**" },
    { "url": "https://*.supabase.co/**" },
    { "url": "https://*.supabase.io/**" },
    { "url": "https://www.googleapis.com/**" },
    { "url": "https://accounts.google.com/**" },
    { "url": "https://oauth2.googleapis.com/**" }
  ]
}
```

(adequar à estrutura exata do arquivo existente)

- [ ] **Step 3: Rebuild**

Run: `cd apps/desktop && pnpm tauri build --debug`
Expected: build limpo

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/capabilities/default.json
git commit -m "feat(tauri): permite fetch pra Google APIs + supabase functions"
```

---

## Task 23: Test de integração end-to-end (entre módulos)

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/integration.test.ts`

- [ ] **Step 1: Criar teste que monta o fluxo completo (cliente → mocked edge → mocked Google)**

Create `apps/desktop/src/lib/cloud-storage/integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'jwt' } } }) },
    functions: { url: 'http://localhost:54321/functions/v1' },
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  },
}))
vi.mock('../db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([{ backup_status: 'pending' }]),
    execute: vi.fn(),
  }),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  writeFile: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
  remove: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd) => {
    if (cmd === 'cloud_storage_hash_file') return Promise.resolve('hash-abc')
    return Promise.resolve(undefined)
  }),
}))

import { createUploadSession } from './client.js'
import { uploadResumable } from './upload.js'
import { setBackupStatus } from './status.js'

describe('integração: upload happy path', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('cria sessão, faz upload, marca como uploaded', async () => {
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce(new Response(  // edge function: upload-session
        JSON.stringify({ sessionUrl: 'https://up', sessionId: 's1', expiresAt: 'x' }),
        { status: 200 }
      ))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))  // PUT do upload

    const session = await createUploadSession('org-1', { filename: 'a.opus', size: 3, mimeType: 'audio/opus' })
    expect(session.sessionUrl).toBe('https://up')

    await uploadResumable({ filePath: '/x', session })

    await setBackupStatus('song-1', 'uploaded', { cloud_file_id: 'f1', cloud_file_size: 3, cloud_file_hash: 'hash-abc' })
  })
})
```

- [ ] **Step 2: Rodar**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/integration.test.ts`
Expected: 1/1 pass

- [ ] **Step 3: Rodar TODOS os testes do módulo cloud-storage juntos**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/`
Expected: todos passam (clientes + upload + download + status + integração)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/integration.test.ts
git commit -m "test(cloud-storage): integração upload happy path"
```

---

## Task 24: Smoke test manual + deploy edge function

**Files:**
- (sem mudanças de código — só validação manual)

- [ ] **Step 1: Validar typecheck do app**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS, sem warnings de unused

- [ ] **Step 2: Validar todos os testes**

Run: `cd apps/desktop && pnpm test` e `cd packages/core && pnpm test`
Expected: tudo passa

- [ ] **Step 3: Deploy local da edge function (validação manual)**

Run: `supabase functions serve cloud-storage-proxy`
Em outro terminal:

```bash
# Validar 404 em endpoint inexistente
curl -i -X POST http://127.0.0.1:54321/functions/v1/cloud-storage-proxy/foo \
  -H "Authorization: Bearer $(supabase status | grep anon | awk '{print $NF}')" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"00000000-0000-0000-0000-000000000000"}'

# Esperado: 401 (org não existe) ou 404. Não deve ser 500.
```

- [ ] **Step 4: Deploy remoto (manual — quando estiver pronto)**

Run: `supabase functions deploy cloud-storage-proxy --no-verify-jwt`
Expected: deploy completa. Vê URL final.

- [ ] **Step 5: Documentar status no plan**

Editar manualmente este arquivo e marcar com `[x]` os steps concluídos. Anotar URL da function deployada em comentário.

- [ ] **Step 6: Commit final do plano**

```bash
git add docs/superpowers/plans/2026-05-15-cloud-storage-foundation.md
git commit -m "docs(plan): marca plano 1 como completo"
```

---

## Critérios de aceitação (DoD do plano 1)

Antes de partir pro plano 2, garantir que:

- [ ] Migration Supabase aplica sem erros (`supabase db reset`)
- [ ] Migration SQLite aplica sem erros (app sobe em dev)
- [ ] Todos os testes vitest passam (`pnpm test` no monorepo)
- [ ] Todos os testes Deno passam (`deno test --allow-env --allow-net supabase/functions/cloud-storage-proxy/tests/`)
- [ ] Todos os testes Rust passam (`cargo test` em src-tauri)
- [ ] Edge function deploy funciona local (`supabase functions serve cloud-storage-proxy`)
- [ ] App buildia sem erros (`pnpm tauri build --debug`)
- [ ] Typecheck passa (`pnpm typecheck`)
- [ ] Permissão `manage_integrations` aparece no type Permission
- [ ] Schema novo está documentado no CLAUDE.md se mudou padrão (não esperado neste plano)

**Nada visível pra usuário foi alterado.** A UI dos planos 2-4 vai consumir essa fundação.
