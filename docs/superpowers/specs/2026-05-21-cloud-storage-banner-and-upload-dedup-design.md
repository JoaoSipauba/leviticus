# Cloud storage: banner falso + deduplicação de upload

Data: 2026-05-21
Issues: #121, #122 (refs #47)
Branch: `fix/cloud-storage-banner-and-upload-dedup`

## Contexto

Investigação de um relato de usuário: conta aberta num segundo dispositivo já
configurado mostrou o banner "Sem backup configurado" indevidamente, e 6
músicas foram re-enviadas pro Drive. A inspeção da pasta `Leviticus` no Google
Drive confirmou **20 músicas únicas em 50 arquivos — 30 duplicatas órfãs**.

São dois bugs independentes:

- **#121** — banner falso "Sem backup configurado" no boot de um device já
  configurado.
- **#122** — race no upload que cria arquivos duplicados no Drive.

Escopo: corrigir #121 e #122 de modo que **nenhuma duplicata nova** seja criada
e o banner reflita a verdade. **Fora de escopo:** limpeza dos 30 arquivos
órfãos já existentes no Drive.

## Parte 1 — #121: banner falso

### Causa

`store/integrations.ts → refreshAccount` lê `cloud_storage_accounts` do cache
SQLite local. Quando a query volta 0 linhas, conclui `status: 'disconnected'`.
Num device recém-aberto a tabela está vazia apenas porque o `syncOrg` ainda
não rodou — não porque o Drive está desconectado.

Agravante: em `App.tsx` o `refreshAccount` do boot (`App.tsx:215`) roda
concorrente com o `syncOrg` (`App.tsx:85`) e **não é re-chamado** quando o
`syncOrg` termina. O store fica preso em `disconnected`.
`LibraryBackupBanner.tsx:78` renderiza o aviso em `status === 'disconnected'`.

### Correção

1. **`store/integrations.ts → refreshAccount`**: quando a query de
   `cloud_storage_accounts` volta 0 linhas, distinguir via `getLastSync(orgId)`
   (de `lib/db.ts`):
   - `last_sync == null` → sync nunca completou pra essa org → `status: 'unknown'`.
     O banner não aparece em `unknown` (`LibraryBackupBanner.tsx:78` checa só
     `disconnected`); `unknown` já é o estado de loading.
   - `last_sync != null` → sync já rodou e confirmou ausência de conta →
     `status: 'disconnected'` (comportamento atual).

2. **`App.tsx` (boot)**: encadear `useIntegrationsStore.getState().refreshAccount(orgId)`
   após o `syncOrg(orgId)` resolver, dentro da cadeia de promises do `useEffect`
   de boot (a partir de `App.tsx:85`). Quando o sync termina, a row de
   `cloud_storage_accounts` já está no SQLite → `refreshAccount` lê a verdade →
   status vira `connected`.

### Comportamento resultante

- Device configurado, cache vazio no boot: `refreshAccount` inicial → `unknown`
  (sem banner). `syncOrg` termina → `refreshAccount` → `connected`. A transição
  `unknown → connected` continua disparando `startInitialSync`
  (`App.tsx:231-251`, `wasNotConnected` true).
- Device genuinamente sem Drive: após o `syncOrg`, `last_sync` setado e tabela
  vazia → `disconnected` → banner aparece corretamente.
- Device já com cache (reabertura): `refreshAccount` inicial acha a conta →
  `connected` imediato, sem mudança de comportamento.

### Nota sobre o guard `refreshing`

`refreshAccount` tem `if (get().refreshing) return`. O `refreshAccount` inicial
(`App.tsx:215`) faz só um `SELECT` rápido no SQLite e termina em ms, bem antes
do `syncOrg` (dezenas de chamadas de rede). A chance do guard bloquear o
`refreshAccount` pós-sync é desprezível. Não exige tratamento.

## Parte 2 — #122: deduplicação de upload

Duas camadas independentes.

### Camada A — guard in-flight (client, race intra-device)

Causa comprovada pelas evidências (pares de arquivos com timestamp idêntico do
mesmo device): no boot, `startSyncWorker` dispara um `runPass` imediato
(`App.tsx:217-220`) concorrente com `startInitialSync` (`App.tsx:246`). Ambos
chamam `listPendingBackupSongs`, ambos veem `cloud_file_id=null`, ambos chamam
`uploadSongToDrive` pra mesma música.

**Correção:** em `lib/cloud-storage/upload-song.ts`, um `Set<string>` no escopo
do módulo com os `songId` em upload.

- No início de `uploadSongToDrive`: se `inFlightUploads.has(opts.songId)`,
  retorna no-op (outro caller já está subindo essa música). Senão,
  `inFlightUploads.add(opts.songId)`.
- Remove no bloco `finally` (`inFlightUploads.delete(opts.songId)`).

`uploadSongToDrive` é o único ponto de entrada de upload — chamado por
`runPass`, `startInitialSync` e pelo fluxo de adicionar música (AddSongModal).
O guard cobre todos os callers, incluindo a concorrência entre adicionar uma
música e o worker pegá-la como pendente.

Semântica: se o caller B encontra o `songId` em voo pelo caller A, B retorna
cedo — correto: o trabalho de B (garantir o backup) está sendo feito por A, e
o `backup_status` será setado por A.

### Camada B — idempotência no servidor (race inter-device / cross-session)

Hoje `createUploadSession` sempre cria uma sessão de upload nova, sem checar se
já existe arquivo `{songId}.{ext}` na pasta do Drive. Não há dedup server-side.

**Edge function (`supabase/functions/cloud-storage-proxy`):**

- Nova função no provider Google Drive: `findFileInFolder(accessToken, folderId,
  filename): Promise<{ id: string; size: number } | null>`. Busca via Drive API
  `files?q=name = '{filename}' and '{folderId}' in parents and trashed = false`
  com `fields=files(id,size)`. Escapa aspas simples no filename (mesmo padrão de
  `ensureAppFolder`). Retorna o primeiro match ou `null`.
  - Definir a assinatura em `providers/types.ts` e implementar em
    `providers/google-drive.ts`. `onedrive.ts` e `dropbox.ts` recebem stub
    `NotImplementedError` (mesmo padrão de `ensureAppFolder`).
- `handleUploadSession` (`index.ts`): antes de `createUploadSession`, chama
  `findFileInFolder(accessToken, appFolderId, body.filename)`. Se achar,
  responde `{ alreadyExists: true, fileId, size }`. Senão, cria a sessão e
  responde como hoje.

**Client (`lib/cloud-storage`):**

- `types.ts`: a resposta de `upload-session` vira uma union discriminada —
  `UploadSession | { alreadyExists: true; fileId: string; size: number }`.
- `client.ts → createUploadSession`: tipo de retorno passa a ser a union.
- `upload-song.ts → uploadSongToDrive`: após `createUploadSession`, se a
  resposta tem `alreadyExists === true`, pula o upload (`uploadResumable`) e
  chama `setBackupStatus(opts.songId, 'uploaded', { cloud_file_id: fileId,
  cloud_file_size: size, cloud_file_hash: hash })`. O `hash` continua sendo
  computado localmente antes da chamada (passo 2 atual). Caso contrário,
  segue o fluxo de upload atual.

### Janela residual

Dois devices subindo a *mesma* música no mesmo ~segundo ainda podem colidir:
ambas as chamadas a `findFileInFolder` voltam vazias antes de qualquer upload
concluir. A janela cai de minutos (lag de sync) pra sub-segundo. Aceitável pro
escopo atual; documentar como limitação conhecida no comentário de #122 ao
fechar. Eliminá-la exigiria lock/claims server-side (a "Camada C" descartada).

## Testes

Cobertura é parte da definição de pronto (CLAUDE.md). Camadas existentes:

- **`store/integrations.test.ts`** — adicionar casos pra `refreshAccount`:
  cache vazio + `last_sync == null` → `unknown`; cache vazio + `last_sync`
  setado → `disconnected`; cache com conta → `connected`.
- **`lib/cloud-storage/upload-song.test.ts`** — adicionar casos: guard
  in-flight (segunda chamada concorrente pro mesmo `songId` é no-op e não
  chama `createUploadSession` de novo); resposta `alreadyExists` →
  `setBackupStatus('uploaded', { cloud_file_id })` sem `uploadResumable`.
- **`supabase/functions/cloud-storage-proxy/tests/google-drive-files.test.ts`**
  — adicionar teste do `findFileInFolder` (acha / não acha) e do
  `handleUploadSession` retornando `alreadyExists` quando o arquivo já existe.
- **`lib/cloud-storage/sync-worker.test.ts`** — garantir que segue verde; o
  guard não deve quebrar os fluxos existentes de `runPass`/`startInitialSync`.

Rodar isolado e na suíte completa (`pnpm test` em `apps/desktop`; testes da
edge function via Deno conforme já configurado). `pnpm typecheck` antes do PR.

## Arquivos afetados

- `apps/desktop/src/store/integrations.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/cloud-storage/upload-song.ts`
- `apps/desktop/src/lib/cloud-storage/client.ts`
- `apps/desktop/src/lib/cloud-storage/types.ts`
- `supabase/functions/cloud-storage-proxy/index.ts`
- `supabase/functions/cloud-storage-proxy/providers/types.ts`
- `supabase/functions/cloud-storage-proxy/providers/google-drive.ts`
- `supabase/functions/cloud-storage-proxy/providers/onedrive.ts` (stub)
- `supabase/functions/cloud-storage-proxy/providers/dropbox.ts` (stub)
- testes correspondentes (ver seção Testes)

## Deploy

A mudança na edge function exige deploy do `cloud-storage-proxy` (Supabase).
O client novo tolera a resposta antiga (sem `alreadyExists`) — trata como
union, ramo `alreadyExists` só dispara se o campo vier. Compatível com a edge
function antiga durante a janela de deploy. Não há mudança de schema de banco.
