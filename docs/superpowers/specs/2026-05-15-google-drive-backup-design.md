# Backup de músicas em nuvem (Google Drive como primeira implementação)

**Data:** 2026-05-15
**Status:** Spec aprovada — pronta pra virar plano de implementação
**Escopo:** arquitetura genérica de armazenamento em nuvem + primeira implementação concreta (Google Drive). OneDrive e Dropbox ficam pra releases futuras usando a mesma interface.

## Problema

Hoje o Leviticus é centrado em download de YouTube: cada usuário baixa as músicas para o próprio dispositivo (`$APPLOCALDATA/audio/`) e o Supabase guarda só metadata. Isso tem três problemas:

1. **Risco legal:** o app virou "ferramenta de download de YouTube". Vamos posicionar download de YouTube como caminho secundário e enfatizar que o usuário deve subir o áudio que tem direito de usar.
2. **Sem redundância:** se o membro apaga uma música ou troca de máquina, perde tudo. A pessoa que adicionou pode não ter mais o arquivo. A igreja perde a biblioteca.
3. **Sem compartilhamento real:** cada device tem sua cópia. Não há "biblioteca da igreja" canônica.

A solução é um backup compartilhado em **armazenamento em nuvem** (cloud storage) da igreja, com upload de arquivos como caminho principal e YouTube como secundário. A arquitetura é desenhada pra suportar múltiplos provedores; **Google Drive é a primeira implementação**.

## Visão geral

- **Upload de arquivos** vira o caminho principal de adicionar música. YouTube fica como aba secundária com disclaimer.
- Toda música adicionada ao Leviticus tem **duas cópias**: original no provedor de nuvem da igreja (compartilhado) + cópia local no device do usuário.
- O **admin da igreja** conecta uma conta de um provedor uma vez. Membros não fazem login no provedor — todos os uploads/downloads passam por uma edge function que age em nome do admin.
- **Cada org tem um único provedor ativo de cada vez.** Trocar de provedor (ex: Google Drive → OneDrive) é o mesmo fluxo que trocar de conta dentro do mesmo provedor: baixa tudo, reupa tudo no novo destino.
- **Falha de upload nunca perde música:** o arquivo fica local e a música existe normalmente, marcada como "Sem backup". Retry automático em background.

## Decisões tomadas durante o brainstorming

| Decisão | Escolha | Razão |
|---|---|---|
| Modelo de autenticação | OAuth só do admin, app age em nome dele via edge function | Membros não precisam logar em conta nenhuma — zero fricção |
| Arquitetura | Interface genérica de provedor; Google Drive como primeira implementação | Permite OneDrive/Dropbox sem retrabalho de schema/UI |
| Compressão | YouTube → mantém m4a/opus original; Upload lossless (WAV/FLAC) → recomprime pra Opus 160kbps; Upload lossy (MP3/AAC) → sobe como está | Evita perda dupla; preserva qualidade audível; economiza espaço |
| Permissão pra conectar provedor | Nova permissão granular `manage_integrations` | Consistente com sistema atual de papéis |
| Migração ao trocar conta/provedor | Automática (baixa tudo da origem, sobe tudo no destino), com modal de confirmação transparente | UX simples + admin sabe exatamente o que vai acontecer |
| Setup inicial | Admin sobe automaticamente em background tudo que tem local; biblioteca mostra "Sem backup" nas que não tem ainda | Não-bloqueante; transparente |
| Espaço cheio | Liberar espaço / atualizar plano do provedor / trocar conta. Sem recompressão adaptativa, sem "pausar backup" | Mantém escopo enxuto; força resolução real |
| Tab Integrações | Nova tab na página de Organização, entre "Papéis" e "Configurações" | Encaixa visualmente; preparada pra hospedar múltiplos provedores |
| Indicador de backup | Banner global no topo da biblioteca + ponto amarelo discreto na capa + chip "Sem backup (N)" pra filtrar | Escalável; não polui quando muitas estão sem backup |

## Arquitetura

### Interface genérica de provedores

Todos os provedores de cloud storage (Google Drive, OneDrive, Dropbox) implementam a mesma interface. A edge function recebe a operação pretendida e despacha pra implementação correta com base no provedor configurado da org.

```typescript
// supabase/functions/_shared/cloud-storage/types.ts

type ProviderId = 'google_drive' | 'onedrive' | 'dropbox'

interface OAuthInitResult {
  authUrl: string             // URL pro app abrir no browser
  state: string               // nonce assinado pra validar callback
}

interface AccountInfo {
  email: string
  userId: string              // ID estável dentro do provedor
  displayName?: string
}

interface QuotaInfo {
  total: number               // bytes
  used: number                // bytes (tudo do admin, não só Leviticus)
  available: number           // bytes
}

interface UploadSession {
  sessionUrl: string          // URL temporária pra cliente fazer PUT chunked direto
  sessionId: string           // identificador pra retomar se cair
  expiresAt: string           // ISO 8601
}

interface FileInfo {
  fileId: string
  size: number
  mimeType: string
  createdAt: string
  modifiedAt: string
}

interface CloudStorageProvider {
  id: ProviderId
  displayName: string                // "Google Drive", "OneDrive", "Dropbox"

  // OAuth
  initOAuth(redirectUri: string, state: string): OAuthInitResult
  exchangeCode(code: string, redirectUri: string): Promise<{
    refreshToken: string
    accessToken: string
    accessTokenExpiresAt: string
    account: AccountInfo
  }>
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string
    accessTokenExpiresAt: string
  }>
  revokeToken(refreshToken: string): Promise<void>

  // Pasta da app no provedor
  ensureAppFolder(accessToken: string, folderName: string): Promise<{ folderId: string }>

  // Operações de arquivo
  getQuota(accessToken: string): Promise<QuotaInfo>
  createUploadSession(accessToken: string, params: {
    folderId: string
    filename: string
    size: number
    mimeType: string
  }): Promise<UploadSession>
  generateDownloadUrl(accessToken: string, fileId: string): Promise<{
    url: string
    expiresAt: string
  }>
  getFileInfo(accessToken: string, fileId: string): Promise<FileInfo | null>
  deleteFile(accessToken: string, fileId: string): Promise<void>
}
```

Cada provedor mora num módulo:

```
supabase/functions/_shared/cloud-storage/
├── types.ts              # interface acima
├── registry.ts           # mapa ProviderId → CloudStorageProvider
├── google-drive.ts       # implementação concreta (release atual)
├── onedrive.ts           # placeholder com NotImplementedError (futuro)
└── dropbox.ts            # placeholder com NotImplementedError (futuro)
```

Cliente Tauri (em `src/lib/cloud-storage/`) também tem essa abstração:

```typescript
// src/lib/cloud-storage/types.ts        — mesmos tipos do client-side
// src/lib/cloud-storage/client.ts       — chama edge function, recebe respostas tipadas
// src/lib/cloud-storage/upload.ts       — resumable upload genérico (chunks + Content-Range)
// src/lib/cloud-storage/download.ts     — download genérico via URL
// src/lib/cloud-storage/compression.ts  — ffmpeg WAV/FLAC → Opus (não envolve provedor)
// src/lib/cloud-storage/status.ts       — máquina de estados de backup_status
// src/lib/cloud-storage/sync-worker.ts  — retry de uploads pendentes
```

**O cliente Tauri não sabe qual provedor está sendo usado.** Ele só conhece a interface: "me dá uma upload session pro meu arquivo", "me dá uma URL de download". A edge function cuida da especificidade.

Onde a especificidade vaza pro cliente: a UI mostra o nome do provedor ("Conectado ao Google Drive"), e o resumable upload pode precisar de pequenas variações por protocolo (Drive vs OneDrive vs Dropbox usam protocolos diferentes mas todos com `Content-Range` ou equivalente). Encapsulamos isso numa subpasta `protocols/` quando o segundo provedor for implementado — no MVP, `upload.ts` segue o protocolo do Google Drive.

### Componentes

```
┌──────────────────────────────────────────────────────────────────┐
│                       Tauri Desktop App                           │
│                                                                   │
│  src/components/AddSongModal.tsx       (reformulado, tabs)        │
│  src/components/SongCard.tsx           (badge "sem backup")       │
│  src/components/LibraryBackupBanner.tsx (novo)                    │
│  src/pages/org/OrgIntegrations.tsx     (nova tab)                 │
│  src/components/integrations/                                     │
│    ├── ProviderPicker.tsx     (escolhe provedor — só Drive ativo) │
│    └── ConnectedAccountCard.tsx  (genérico por provedor)          │
│                                                                   │
│  src/lib/cloud-storage/        (novo módulo, provider-agnóstico)  │
│    ├── client.ts          fala com edge function                  │
│    ├── upload.ts          resumable upload chunked                │
│    ├── download.ts        download por URL                        │
│    ├── compression.ts     ffmpeg WAV/FLAC → Opus                  │
│    ├── status.ts          backup_status por música                │
│    └── sync-worker.ts     retry de uploads pendentes              │
│                                                                   │
│  src-tauri/src/cloud_storage.rs  (novo) — hash, compressão IPC    │
└───────────────────────┬──────────────────────────────────────────┘
                        │ HTTPS (apenas calls pequenas)
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│           Supabase Edge Function: cloud-storage-proxy             │
│  (dispatcher + provedor concreto via registry.ts)                 │
│                                                                   │
│  POST /upload-session   → cria resumable upload URL no provedor   │
│  POST /download-url     → gera URL temporária de download         │
│  POST /quota            → consulta espaço usado/total/livre       │
│  POST /file-info        → metadata + verifica existência          │
│  DELETE /file           → apaga arquivo do provedor               │
│  POST /oauth-init       → devolve authUrl pro app abrir           │
│  POST /oauth-callback   → completa fluxo OAuth do admin           │
│  POST /refresh-token    → renova access_token (interno, sob       │
│                            demanda; cliente não chama direto)     │
└───────────────────────┬──────────────────────────────────────────┘
                        │
            ┌───────────┴────────────┐
            ▼                         ▼
    ┌──────────────┐         ┌────────────────────────────────────┐
    │  Supabase DB │         │ Provedor concreto da org           │
    │  (token enc) │         │ (Google Drive / OneDrive / Dropbox)│
    │              │         │ Bytes vão direto Tauri ↔ provedor  │
    └──────────────┘         └────────────────────────────────────┘
```

**Princípio crítico:** bytes de áudio nunca passam pela edge function. Upload usa resumable upload sessions (cliente Tauri → provedor direto). Download usa URL temporária autenticada (cliente Tauri → provedor direto). Edge function só faz chamadas JSON pequenas.

### Mudanças de schema

#### Supabase: `supabase/migrations/2026-05-15-cloud-storage-backup.sql`

```sql
-- Conta de cloud storage conectada por org (apenas 1 ativa)
CREATE TABLE cloud_storage_accounts (
  org_id              uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider            text NOT NULL CHECK (provider IN ('google_drive', 'onedrive', 'dropbox')),
  account_email       text NOT NULL,
  account_user_id     text NOT NULL,
  refresh_token_encrypted bytea NOT NULL,   -- pgsodium-encrypted
  access_token        text,                  -- cache curto (NULL após expirar)
  access_token_expires_at timestamptz,
  app_folder_id       text NOT NULL,         -- ID da pasta "Leviticus" no provedor
  connected_by        uuid REFERENCES auth.users(id),
  connected_at        timestamptz NOT NULL DEFAULT now(),
  last_quota_total    bigint,
  last_quota_used     bigint,
  last_quota_check_at timestamptz,
  provider_metadata   jsonb DEFAULT '{}'::jsonb,  -- escape hatch para campos específicos do provedor
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Adições à tabela songs (aditivo, com defaults)
ALTER TABLE songs
  ADD COLUMN cloud_file_id      text,                                  -- null = sem backup
  ADD COLUMN cloud_file_size    bigint,
  ADD COLUMN cloud_file_hash    text,                                  -- SHA-256 do conteúdo
  ADD COLUMN source             text NOT NULL DEFAULT 'youtube'        -- 'youtube' | 'upload'
    CHECK (source IN ('youtube', 'upload')),
  ADD COLUMN original_format    text,                                  -- 'wav','flac','mp3','m4a','opus'
  ADD COLUMN backup_status      text NOT NULL DEFAULT 'pending'        -- 'pending' | 'uploaded' | 'failed' | 'no_account'
    CHECK (backup_status IN ('pending', 'uploaded', 'failed', 'no_account'));

-- Nota: NÃO armazenamos provider em songs. O provider vem de cloud_storage_accounts da org.
-- Quando a org troca de provedor, todas as músicas vão pra backup_status='pending' e cloud_file_id=null,
-- e o sync worker repete o upload pro novo provedor.

-- Fila de uploads pendentes (admin e membros contribuem)
CREATE TABLE pending_cloud_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id         uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id       uuid NOT NULL,                          -- device que tem o arquivo
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  attempt_count   int NOT NULL DEFAULT 0,
  last_error      text,
  last_attempt_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, device_id)
);

-- Nova permissão granular
INSERT INTO permission_keys (key, label, description) VALUES
  ('manage_integrations', 'Gerenciar integrações',
   'Conectar e trocar contas externas de armazenamento em nuvem');

-- RLS policies (resumido)
ALTER TABLE cloud_storage_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cloud_accounts_select ON cloud_storage_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE org_id = cloud_storage_accounts.org_id AND user_id = auth.uid())
);
CREATE POLICY cloud_accounts_write ON cloud_storage_accounts FOR ALL USING (
  user_has_permission(auth.uid(), cloud_storage_accounts.org_id, 'manage_integrations')
);
```

#### SQLite local: `apps/desktop/src-tauri/migrations/006_cloud_storage_backup.sql`

Espelho aditivo das mesmas colunas em `songs` + tabela local `cloud_storage_accounts` (sem o token, só pro UI ler `provider`, `account_email`, `last_quota_*`) e `pending_cloud_uploads` pra fila local.

### Edge Function: `supabase/functions/cloud-storage-proxy/`

Deno/TypeScript. Endpoints já listados no diagrama. Detalhes-chave:

- **Auth:** cada request vem com JWT do Supabase. Edge function valida que `auth.uid()` é membro da `org_id` referenciada e tem a permissão necessária (`manage_integrations` pra alterações, qualquer membro pra read).
- **Dispatch:** carrega `cloud_storage_accounts.provider` da org → busca implementação em `registry.ts` → chama método correspondente. Se provedor desconhecido (futuro): retorna 501.
- **Token storage:** `refresh_token` é criptografado com pgsodium antes de salvar. Decriptado on-the-fly só dentro da edge function (que tem a service role key).
- **Token refresh:** se `access_token` expirou (~1h), edge function chama método `refreshAccessToken` do provedor, atualiza no DB, prossegue. Transparente pro cliente.
- **Rate limit:** 60 req/min por org (suficiente pra uso real, bloqueia abuso).
- **Quota check:** retorna `{ total, used, available }` cacheado por 5 min.

### Fluxo OAuth genérico (exemplo: Google Drive)

```
1. Admin clica "Conectar Google Drive" na tab Integrações
   (no MVP só Google está ativo; UI já preparada pra OneDrive/Dropbox)
2. App chama POST /oauth-init { provider: "google_drive" } na edge function
3. Edge function chama provider.initOAuth(redirectUri, state) → devolve authUrl
4. App abre authUrl no browser do sistema
5. Admin autoriza no provedor
6. Provedor redireciona pra edge function /oauth-callback com code+state
7. Edge function:
   a. Chama provider.exchangeCode(code) → recebe refresh_token + account info
   b. Chama provider.ensureAppFolder(accessToken, "Leviticus") → recebe folderId
   c. Salva cloud_storage_accounts row (refresh_token criptografado)
   d. Redireciona pra leviticus://oauth-success?nonce=... (deep link)
8. App captura deep link via tauri-plugin-deep-link
9. UI atualiza pra estado conectado
```

Tem que registrar o protocolo `leviticus://` no Info.plist (macOS) e usar tauri-plugin-deep-link.

### Escopos OAuth (por provedor)

Cada provedor exige seus próprios escopos. Configurados na implementação concreta.

| Provedor | Escopo solicitado | Característica |
|---|---|---|
| Google Drive (atual) | `https://www.googleapis.com/auth/drive.file` | App só vê arquivos que ele mesmo criou. Mais seguro. |
| OneDrive (futuro) | `Files.ReadWrite.AppFolder offline_access` | Acesso restrito à pasta da aplicação. |
| Dropbox (futuro) | `files.content.write files.content.read` em conta tipo "App folder" | App tem seu próprio sandbox de pasta. |

Todos esses são escopos restritos à pasta da app — não enxergam outros arquivos do admin. Reduz preocupação de privacidade e simplifica revisão.

## Fluxos detalhados

### Fluxo 1: Adicionar música via upload (caminho principal)

1. Usuário clica "+" na biblioteca → abre AddSongModal, tab "Arquivo" ativa.
2. Arrasta/seleciona arquivo. Limite: 100 MB.
3. App detecta formato lendo magic bytes (não fia em extensão).
4. **Pre-check de quota:** chama `cloud-storage-proxy/quota`. Se `available < tamanho_arquivo * 1.5` (margem pra compressão temp), mostra erro inline.
5. Step 2: usuário preenche metadata (título, artista, ministérios, song_type).
6. Step 3 (processamento + upload):
   - Salva metadata no Supabase: `source='upload'`, `original_format=...`, `backup_status='pending'`.
   - Copia arquivo pra `$APPLOCALDATA/audio/{songId}.{ext}` local.
   - Se lossless (wav/flac/aiff): chama `ffmpeg` via Tauri Command pra criar `{songId}.opus` num temp dir, bitrate 160k. Calcula SHA-256.
   - Se lossy (mp3/m4a/aac/ogg/opus): usa o próprio arquivo.
   - Chama `cloud-storage-proxy/upload-session` com `{ songId, filename, size, hash }`. Recebe `sessionUrl`.
   - PUT chunked direto pro provedor (com retry exponencial em 5xx).
   - App confirma conclusão via `cloud-storage-proxy/file-info`. Atualiza `songs.cloud_file_id`, `cloud_file_size`, `backup_status='uploaded'`.
7. Step 4: sucesso. Toast: "Música adicionada e salva no backup".

**Se passo 6 falha:** mantém arquivo local + `backup_status='pending'`. Adiciona row em `pending_cloud_uploads`. Sync worker retry.

### Fluxo 2: Adicionar via YouTube (caminho secundário)

1. Tab "YouTube" da AddSongModal mostra disclaimer amarelo no topo.
2. Busca/cole link funciona como hoje.
3. Após escolher resultado: igual fluxo atual até o `downloadSong()` baixar o arquivo do yt-dlp.
4. **Adicional:** após download terminar, fluxo continua igual ao 1.6 a partir do "Chama `cloud-storage-proxy/upload-session`" (com `source='youtube'`, formato = o que yt-dlp baixou, sem recompressão).

### Fluxo 3: Tocar/baixar do backup (música não está local)

1. Usuário clica play em música com `cloud_file_id != null` mas sem arquivo local.
2. App chama `cloud-storage-proxy/download-url?file_id=...`. Recebe URL temporária (1h).
3. Mostra estado "Baixando do backup" com progress bar. *(UI usa "do Drive" / "do OneDrive" conforme provedor da org.)*
4. Stream chunked GET → escreve em `$APPLOCALDATA/audio/{songId}.{ext}` (atomic via .partial → rename).
5. Verifica hash SHA-256 contra `cloud_file_hash`. Se bate, marca como disponível. Se não, deleta e mostra erro "Arquivo corrompido — peça pra alguém reupar".
6. Inicia playback assim que arquivo está em disco.

**Pré-fetch:** quando usuário entra num culto/playlist, app dispara download em background de todas as músicas que faltam local, em ordem da playlist.

### Fluxo 4: Música excluída do device (limpeza local)

1. Usuário clica "Remover do dispositivo" no song card.
2. App apaga `$APPLOCALDATA/audio/{songId}.*`.
3. Não toca no backup nem no Supabase. Song card passa a mostrar "No backup" com botão de baixar.

### Fluxo 5: Setup inicial — backup das músicas existentes

Quando admin conecta um provedor pela primeira vez numa org que já tem músicas:

1. App enumera local: quantas músicas com arquivo presente, total em bytes.
2. Background worker começa a subir em ordem de adição (FIFO). Cada upload segue o fluxo 1 a partir do passo 6 (compressão se lossless, upload, marca uploaded).
3. UI mostra na tab Integrações um card "Migrando: 14 de 38 músicas (62 MB de 142 MB)" com barra de progresso. Continua mesmo se o admin fechar a tela.
4. Para músicas que o admin não tem localmente: `backup_status` fica `pending`. Membro com a música abrindo o app dispara upload similar (sync worker dele).
5. Conflito (dois membros subindo a mesma música simultaneamente): o segundo recebe erro "já existe" da edge function (que valida por `song_id`). Ele deleta o arquivo temp e marca como uploaded.

### Fluxo 6: Trocar conta ou trocar provedor

Mesmo fluxo, dois gatilhos diferentes:

- **Trocar conta** (mesmo provedor, conta diferente): botão "Trocar conta" no card de provedor conectado.
- **Trocar provedor** (Google Drive → OneDrive, no futuro): botão "Trocar provedor" mostra picker de provedores.

Em ambos os casos:

1. Admin clica trocar → modal de confirmação transparente (mockup aprovado): explica os 3 passos.
2. Admin confirma:
   - App baixa todas as 38 músicas do provedor/conta atual pro device do admin (com progress).
   - App revoga `cloud_storage_accounts` row atual, marca `backup_status='pending'` em todas as músicas (e `cloud_file_id=null`).
   - Abre OAuth fluxo do novo destino. Admin loga.
   - Após sucesso, sync worker sobe tudo de novo no novo destino.
3. Durante a migração, outros membros veem mensagem "Backup em manutenção — uploads/downloads pausados" e operações ficam em fila local.
4. Pasta antiga (na conta/provedor antigo) não é apagada — fica como backup manual.

### Fluxo 7: Backup cheio

Detalhado na seção "Erros e recuperação".

## Erros e recuperação

### Detecção contínua

- App consulta `/quota` na edge function:
  - Ao abrir o app (boot)
  - A cada 10 min em background
  - Antes de cada upload novo
- Resultado fica em `cloud_storage_accounts.last_quota_*` e propaga pra UI.

### Estados visuais escalonados

| Uso | Tab Integrações | Biblioteca | Comportamento |
|---|---|---|---|
| < 85% | Verde, "Em dia" | Banner some se 100% sincronizado | Uploads normais |
| 85-94% | Amarelo, "Espaço acabando" | Banner amarelo se houver pendentes | Uploads continuam, alerta admin |
| 95-99% | Amarelo escuro, "Quase no limite" | Banner amarelo + push admin | Uploads continuam |
| 100% / próximo não cabe | Vermelho, "Backup pausado" | Banner vermelho + push admin | Novos uploads bloqueados, retries pausados, lista pendentes mostrada |

### Cenários específicos

1. **Token expirado/revogado pelo admin no provedor:** edge function detecta `invalid_grant` (ou equivalente do provedor) no refresh, marca `cloud_storage_accounts.refresh_token_encrypted = null`. Tab Integrações mostra "Reconectar [Nome do Provedor]". Banner vermelho na biblioteca.
2. **Pasta da app apagada no provedor:** edge function detecta 404 em download/upload. Tab Integrações mostra "Pasta de backup não encontrada — clique pra recriar". Botão recria a pasta vazia e marca todas as músicas como `backup_status='pending'` pra resubir.
3. **Arquivo específico apagado:** download retorna 404. App marca `songs.cloud_file_id=null, backup_status='pending'`. Song card vira "Indisponível — Resubir" se algum membro tiver o arquivo local, senão "Perdido" com nota pro admin.
4. **Backup cheio mid-upload:** provedor retorna 403 com algum código equivalente a "quota exceeded". App marca upload como falho, song fica `backup_status='pending'`. Banner vermelho aparece.
5. **Backup cheio antes de upload (single file > available):** mostrado inline no AddSongModal antes de iniciar (mockup aprovado). Botão "Continuar" desabilitado.
6. **Rate limit (403 user rate exceeded):** retry com exponential backoff (1s, 2s, 4s, 8s, 30s, 60s). Após 5 falhas, marca como `failed` no `pending_cloud_uploads.last_error`.
7. **Sem internet:** todas as operações ficam em fila local. Retoma ao detectar conectividade.
8. **Edge function fora do ar:** toast genérico "Algo deu errado, tente em alguns minutos." Operações ficam em fila.
9. **Hash mismatch após download:** deleta arquivo local, marca song como precisa-redownload. Toast: "Arquivo corrompido — tentando de novo." Retenta uma vez. Se falhar de novo: mostra como "Indisponível".

### Recuperação acionável (admin)

Três ações disponíveis no card vermelho:

1. **Liberar espaço no [Provedor]** — abre URL específica do provedor:
   - Google Drive: `https://drive.google.com/drive/quota`
   - OneDrive: `https://onedrive.live.com/?v=manage_storage`
   - Dropbox: `https://www.dropbox.com/account/plan`
2. **Atualizar plano** — abre URL de upgrade do provedor:
   - Google Drive: `https://one.google.com/about`
   - OneDrive: `https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage`
   - Dropbox: `https://www.dropbox.com/plans`
3. **Trocar pra outra conta** (mesmo provedor) ou **Trocar provedor** — usa fluxo 6.

### Membros sem permissão `manage_integrations`

Veem os estados de erro com copy diferente ("Avise um admin") e lista de admins da org. Nunca veem botões de ação direta sobre o backup.

## Compressão — detalhes

Provider-agnóstico: a compressão acontece antes do upload, então o provedor recebe sempre o mesmo formato final.

| Formato de entrada | Ação | Output enviado pro backup |
|---|---|---|
| WAV (qualquer sample rate/bit depth) | Recomprime via ffmpeg | Opus 160 kbps mono/estéreo (preserva canais originais) |
| FLAC | Recomprime via ffmpeg | Opus 160 kbps |
| AIFF | Recomprime via ffmpeg | Opus 160 kbps |
| MP3 | Sobe como está | MP3 (preserva bitrate) |
| M4A / AAC | Sobe como está | M4A |
| OGG / Opus | Sobe como está | OGG |

**Por que Opus 160 kbps:** é o sweet spot praticamente indistinguível de lossless pra qualquer ouvido humano em qualquer playback (até estúdio caro). Opus é mais eficiente que AAC/MP3 na mesma taxa.

**Detecção de formato:** lê magic bytes do arquivo, não confia em extensão. Usa o pacote npm `file-type` (puro JS, lê primeiros 4 KB via `@tauri-apps/plugin-fs`).

**Onde roda a compressão:** localmente no Tauri via `ffmpeg` sidecar (já temos via `ensure_ffmpeg`). Async — não bloqueia UI.

## UI/UX — resumo das telas

| Componente | Mockup aprovado | Variação multi-provedor |
|---|---|---|
| AddSongModal Step 1 | Direção B (tabs Arquivo/YouTube) | Igual em todos os provedores |
| Tab YouTube | Disclaimer amarelo no topo | Igual |
| Biblioteca — backup status | Banner global + ponto sutil + chip filtro | Copy genérico "backup" (não "Drive") |
| Tab Integrações (desconectada) | Card de provider picker | Lista provedores ativos (MVP só Google); inativos mostram "Em breve" |
| Tab Integrações (conectada) | Card com email, pasta, barra de quota segmentada, stats | Logo do provedor + nome dele dinâmicos |
| Tab Integrações (backup cheio) | Card vermelho + 3 ações de recuperação + lista de pendentes | URLs específicas por provedor |
| Modal de troca de conta/provedor | Confirmação transparente com 3 passos | Texto diz "Google Drive → Google Drive" ou "Google Drive → OneDrive" |
| AddSongModal erro de espaço | Inline no Step 1 | "no Drive da igreja" → "no backup da igreja ([Provedor])" |
| Lista da biblioteca com download | Estados play/baixar/baixando/indisponível | Igual |

Os HTMLs estão em `.superpowers/brainstorm/47383-1778847037/content/`. Eles usam "Drive" no nome porque foram desenhados antes da decisão de generalizar — visualmente continuam válidos com substituição de string.

### Provider picker (tela nova)

Quando admin clica "Conectar" na tab Integrações pela primeira vez, mostra lista de provedores disponíveis:

```
┌───────────────────────────────────────────────────────────────┐
│  Escolha um serviço de armazenamento                          │
│                                                                │
│  [G] Google Drive       Disponível        15 GB grátis         │
│  [O] OneDrive          Em breve                                │
│  [D] Dropbox           Em breve                                │
└───────────────────────────────────────────────────────────────┘
```

No MVP só Google Drive é clicável. Os outros mostram label "Em breve" mas a UI já está pronta — mudar pra ativo é só remover o disabled e implementar o provider em `_shared/cloud-storage/`.

## Custos previstos

| Item | Custo |
|---|---|
| Supabase Edge Function (até ~500 orgs ativas) | $0/mês (cabe no Free tier, 500K invocações) |
| Bandwidth/egress | $0 (bytes vão direto Tauri ↔ provedor) |
| Storage dos arquivos | $0 pra nós — fica na conta do admin |
| API do provedor | $0 (todos os principais têm tier gratuito generoso) |
| Token storage Supabase | desprezível |
| Cloud project pra OAuth client (1 por provedor) | $0 |

Custos por provedor a configurar:

- **Google Drive:** Google Cloud Project (gratuito), OAuth consent screen review (~1-2 semanas).
- **OneDrive:** Microsoft Azure AD app registration (gratuito), Microsoft 365 verification.
- **Dropbox:** Dropbox app in App Console (gratuito), production approval para "App folder" mode.

## Testes

### Unit (vitest, sem DOM)

- `compression.ts`: detecção de formato (mock filesystem com magic bytes de cada tipo); decisão recomprime-ou-não.
- `status.ts`: máquina de estados de `backup_status` — todas as transições válidas e bloqueadas.
- `sync-worker.ts`: lógica de retry com backoff exponencial.
- `client.ts`: serialização das chamadas pra edge function, tratamento de erros HTTP.
- **`google-drive.ts` (provider concreto)**: testes da implementação com mock da API do Google (oauth, quota, upload session, download URL).

### Component (RTL + jsdom)

- `AddSongModal`: cobertura nova tab YouTube + estados de erro de espaço + transição entre tabs.
- `LibraryBackupBanner`: estados (sem account, espaço acabando, backup cheio).
- `OrgIntegrations`: 3 estados (desconectado, conectado, backup cheio) e provider picker.
- `SongCard`: badge "sem backup", botão "Baixar do backup", estado baixando.
- `ProviderPicker`: provedores ativos/em breve, seleção, chamada da OAuth init.

Todos com `mockIPC` interceptando `invoke()` e mock do módulo `cloud-storage/client.ts`.

### Edge function tests

Testes da edge function via Deno test runner, focando no dispatcher (provider correto chamado), validação de auth/permissão, e tratamento de erros do provedor.

### E2E (Linux CI, novo spec)

Nova jornada **11. Backup em nuvem (admin, Google Drive)**:

1. Admin conecta Google Drive (OAuth mockado — edge function fake retorna sucesso).
2. Adiciona música via upload (arquivo de teste WAV pequeno).
3. Verifica que aparece como "uploaded" na biblioteca.
4. Apaga arquivo local manualmente.
5. Clica play — verifica download (edge function fake serve bytes).
6. Verifica reprodução.

E **12. Backup em nuvem (membro)**: idem mas sem ver botões de troca de conta. Verifica que membro sem permissão vê só estado, não controles.

### O que NÃO testar em E2E

- OAuth real de qualquer provedor (mocked completamente).
- API real do provedor (edge function fake).
- Compressão real de ffmpeg (mock no `invoke('compress_to_opus')`).

## Migração e rollout

### Compatibilidade backward

Mudança de schema é 100% aditiva: novas colunas com defaults, novas tabelas. Apps em campo na versão anterior continuam funcionando:

- Eles ignoram `cloud_file_id`, `backup_status` etc — não usam essas colunas em select/insert/update.
- Eles continuam fazendo download do YouTube e gravando local sem subir pro backup.
- Quando atualizarem, o sync worker percebe que tem músicas com `cloud_file_id=null` e começa a subir (se backup conectado).

### Setup do Google Cloud (uma vez, manual)

1. Criar projeto no Google Cloud Console.
2. Ativar Google Drive API.
3. Criar OAuth client ID (tipo "Web application", redirect_uri = edge function).
4. Configurar consent screen com scope `drive.file`.
5. Submeter pra verificação (necessário pra usar em modo Production).
6. Adicionar credenciais como secrets no Supabase: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

Cada provedor futuro repete equivalente: Microsoft Azure AD pro OneDrive, Dropbox App Console pro Dropbox. Cada um vira um par de secrets no Supabase: `{PROVIDER}_OAUTH_CLIENT_ID`, `{PROVIDER}_OAUTH_CLIENT_SECRET`.

### Rollout do MVP

Lançar tudo numa release única (`feat:` → minor bump):
- Migration Supabase
- Migration SQLite
- Edge function com interface genérica + Google Drive concreto
- App com nova UI (provider picker mostra só Google como ativo)

Antes do rollout: confirmar que app antigo continua funcionando contra novo schema (testar manualmente com binário da versão anterior).

### Rollout de provedores futuros (referência)

Cada novo provedor é um PR que:
1. Adiciona arquivo `_shared/cloud-storage/{provider}.ts` implementando a interface.
2. Registra no `registry.ts`.
3. Adiciona secrets no Supabase.
4. Ativa o card no `ProviderPicker.tsx` (remove "Em breve").
5. Atualiza tabela de URLs de recuperação (liberar espaço / upgrade) na UI.
6. Testes específicos do provedor.

Nenhuma migração de schema necessária pra novo provedor — `provider` é uma coluna text com `CHECK`. Adicionar novo valor permitido é uma migration trivial. Schema está pronto.

## Fora de escopo desta spec

Itens conscientemente excluídos:

- **Implementação concreta de OneDrive e Dropbox** — arquitetura preparada, mas os módulos `onedrive.ts` e `dropbox.ts` ficam como placeholder com `NotImplementedError`. ProviderPicker mostra ambos como "Em breve".
- **Múltiplos provedores ativos simultaneamente** — uma org tem um provedor de cada vez. Trocar requer migração completa.
- **Múltiplas pastas no backup** (uma por ministério, etc.) — uma pasta única "Leviticus" por org.
- **Sincronização entre orgs diferentes** — cada org tem seu backup isolado.
- **Versionamento de músicas** — uma versão, sem histórico.
- **Streaming sem download** — sempre baixa o arquivo inteiro antes de tocar.
- **Recompressão adaptativa quando backup cheio** — decisão tomada de manter simples.
- **Pausar backup** — não pode ser desabilitado; única forma é desconectar o provedor inteiro.
- **Mobile remote control** — não interage com backup (existente).
- **Compartilhamento da pasta do backup com outros usuários do provedor** — não usamos. Tudo via edge function com token do admin.
- **Upload em massa (zip de músicas)** — uma de cada vez via modal.
- **Editar tags ID3 do arquivo** — preserva original.

## Riscos identificados

1. **Verificação OAuth do Google demora** — usar escopo `drive.file` reduz o atrito, mas ainda precisa passar por consent screen review (1-2 semanas). Cada provedor futuro terá processo equivalente. Mitigação: iniciar processo no início da implementação, não no final.
2. **Quota gratuita acaba rápido** — uma igreja com 200 músicas WAV reaproveitadas usaria ~3 GB; com Opus 160k usa ~500 MB. Mas se o admin tem fotos/email/outras coisas competindo, satura. UX educa sobre planos pagos.
3. **Diferenças de protocolo entre provedores** — resumable upload do Google difere de OneDrive (chunks de 320 KiB) e Dropbox (sessões com commit). A abstração genérica deve esconder isso, mas custa esforço por provedor. Mitigação: aceitar essa complexidade na implementação concreta, não tentar forçar API idêntica.
4. **Bug de hash mismatch em escala** — se ffmpeg variar saída entre versões, hashes podem divergir. Mitigação: gerar hash do **arquivo final** que vai pro backup (não do input), assim a referência é o que está no destino de fato.
5. **Edge function cold start** — invocações esporádicas têm latência de 200-500ms. Aceitável pra UX (usuário vê "Conectando...").
6. **Resumable upload de arquivos grandes em rede ruim** — implementar retry com `Content-Range` correto, retomar de onde parou. Não é trivial. Vale ter testes de rede flaky.

## Próximos passos

1. Spec aprovada → escrever plano de implementação detalhado (writing-plans skill).
2. Plano deve quebrar em fases independentes: edge function (interface + Google Drive concreto) + schema → módulo cloud-storage client → UI da modal → UI da biblioteca → UI da tab Integrações + provider picker → migração inicial → erros e recuperação.
3. Cada fase com testes correspondentes antes de avançar.
