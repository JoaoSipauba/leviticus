# Cloud storage: banner falso + dedup de upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o banner falso "Sem backup configurado" (#121) e parar de gerar arquivos duplicados no Drive (#122).

**Architecture:** #121 — `refreshAccount` distingue "cache não sincronizado" (`unknown`) de "sem conta confirmado" (`disconnected`), e o boot re-checa o status após o `syncOrg`. #122 — guard in-flight no client mata a race intra-device; idempotência na edge function (busca arquivo existente antes de criar sessão) mata a race inter-device.

**Tech Stack:** React 18 + TypeScript + Zustand (desktop), Vitest, Deno (edge function `cloud-storage-proxy`), Google Drive API.

**Spec:** `docs/superpowers/specs/2026-05-21-cloud-storage-banner-and-upload-dedup-design.md`

---

## File Structure

- `apps/desktop/src/store/integrations.ts` — `refreshAccount` distingue `unknown`/`disconnected` (Task 1)
- `apps/desktop/src/store/integrations.test.ts` — testes do novo comportamento (Task 1)
- `apps/desktop/src/App.tsx` — re-checa status após `syncOrg` no boot (Task 2)
- `apps/desktop/src/lib/cloud-storage/upload-song.ts` — guard in-flight + handling de `alreadyExists` (Tasks 3, 6)
- `apps/desktop/src/lib/cloud-storage/upload-song.test.ts` — testes (Tasks 3, 6)
- `apps/desktop/src/lib/cloud-storage/types.ts` — tipo `UploadSessionResult` (Task 6)
- `apps/desktop/src/lib/cloud-storage/client.ts` — `createUploadSession` retorna a union (Task 6)
- `supabase/functions/cloud-storage-proxy/providers/types.ts` — assinatura `findFileInFolder` (Task 4)
- `supabase/functions/cloud-storage-proxy/providers/google-drive.ts` — implementação (Task 4)
- `supabase/functions/cloud-storage-proxy/providers/onedrive.ts` — stub (Task 4)
- `supabase/functions/cloud-storage-proxy/providers/dropbox.ts` — stub (Task 4)
- `supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts` — testes do provider (Task 4)
- `supabase/functions/cloud-storage-proxy/index.ts` — `handleUploadSession` usa `findFileInFolder` (Task 5)

---

## Task 1: #121 — refreshAccount distingue `unknown` de `disconnected`

**Files:**
- Modify: `apps/desktop/src/store/integrations.ts`
- Test: `apps/desktop/src/store/integrations.test.ts`

- [ ] **Step 1: Atualizar o mock de `../lib/db.js` no teste**

Em `apps/desktop/src/store/integrations.test.ts`, o mock atual é:

```ts
vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([]),
  }),
}))
```

Trocar por (adiciona `getLastSync`):

```ts
vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([]),
  }),
  getLastSync: vi.fn().mockResolvedValue(null),
}))
```

E na linha de import logo abaixo dos mocks, trocar:

```ts
import { getDb } from '../lib/db.js'
```

por:

```ts
import { getDb, getLastSync } from '../lib/db.js'
```

- [ ] **Step 2: Reescrever o teste existente de "vazio" e adicionar o caso `unknown`**

Em `integrations.test.ts`, substituir o teste atual:

```ts
  it('refreshAccount marca status disconnected quando vazio', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([])
    await useIntegrationsStore.getState().refreshAccount('o1')
    expect(useIntegrationsStore.getState().status).toBe('disconnected')
  })
```

pelos dois testes abaixo:

```ts
  it('refreshAccount marca disconnected quando vazio e sync já rodou', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([])
    ;(getLastSync as any).mockResolvedValueOnce('2026-05-21T00:00:00Z')
    await useIntegrationsStore.getState().refreshAccount('o1')
    expect(useIntegrationsStore.getState().status).toBe('disconnected')
  })

  it('refreshAccount marca unknown quando vazio e sync nunca rodou', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([])
    ;(getLastSync as any).mockResolvedValueOnce(null)
    await useIntegrationsStore.getState().refreshAccount('o1')
    expect(useIntegrationsStore.getState().status).toBe('unknown')
  })
```

- [ ] **Step 3: Rodar os testes pra verificar que o novo caso falha**

Run: `cd apps/desktop && pnpm vitest run src/store/integrations.test.ts`
Expected: FAIL — "refreshAccount marca unknown quando vazio e sync nunca rodou" falha (status atual seria `disconnected`). Os outros passam.

- [ ] **Step 4: Implementar a distinção em `refreshAccount`**

Em `apps/desktop/src/store/integrations.ts`, trocar o import (linha 3):

```ts
import { getDb } from '../lib/db.js'
```

por:

```ts
import { getDb, getLastSync } from '../lib/db.js'
```

E substituir o branch `else` dentro de `refreshAccount`:

```ts
      } else {
        set({ account: null, quota: null, status: 'disconnected', error: null })
      }
```

por:

```ts
      } else {
        // Cache vazio significa um de dois estados distintos:
        // - sync nunca completou (device recém-aberto): não dá pra concluir
        //   nada → 'unknown' (estado de loading; o banner não aparece nele).
        // - sync já rodou e confirmou ausência de conta → 'disconnected'.
        // Sem essa distinção, um device já configurado mostra o banner falso
        // "Sem backup configurado" no boot, antes do syncOrg popular o cache.
        // Issue #121.
        const lastSync = await getLastSync(orgId)
        set({
          account: null,
          quota: null,
          status: lastSync == null ? 'unknown' : 'disconnected',
          error: null,
        })
      }
```

- [ ] **Step 5: Rodar os testes pra verificar que passam**

Run: `cd apps/desktop && pnpm vitest run src/store/integrations.test.ts`
Expected: PASS — todos os testes do arquivo verdes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/store/integrations.ts apps/desktop/src/store/integrations.test.ts
git commit -m "fix: refreshAccount distingue unknown de disconnected (#121)"
```

---

## Task 2: #121 — re-checar status após `syncOrg` no boot

**Files:**
- Modify: `apps/desktop/src/App.tsx:85`

**Nota de cobertura:** esta task é wiring do `useEffect` de boot do `App.tsx`. Não há suíte de teste pra o boot do `App.tsx` (seria E2E — fora do escopo aqui). A lógica nova de `refreshAccount` já é coberta pela Task 1. A verificação desta task é manual (ver Step 3). Declaração explícita conforme CLAUDE.md ("quando a cobertura realmente não fizer sentido, declare isso explicitamente").

- [ ] **Step 1: Encadear `refreshAccount` após o `syncOrg`**

Em `apps/desktop/src/App.tsx`, localizar o início da cadeia de promises no `useEffect` de boot (a partir da linha 85):

```ts
            syncOrg(orgId)
              .then(() => cleanupAudioOrphans())
```

Substituir por:

```ts
            syncOrg(orgId)
              .then(() => {
                // Re-checa o status de cloud agora que o syncOrg populou
                // cloud_storage_accounts no SQLite. Sem isso, o refreshAccount
                // do boot (rodado antes do sync, App.tsx:215) deixa o store
                // preso em 'unknown' num device já configurado, e o banner
                // falso "Sem backup configurado" aparece. Issue #121.
                void useIntegrationsStore.getState().refreshAccount(orgId)
              })
              .then(() => cleanupAudioOrphans())
```

`useIntegrationsStore` já está importado em `App.tsx` (usado nas linhas 198 e 215). Não adicionar import novo.

- [ ] **Step 2: Verificar typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS — sem erros de tipo (em especial nenhum erro de `noUnusedLocals`).

- [ ] **Step 3: Verificação manual (anotar no handoff, não bloqueia o commit)**

Com Supabase rodando e o Drive conectado numa org, apagar o cache SQLite local (simular device novo) e rodar `pnpm tauri dev`. Esperado: a Biblioteca NÃO mostra o banner "Sem backup configurado"; após o sync o status fica `connected`. Se não der pra testar agora, registrar como pendência no handoff.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "fix: re-checar status de cloud apos syncOrg no boot (#121)"
```

---

## Task 3: #122 Camada A — guard in-flight em `uploadSongToDrive`

**Files:**
- Modify: `apps/desktop/src/lib/cloud-storage/upload-song.ts`
- Test: `apps/desktop/src/lib/cloud-storage/upload-song.test.ts`

- [ ] **Step 1: Escrever os testes do guard**

Em `apps/desktop/src/lib/cloud-storage/upload-song.test.ts`, adicionar dentro do `describe('uploadSongToDrive', ...)`, após os testes existentes:

```ts
  it('guard in-flight: segunda chamada concorrente pro mesmo songId é no-op', async () => {
    const opts = {
      orgId: 'o1', songId: 'song-dup', filePath: '/local/song-dup.mp3',
      ext: 'mp3', kind: 'lossy' as const,
    }
    // Chamadas concorrentes: a primeira fica em voo (pausada no primeiro
    // await) enquanto a segunda é disparada.
    const first = uploadSongToDrive(opts)
    const second = uploadSongToDrive(opts)
    await Promise.all([first, second])
    // A segunda virou no-op — createUploadSession só foi chamada uma vez.
    expect(createUploadSession).toHaveBeenCalledTimes(1)
  })

  it('guard in-flight: libera o songId após concluir', async () => {
    const opts = {
      orgId: 'o1', songId: 'song-seq', filePath: '/local/song-seq.mp3',
      ext: 'mp3', kind: 'lossy' as const,
    }
    await uploadSongToDrive(opts)
    await uploadSongToDrive(opts)
    // Sequencial (não concorrente): o segundo upload roda normalmente.
    expect(createUploadSession).toHaveBeenCalledTimes(2)
  })
```

- [ ] **Step 2: Rodar os testes pra verificar que o primeiro falha**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/upload-song.test.ts`
Expected: FAIL — "guard in-flight: segunda chamada concorrente..." falha (`createUploadSession` chamada 2x). "libera o songId após concluir" passa.

- [ ] **Step 3: Implementar o guard em `upload-song.ts`**

Em `apps/desktop/src/lib/cloud-storage/upload-song.ts`, adicionar logo após os imports e antes de `export type UploadSongOpts`:

```ts
// Guard in-flight: impede dois callers concorrentes (sync-worker runPass,
// startInitialSync, AddSongModal) de subir a MESMA música ao mesmo tempo —
// o que criava arquivos duplicados no Drive. Issue #122.
const inFlightUploads = new Set<string>()
```

Dentro de `uploadSongToDrive`, logo após o check de `unsupported`:

```ts
  if (opts.kind === 'unsupported') {
    throw new Error(`Formato não suportado: ${opts.ext}`)
  }
```

adicionar:

```ts
  if (inFlightUploads.has(opts.songId)) {
    // Outro caller já está subindo essa música nesta sessão. No-op: o
    // backup (e o backup_status) será concluído por aquele caller. #122
    return
  }
  inFlightUploads.add(opts.songId)
```

E garantir a limpeza: o bloco `try { ... } catch (err) { ... }` no fim da função recebe um `finally`. Trocar:

```ts
  } catch (err) {
    try {
      await setBackupStatus(opts.songId, 'failed')
    } catch { // NOSONAR S2486 — intencional: o erro original (err) é o relevante; falha em setBackupStatus não pode ofuscar
      // sem-op deliberado
    }
    throw err
  }
}
```

por:

```ts
  } catch (err) {
    try {
      await setBackupStatus(opts.songId, 'failed')
    } catch { // NOSONAR S2486 — intencional: o erro original (err) é o relevante; falha em setBackupStatus não pode ofuscar
      // sem-op deliberado
    }
    throw err
  } finally {
    inFlightUploads.delete(opts.songId)
  }
}
```

- [ ] **Step 4: Rodar os testes pra verificar que passam**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/upload-song.test.ts`
Expected: PASS — todos os testes do arquivo verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/upload-song.ts apps/desktop/src/lib/cloud-storage/upload-song.test.ts
git commit -m "fix: guard in-flight no upload pra evitar duplicata intra-device (#122)"
```

---

## Task 4: #122 Camada B — `findFileInFolder` no provider Google Drive

**Files:**
- Modify: `supabase/functions/cloud-storage-proxy/providers/types.ts`
- Modify: `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`
- Modify: `supabase/functions/cloud-storage-proxy/providers/onedrive.ts`
- Modify: `supabase/functions/cloud-storage-proxy/providers/dropbox.ts`
- Test: `supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts`

- [ ] **Step 1: Escrever os testes do `findFileInFolder`**

Em `supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts`, adicionar ao fim do arquivo:

```ts
Deno.test('findFileInFolder — retorna match quando arquivo existe', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    files: [{ id: 'gd-existing', size: '5000' }],
  }), { status: 200 })
  try {
    const found = await googleDriveProvider.findFileInFolder('tok', 'folder-1', 'song-1.opus')
    assertExists(found)
    assertEquals(found.id, 'gd-existing')
    assertEquals(found.size, 5000)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('findFileInFolder — retorna null quando não existe', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ files: [] }), { status: 200 })
  try {
    const found = await googleDriveProvider.findFileInFolder('tok', 'folder-1', 'song-x.opus')
    assertEquals(found, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('findFileInFolder — lança ProviderError quando a busca falha', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('boom', { status: 500 })
  try {
    await assertRejects(
      () => googleDriveProvider.findFileInFolder('tok', 'folder-1', 'song-x.opus'),
      ProviderError,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

`assertEquals`, `assertExists` e `assertRejects` já estão importados no topo do arquivo. `ProviderError` também.

- [ ] **Step 2: Rodar os testes pra verificar que falham**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-net tests/google-drive-files.test.ts`
Expected: FAIL — `googleDriveProvider.findFileInFolder` não existe (erro de tipo / `is not a function`).

- [ ] **Step 3: Adicionar a assinatura na interface**

Em `supabase/functions/cloud-storage-proxy/providers/types.ts`, dentro de `interface CloudStorageProvider`, logo após a linha do `ensureAppFolder`:

```ts
  // Pasta da app
  ensureAppFolder(accessToken: string, folderName: string): Promise<{ folderId: string }>
```

adicionar:

```ts
  // Idempotência de upload: procura um arquivo pelo nome dentro de uma pasta.
  // Retorna o id+size do primeiro match, ou null se não existir. Issue #122.
  findFileInFolder(accessToken: string, folderId: string, filename: string): Promise<{ id: string; size: number } | null>
```

- [ ] **Step 4: Implementar `findFileInFolder` no Google Drive provider**

Em `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`, adicionar este método logo após o fim do `ensureAppFolder` (depois da linha `},` que fecha `ensureAppFolder`, antes de `getQuota`):

```ts
  async findFileInFolder(
    accessToken: string,
    folderId: string,
    filename: string,
  ): Promise<{ id: string; size: number } | null> {
    // Idempotência de upload: checa se já existe um arquivo com esse nome na
    // pasta de backup. Usado pra não criar duplicata quando outro device (ou
    // uma sessão anterior) já subiu a mesma música. Issue #122.
    const escaped = filename.replace(/'/g, "\\'")
    const query = encodeURIComponent(
      `name = '${escaped}' and '${folderId}' in parents and trashed = false`
    )
    const res = await fetch(`${DRIVE_API}/files?q=${query}&fields=files(id,size)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new ProviderError('google_drive', 'unknown', `File search failed: ${await res.text()}`)
    }
    const data = await res.json() as { files: Array<{ id: string; size?: string }> }
    if (data.files.length === 0) return null
    const f = data.files[0]
    return { id: f.id, size: parseInt(f.size ?? '0', 10) }
  },
```

`DRIVE_API` e `ProviderError` já estão em uso no arquivo (ver `ensureAppFolder`).

- [ ] **Step 5: Adicionar o stub nos providers não implementados**

Em `supabase/functions/cloud-storage-proxy/providers/onedrive.ts`, adicionar dentro do objeto, após a linha `ensureAppFolder() { throw new NotImplementedError('onedrive') },`:

```ts
  findFileInFolder() { throw new NotImplementedError('onedrive') },
```

Em `supabase/functions/cloud-storage-proxy/providers/dropbox.ts`, adicionar a linha equivalente após o `ensureAppFolder` desse arquivo:

```ts
  findFileInFolder() { throw new NotImplementedError('dropbox') },
```

- [ ] **Step 6: Rodar os testes pra verificar que passam**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-net tests/google-drive-files.test.ts`
Expected: PASS — todos os testes do arquivo verdes.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/providers/types.ts supabase/functions/cloud-storage-proxy/providers/google-drive.ts supabase/functions/cloud-storage-proxy/providers/onedrive.ts supabase/functions/cloud-storage-proxy/providers/dropbox.ts supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts
git commit -m "feat: findFileInFolder no provider Drive pra idempotencia de upload (#122)"
```

---

## Task 5: #122 Camada B — `handleUploadSession` usa `findFileInFolder`

**Files:**
- Modify: `supabase/functions/cloud-storage-proxy/index.ts:291-300`

**Nota de cobertura:** `handleUploadSession` depende de `ensureFreshAccessToken` (acesso ao banco + tokens). A suíte da edge function testa as funções de provider diretamente com `fetch` stubado, e não tem harness pra testar handlers com a stack de auth/token/DB mockada. O glue deste handler é fino: o `findFileInFolder` já é testado na Task 4 e o consumo da resposta `alreadyExists` é testado na Task 6. Sem teste isolado do handler — declaração explícita conforme CLAUDE.md.

- [ ] **Step 1: Reescrever `handleUploadSession`**

Em `supabase/functions/cloud-storage-proxy/index.ts`, substituir a função `handleUploadSession` (linhas 291-300):

```ts
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
```

por:

```ts
async function handleUploadSession(ctx: any, body: any): Promise<Response> {
  const { provider, accessToken, appFolderId } = await ensureFreshAccessToken(ctx.serviceClient, ctx.orgId)
  const p = getProvider(provider as ProviderId)
  // Idempotência: se já existe um arquivo com esse nome na pasta de backup,
  // não cria uma sessão nova — devolve o fileId existente pro client
  // reconciliar o backup_status sem re-upload. Evita duplicatas no Drive
  // quando outro device ou uma sessão anterior já subiu a mesma música. #122
  const existing = await p.findFileInFolder(accessToken, appFolderId, body.filename)
  if (existing) {
    return jsonResponse({ alreadyExists: true, fileId: existing.id, size: existing.size })
  }
  const session = await p.createUploadSession(accessToken, {
    folderId: appFolderId,
    filename: body.filename,
    size: body.size,
    mimeType: body.mime_type,
  })
  return jsonResponse(session)
}
```

- [ ] **Step 2: Verificar typecheck da edge function**

Run: `cd supabase/functions/cloud-storage-proxy && deno check index.ts`
Expected: PASS — sem erros de tipo.

- [ ] **Step 3: Rodar a suíte da edge function**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-net tests/`
Expected: PASS — todos os testes verdes.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cloud-storage-proxy/index.ts
git commit -m "feat: upload-session devolve alreadyExists quando arquivo ja existe (#122)"
```

---

## Task 6: #122 Camada B — client consome `alreadyExists`

**Files:**
- Modify: `apps/desktop/src/lib/cloud-storage/types.ts`
- Modify: `apps/desktop/src/lib/cloud-storage/client.ts`
- Modify: `apps/desktop/src/lib/cloud-storage/upload-song.ts`
- Test: `apps/desktop/src/lib/cloud-storage/upload-song.test.ts`

- [ ] **Step 1: Escrever o teste do caminho `alreadyExists`**

Em `apps/desktop/src/lib/cloud-storage/upload-song.test.ts`, adicionar dentro do `describe('uploadSongToDrive', ...)`:

```ts
  it('idempotência: createUploadSession devolve alreadyExists → reconcilia sem upload', async () => {
    ;(createUploadSession as any).mockResolvedValueOnce({
      alreadyExists: true, fileId: 'gd-existing', size: 2048,
    })
    await uploadSongToDrive({
      orgId: 'o1', songId: 'song-already', filePath: '/local/song-already.mp3',
      ext: 'mp3', kind: 'lossy',
    })
    expect(uploadResumable).not.toHaveBeenCalled()
    expect(setBackupStatus).toHaveBeenCalledWith('song-already', 'uploaded', expect.objectContaining({
      cloud_file_id: 'gd-existing',
      cloud_file_size: 2048,
    }))
  })
```

- [ ] **Step 2: Rodar o teste pra verificar que falha**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/upload-song.test.ts`
Expected: FAIL — `uploadResumable` é chamada (o código atual não trata `alreadyExists`).

- [ ] **Step 3: Adicionar o tipo `UploadSessionResult`**

Em `apps/desktop/src/lib/cloud-storage/types.ts`, no topo do arquivo (depois do comentário inicial, antes do `export type {`), adicionar:

```ts
import type { UploadSession } from '@leviticus/core'
```

E ao fim do arquivo, adicionar:

```ts
// Resposta do endpoint upload-session: ou uma sessão de upload nova, ou um
// sinal de que o arquivo já existe no Drive (idempotência server-side). #122
export type UploadSessionResult =
  | UploadSession
  | { alreadyExists: true; fileId: string; size: number }
```

(O `export type { ... UploadSession ... } from '@leviticus/core'` existente permanece — importar e re-exportar o mesmo tipo é válido.)

- [ ] **Step 4: Atualizar o retorno de `createUploadSession` no client**

Em `apps/desktop/src/lib/cloud-storage/client.ts`, na linha de import de tipos, trocar `UploadSession` por `UploadSessionResult`:

```ts
import type {
  ProviderId,
  QuotaInfo,
  UploadSession,
  CloudFileInfo,
  EdgeFunctionError,
} from './types.js'
```

por:

```ts
import type {
  ProviderId,
  QuotaInfo,
  UploadSessionResult,
  CloudFileInfo,
  EdgeFunctionError,
} from './types.js'
```

E trocar o tipo de retorno de `createUploadSession`:

```ts
export async function createUploadSession(orgId: string, params: {
  filename: string
  size: number
  mimeType: string
}): Promise<UploadSession> {
```

por:

```ts
export async function createUploadSession(orgId: string, params: {
  filename: string
  size: number
  mimeType: string
}): Promise<UploadSessionResult> {
```

- [ ] **Step 5: Tratar `alreadyExists` em `uploadSongToDrive`**

Em `apps/desktop/src/lib/cloud-storage/upload-song.ts`, localizar o trecho após `createUploadSession`:

```ts
    // 3. Cria upload session
    const session = await createUploadSession(opts.orgId, {
      filename: `${opts.songId}.${uploadExt}`,
      size,
      mimeType,
    })

    // 4. Upload chunked — a resposta final do PUT já contém o file
```

Inserir, entre a chamada `createUploadSession` e o comentário `// 4.`:

```ts
    // 3. Cria upload session
    const session = await createUploadSession(opts.orgId, {
      filename: `${opts.songId}.${uploadExt}`,
      size,
      mimeType,
    })

    // 3b. Idempotência server-side: se o arquivo já existe no Drive (outro
    // device ou sessão anterior já subiu), o servidor devolve o fileId em vez
    // de uma sessão. Reconcilia o estado local sem re-upload. Issue #122.
    if ('alreadyExists' in session) {
      await setBackupStatus(opts.songId, 'uploaded', {
        cloud_file_id: session.fileId,
        cloud_file_size: session.size,
        cloud_file_hash: hash,
      })
      return
    }

    // 4. Upload chunked — a resposta final do PUT já contém o file
```

- [ ] **Step 6: Rodar os testes do upload-song pra verificar que passam**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/upload-song.test.ts`
Expected: PASS — todos os testes do arquivo verdes (incluindo os da Task 3).

- [ ] **Step 7: Verificar typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS — sem erros (em especial `noUnusedLocals` em `client.ts`).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/types.ts apps/desktop/src/lib/cloud-storage/client.ts apps/desktop/src/lib/cloud-storage/upload-song.ts apps/desktop/src/lib/cloud-storage/upload-song.test.ts
git commit -m "fix: client reconcilia upload quando arquivo ja existe no Drive (#122)"
```

---

## Task 7: Verificação final

**Files:** nenhum (só verificação)

- [ ] **Step 1: Suíte completa do desktop**

Run: `cd apps/desktop && pnpm test`
Expected: PASS — toda a suíte verde, incluindo `integrations.test.ts`, `upload-song.test.ts` e `sync-worker.test.ts`.

- [ ] **Step 2: Typecheck do monorepo**

Run: `cd /Users/joaosipauba/Projects/pessoal/leviticus && pnpm typecheck`
Expected: PASS — sem erros de tipo.

- [ ] **Step 3: Suíte da edge function**

Run: `cd supabase/functions/cloud-storage-proxy && deno test --allow-net tests/`
Expected: PASS — todos os testes verdes.

- [ ] **Step 4: Se algo falhar**

Corrigir a causa raiz antes de prosseguir. Um teste que passa isolado mas falha na suíte é defeito do teste (ver CLAUDE.md "teste verde isolado E na suíte") — corrigir o vazamento de estado, não só re-rodar. Atenção ao `Set` `inFlightUploads`: cada teste de `upload-song.test.ts` usa `songId` distinto e toda chamada a `uploadSongToDrive` resolve/rejeita (o `finally` limpa o set), então não deve haver vazamento — se houver, investigar.

---

## Notas de deploy

- A mudança na edge function (`cloud-storage-proxy`) exige deploy no Supabase após o merge.
- O client novo trata a resposta de `upload-session` como union; o ramo `alreadyExists` só dispara se o campo vier. É compatível com a edge function antiga durante a janela de deploy.
- Não há mudança de schema de banco.
- Ao fechar a #122, documentar a janela residual conhecida (dois devices subindo a mesma música no mesmo ~segundo ainda podem colidir).
