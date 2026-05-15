# Backup de músicas no Google Drive

**Data:** 2026-05-15
**Status:** Spec aprovada — pronta pra virar plano de implementação

## Problema

Hoje o Leviticus é centrado em download de YouTube: cada usuário baixa as músicas para o próprio dispositivo (`$APPLOCALDATA/audio/`) e o Supabase guarda só metadata. Isso tem três problemas:

1. **Risco legal:** o app virou "ferramenta de download de YouTube". Vamos posicionar download de YouTube como caminho secundário e enfatizar que o usuário deve subir o áudio que tem direito de usar.
2. **Sem redundância:** se o membro apaga uma música ou troca de máquina, perde tudo. A pessoa que adicionou pode não ter mais o arquivo. A igreja perde a biblioteca.
3. **Sem compartilhamento real:** cada device tem sua cópia. Não há "biblioteca da igreja" canônica.

A solução é um backup compartilhado no Google Drive da igreja, com upload de arquivos como caminho principal e YouTube como secundário.

## Visão geral

- **Upload de arquivos** vira o caminho principal de adicionar música. YouTube fica como aba secundária com disclaimer.
- Toda música adicionada ao Leviticus tem **duas cópias**: original no Drive da igreja (compartilhado) + cópia local no device do usuário.
- O **admin da igreja** conecta uma conta Google uma vez. Membros não fazem login Google — todos os uploads/downloads passam por uma edge function que age em nome do admin.
- **Falha de upload nunca perde música:** o arquivo fica local e a música existe normalmente, marcada como "Sem backup". Retry automático em background.

## Decisões tomadas durante o brainstorming

| Decisão | Escolha | Razão |
|---|---|---|
| Modelo de autenticação Drive | OAuth só do admin, app age em nome dele via edge function | Membros não precisam logar no Google — zero fricção; auditoria mais fraca aceita |
| Compressão | YouTube → mantém m4a/opus original; Upload lossless (WAV/FLAC) → recomprime pra Opus 160kbps; Upload lossy (MP3/AAC) → sobe como está | Evita perda dupla; preserva qualidade audível; economiza espaço quando vale a pena |
| Permissão pra conectar Drive | Nova permissão granular `manage_integrations` | Consistente com sistema atual de papéis |
| Migração ao trocar conta | Automática (baixa tudo da conta antiga, sobe tudo na nova), com modal de confirmação transparente | UX simples + admin sabe exatamente o que vai acontecer |
| Setup inicial | Admin sobe automaticamente em background tudo que tem local; biblioteca mostra "Sem backup" nas que não tem ainda | Não-bloqueante; transparente |
| Espaço cheio: opções | Liberar espaço / atualizar plano Google One / trocar conta. Sem recompressão adaptativa, sem "pausar backup" | Mantém escopo enxuto; força resolução real |
| Tab Integrações | Nova tab na página de Organização, entre "Papéis" e "Configurações" | Encaixa visualmente; espaço pra futuras integrações |
| Indicador de backup | Banner global no topo da biblioteca + ponto amarelo discreto na capa + chip "Sem backup (N)" pra filtrar | Escalável; não polui quando muitas estão sem backup |

## Arquitetura

### Componentes novos

```
┌──────────────────────────────────────────────────────────────────┐
│                       Tauri Desktop App                           │
│                                                                   │
│  src/components/AddSongModal.tsx       (reformulado, tabs)        │
│  src/components/SongCard.tsx           (badge "sem backup")       │
│  src/components/LibraryBackupBanner.tsx (novo)                    │
│  src/pages/org/OrgIntegrations.tsx     (nova tab)                 │
│                                                                   │
│  src/lib/drive/                         (novo módulo)             │
│    ├── client.ts          chamadas pra edge function              │
│    ├── upload.ts          resumable upload direto pro Google      │
│    ├── download.ts        download direto do Google               │
│    ├── compression.ts     ffmpeg WAV/FLAC → Opus                  │
│    ├── status.ts          backup_status por música                │
│    └── sync-worker.ts     retry de uploads pendentes              │
│                                                                   │
│  src-tauri/src/drive.rs   (novo) — verifica hash, compressão IPC  │
└───────────────────────┬──────────────────────────────────────────┘
                        │ HTTPS (apenas calls pequenas)
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│              Supabase Edge Function: drive-proxy                  │
│                                                                   │
│  POST /upload-session   → cria resumable upload URL no Drive      │
│  POST /download-url     → gera URL temporária de download         │
│  POST /quota            → consulta storageQuota do admin          │
│  POST /file-info        → metadata + verifica existência          │
│  DELETE /file           → apaga arquivo do Drive                  │
│  POST /oauth-callback   → completa fluxo OAuth do admin           │
│  POST /refresh-token    → renova access_token do admin            │
└───────────────────────┬──────────────────────────────────────────┘
                        │
            ┌───────────┴──────────┐
            ▼                       ▼
    ┌──────────────┐         ┌──────────────┐
    │  Supabase DB │         │ Google Drive │
    │  (admin      │         │  API + bytes │
    │   token)     │         │ direto Tauri │
    └──────────────┘         └──────────────┘
```

**Princípio crítico:** bytes de áudio nunca passam pela edge function. Upload usa **resumable upload sessions** (cliente Tauri → Google direto). Download usa URL temporária autenticada (cliente Tauri → Google direto). Edge function só faz chamadas JSON pequenas.

### Mudanças de schema

#### Supabase: `supabase/migrations/2026-05-15-google-drive-backup.sql`

```sql
-- Conta Google conectada por org (apenas 1 ativa)
CREATE TABLE drive_accounts (
  org_id              uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  google_email        text NOT NULL,
  google_user_id      text NOT NULL,
  refresh_token_encrypted bytea NOT NULL,  -- pgsodium-encrypted
  access_token        text,                 -- cache curto
  access_token_expires_at timestamptz,
  drive_folder_id     text NOT NULL,        -- pasta "Leviticus" criada
  connected_by        uuid REFERENCES auth.users(id),
  connected_at        timestamptz NOT NULL DEFAULT now(),
  last_quota_bytes    bigint,
  last_quota_used     bigint,
  last_quota_check_at timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Adições à tabela songs (aditivo, com defaults)
ALTER TABLE songs
  ADD COLUMN drive_file_id       text,                                 -- null = sem backup
  ADD COLUMN drive_file_size     bigint,                               -- bytes no Drive
  ADD COLUMN drive_file_hash     text,                                 -- SHA-256 do conteúdo
  ADD COLUMN source              text NOT NULL DEFAULT 'youtube'       -- 'youtube' | 'upload'
    CHECK (source IN ('youtube', 'upload')),
  ADD COLUMN original_format     text,                                 -- 'wav','flac','mp3','m4a','opus'
  ADD COLUMN backup_status       text NOT NULL DEFAULT 'pending'       -- 'pending' | 'uploaded' | 'failed' | 'no_account'
    CHECK (backup_status IN ('pending', 'uploaded', 'failed', 'no_account'));

-- Fila de uploads pendentes (membros e admin contribuem)
CREATE TABLE pending_drive_uploads (
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
   'Conectar e trocar contas externas como Google Drive');

-- RLS policies (resumido)
ALTER TABLE drive_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY drive_accounts_select ON drive_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE org_id = drive_accounts.org_id AND user_id = auth.uid())
);
CREATE POLICY drive_accounts_write ON drive_accounts FOR ALL USING (
  user_has_permission(auth.uid(), drive_accounts.org_id, 'manage_integrations')
);
```

#### SQLite local: `apps/desktop/src-tauri/migrations/006_drive_backup.sql`

Espelho aditivo das mesmas colunas + tabela local `drive_accounts` (sem o token) só pro UI ler status, e `pending_drive_uploads` pra fila local.

### Edge Function: `supabase/functions/drive-proxy/`

Deno/TypeScript. Endpoints já listados no diagrama. Detalhes-chave:

- **Auth:** cada request vem com JWT do Supabase. Edge function valida que `auth.uid()` é membro da `org_id` referenciada e tem a permissão necessária (`manage_integrations` pra alterações, qualquer membro pra read).
- **Token storage:** `refresh_token` é criptografado com pgsodium antes de salvar no Supabase. Decriptado on-the-fly só dentro da edge function (que tem a service role key).
- **Token refresh:** se `access_token` expirou (~1h), edge function chama Google OAuth endpoint, atualiza no DB, prossegue. Transparente pro cliente.
- **Rate limit:** 60 req/min por org (suficiente pra uso real, bloqueia abuso).
- **Quota check:** retorna `{ total, used, available }` cacheado por 5 min.

### Fluxo OAuth (admin conectando o Drive)

```
1. Admin clica "Conectar Google Drive" na tab Integrações
2. App abre browser do sistema com URL OAuth do Google
   (state param = nonce assinado, redirect_uri = edge function)
3. Admin autoriza no Google
4. Google redireciona pra edge function com code
5. Edge function:
   a. Troca code por refresh_token + access_token
   b. Pega user info (email, google_user_id) via Google API
   c. Cria pasta "Leviticus" no Drive do admin se não existir
   d. Salva drive_accounts row (refresh_token criptografado)
   e. Redireciona pra leviticus://oauth-success?nonce=... (deep link)
6. App captura deep link via tauri-plugin-deep-link
7. UI atualiza pra estado conectado
```

Tem que registrar o protocolo `leviticus://` no Info.plist (macOS) e usar tauri-plugin-deep-link.

### Escopo OAuth solicitado

```
https://www.googleapis.com/auth/drive.file
```

Esse escopo (`drive.file`) é o **mínimo necessário** e o mais seguro: app só vê arquivos que ele mesmo criou. Não enxerga outros arquivos do Drive do admin. Reduz preocupação de privacidade e simplifica passar pela revisão de OAuth do Google.

## Fluxos detalhados

### Fluxo 1: Adicionar música via upload (caminho principal)

1. Usuário clica "+" na biblioteca → abre AddSongModal, tab "Arquivo" ativa.
2. Arrasta/seleciona arquivo. Limite: 100 MB.
3. App detecta formato lendo header do arquivo (não fia em extensão).
4. **Pre-check de quota:** chama `drive-proxy/quota`. Se `available < tamanho_arquivo * 1.5` (margem pra compressão temp), mostra erro inline.
5. Step 2: usuário preenche metadata (título, artista, ministérios, song_type).
6. Step 3 (download/processamento):
   - Salva metadata no Supabase: `source='upload'`, `original_format=...`, `backup_status='pending'`.
   - Copia arquivo pra `$APPLOCALDATA/audio/{songId}.{ext}` local.
   - Se lossless (wav/flac/aiff): chama `ffmpeg` via Tauri Command pra criar `{songId}.opus` num temp dir, bitrate 160k. Calcula SHA-256.
   - Se lossy (mp3/m4a/aac/ogg/opus): usa o próprio arquivo.
   - Chama `drive-proxy/upload-session` com `{ songId, filename, size, hash }`. Recebe `resumable_upload_url`.
   - PUT chunked direto pro Google (com retry exponencial em 5xx).
   - Edge function recebe webhook de conclusão ou app faz `file-info` pra confirmar. Atualiza `songs.drive_file_id`, `drive_file_size`, `backup_status='uploaded'`.
7. Step 4: sucesso. Toast: "Música adicionada e salva no Drive".

**Se passo 6 falha** (rede, Drive cheio, Google indisponível): mantém arquivo local + `backup_status='pending'`. Adiciona row em `pending_drive_uploads`. Sync worker retry.

### Fluxo 2: Adicionar via YouTube (caminho secundário)

1. Tab "YouTube" da AddSongModal mostra disclaimer amarelo no topo.
2. Busca/cole link funciona como hoje.
3. Após escolher resultado: igual fluxo atual até o `downloadSong()` baixar o arquivo do yt-dlp.
4. **Adicional:** após download terminar, fluxo continua igual ao 1.6 a partir do "Chama `drive-proxy/upload-session`" (com `source='youtube'`, formato = o que yt-dlp baixou, sem recompressão).

### Fluxo 3: Tocar/baixar do Drive (música não está local)

1. Usuário clica play em música com `drive_file_id != null` mas sem arquivo local.
2. App chama `drive-proxy/download-url?file_id=...`. Recebe URL temporária (1h).
3. Mostra estado "Baixando do Drive" com progress bar.
4. Stream chunked GET → escreve em `$APPLOCALDATA/audio/{songId}.{ext}` (atomic via .partial → rename).
5. Verifica hash SHA-256 contra `drive_file_hash`. Se bate, marca como disponível. Se não, deleta e mostra erro "Arquivo corrompido — peça pra alguém reupar".
6. Inicia playback assim que arquivo está em disco.

**Pré-fetch:** quando usuário entra num culto/playlist, app dispara download em background de todas as músicas que faltam local, em ordem da playlist.

### Fluxo 4: Música excluída do device (limpeza local)

1. Usuário clica "Remover do dispositivo" no song card.
2. App apaga `$APPLOCALDATA/audio/{songId}.*`.
3. Não toca no Drive nem no Supabase. Song card passa a mostrar "No Drive" com botão de baixar.

### Fluxo 5: Setup inicial — backup das músicas existentes

Quando admin conecta Drive pela primeira vez numa org que já tem músicas:

1. App enumera local: quantas músicas com arquivo presente, total em bytes.
2. Background worker começa a subir em ordem de adição (FIFO). Cada upload segue o fluxo 1 a partir do passo 6 (compressão se lossless, upload, marca uploaded).
3. UI mostra na tab Integrações um card "Migrando: 14 de 38 músicas (62 MB de 142 MB)" com barra de progresso. Continua mesmo se o admin fechar a tela.
4. Para músicas que o admin não tem localmente: `backup_status` fica `pending`. Membro com a música abrindo o app dispara upload similar (sync worker dele).
5. Conflito (dois membros subindo a mesma música simultaneamente): o segundo recebe erro "já existe" da edge function (que valida por `song_id`). Ele deleta o arquivo temp e marca como uploaded.

### Fluxo 6: Trocar conta Google

1. Admin clica "Trocar conta" na tab Integrações.
2. Modal de confirmação transparente (mockup aprovado): explica os 3 passos.
3. Admin confirma:
   - App baixa todas as 38 músicas da conta atual pro device do admin (com progress).
   - App revoga `drive_accounts` row atual, marca `backup_status='pending'` em todas as músicas.
   - Abre OAuth fluxo da nova conta. Admin loga.
   - Após sucesso, sync worker sobe tudo de novo na nova conta.
4. Durante a migração, outros membros veem mensagem "Backup em manutenção — uploads/downloads pausados" e operações ficam em fila local.
5. Pasta antiga não é apagada — fica como backup.

### Fluxo 7: Drive cheio

Detalhado na seção "Erros e recuperação".

## Erros e recuperação

### Detecção contínua

- App consulta `/quota` na edge function:
  - Ao abrir o app (boot)
  - A cada 10 min em background
  - Antes de cada upload novo
- Resultado fica em `drive_accounts.last_quota_*` e propaga pra UI.

### Estados visuais escalonados

| Uso do Drive | Tab Integrações | Biblioteca | Comportamento |
|---|---|---|---|
| < 85% | Verde, "Em dia" | Banner some se 100% sincronizado | Uploads normais |
| 85-94% | Amarelo, "Espaço acabando" | Banner amarelo "Espaço acabando" se houver pendentes | Uploads continuam, alerta admin |
| 95-99% | Amarelo escuro, "Quase no limite" | Banner amarelo + push admin | Uploads continuam |
| 100% / próximo não cabe | Vermelho, "Backup pausado" | Banner vermelho + push admin | Novos uploads bloqueados, retries pausados, lista pendentes mostrada |

### Cenários específicos

1. **Token expirado/revogado pelo admin no Google:** edge function detecta `invalid_grant` no refresh, marca `drive_accounts.refresh_token_encrypted = null`. Tab Integrações mostra "Reconectar Google Drive". Banner vermelho na biblioteca.
2. **Pasta "Leviticus" apagada no Drive:** edge function detecta 404 em download/upload. Tab Integrações mostra "Pasta de backup não encontrada — clique pra recriar". Botão recria a pasta vazia e marca todas as músicas como `backup_status='pending'` pra resubir.
3. **Arquivo específico apagado no Drive:** download retorna 404. App marca `songs.drive_file_id=null, backup_status='pending'`. Song card vira "Indisponível — Resubir" se algum membro tiver o arquivo local, senão "Perdido" com nota pro admin.
4. **Drive cheio mid-upload:** Google retorna 403 com `storageQuotaExceeded`. App marca upload como falho, song fica `backup_status='pending'`. Banner vermelho aparece.
5. **Drive cheio antes de upload (single file > available):** mostrado inline no AddSongModal antes de iniciar (mockup aprovado). Botão "Continuar" desabilitado.
6. **Rate limit do Google (403 userRateLimitExceeded):** retry com exponential backoff (1s, 2s, 4s, 8s, 30s, 60s). Após 5 falhas, marca como `failed` no `pending_drive_uploads.last_error`.
7. **Sem internet:** todas as operações ficam em fila local. Retoma ao detectar conectividade.
8. **Edge function fora do ar:** toast genérico "Algo deu errado, tente em alguns minutos." Operações ficam em fila.
9. **Hash mismatch após download:** deleta arquivo local, marca song como precisa-redownload. Toast: "Arquivo corrompido — tentando de novo." Retenta uma vez. Se falhar de novo: mostra como "Indisponível".

### Recuperação acionável (admin)

Três ações disponíveis no card vermelho:

1. **Liberar espaço no Drive** — abre `https://drive.google.com/drive/quota` em browser.
2. **Atualizar plano Google One** — abre `https://one.google.com/about`.
3. **Trocar pra outra conta** — usa fluxo 6.

### Membros sem permissão `manage_integrations`

Veem os estados de erro com copy diferente ("Avise um admin") e lista de admins da org. Nunca veem botões de ação direta sobre o Drive.

## Compressão — detalhes

| Formato de entrada | Ação | Output no Drive |
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

| Componente | Mockup aprovado |
|---|---|
| AddSongModal Step 1 | Direção B (tabs Arquivo/YouTube) — `add-song-modal-direction.html` |
| Tab YouTube | Disclaimer amarelo no topo — `youtube-tab-and-redownload.html` |
| Biblioteca — backup status | Banner global + ponto sutil + chip filtro — `library-backup-indicator.html` |
| Tab Integrações (saudável) | Card com email, pasta, barra de quota segmentada, stats — `drive-in-org-tab-v2.html` |
| Tab Integrações (Drive cheio) | Card vermelho + 3 ações de recuperação + lista de pendentes — `drive-full-states.html` |
| Modal de troca de conta | Confirmação transparente com 3 passos — `drive-settings-and-swap.html` |
| AddSongModal erro de espaço | Inline no Step 1 — `drive-full-states.html` (tela 2) |
| Lista da biblioteca com download | Estados play/baixar/baixando/indisponível — `youtube-tab-and-redownload.html` (tela 2) |

Os HTMLs estão em `.superpowers/brainstorm/47383-1778847037/content/`.

## Custos previstos

| Item | Custo |
|---|---|
| Supabase Edge Function (até ~500 orgs ativas) | $0/mês (cabe no Free tier, 500K invocações) |
| Bandwidth/egress | $0 (bytes vão direto Tauri ↔ Google) |
| Storage dos arquivos | $0 pra nós — fica no Drive do admin |
| Google Drive API | $0 (gratuita até 1B req/dia) |
| Token storage Supabase | desprezível |
| Google Cloud Project pra OAuth client | $0 |

Setup único: criar projeto no Google Cloud, configurar OAuth consent screen (em modo "External" + "Production" — vai precisar passar pela verificação do Google pra escopo `drive.file`, geralmente 1-2 semanas).

## Testes

### Unit (vitest, sem DOM)

- `compression.ts`: detecção de formato (mock filesystem com magic bytes de cada tipo); decisão recomprime-ou-não.
- `status.ts`: máquina de estados de `backup_status` — todas as transições válidas e bloqueadas.
- `sync-worker.ts`: lógica de retry com backoff exponencial.
- `client.ts`: serialização das chamadas pra edge function, tratamento de erros HTTP.

### Component (RTL + jsdom)

- `AddSongModal`: cobertura nova tab YouTube + estados de erro de espaço + transição entre tabs.
- `LibraryBackupBanner`: estados (sem account, espaço acabando, drive cheio).
- `OrgIntegrations`: 3 estados (desconectado, conectado, Drive cheio).
- `SongCard`: badge "sem backup", botão "Baixar do Drive", estado baixando.

Todos com `mockIPC` interceptando `invoke()` e mock do módulo `drive/client.ts`.

### E2E (Linux CI, novo spec)

Nova jornada **11. Backup Google Drive (admin)**:

1. Admin conecta Drive (OAuth mockado — edge function fake retorna sucesso).
2. Adiciona música via upload (arquivo de teste WAV pequeno).
3. Verifica que aparece como "uploaded" na biblioteca.
4. Apaga arquivo local manualmente.
5. Clica play — verifica download do Drive (edge function fake serve bytes).
6. Verifica reprodução.

E **12. Backup Google Drive (membro)**: idem mas sem ver botões de troca de conta. Verifica que membro sem permissão vê só estado, não controles.

### O que NÃO testar em E2E

- OAuth real do Google (mocked completamente).
- API do Google Drive real (edge function fake).
- Compressão real de ffmpeg (mock no `invoke('compress_to_opus')`).

## Migração e rollout

### Compatibilidade backward

Mudança de schema é 100% aditiva: novas colunas com defaults, novas tabelas. Apps em campo na versão anterior continuam funcionando:

- Eles ignoram `drive_file_id`, `backup_status` etc — não usam essas colunas em select/insert/update.
- Eles continuam fazendo download do YouTube e gravando local sem subir pro Drive.
- Quando atualizarem, o sync worker percebe que tem músicas com `drive_file_id=null` e começa a subir (se Drive conectado).

### Setup do Google Cloud (uma vez, manual)

1. Criar projeto no Google Cloud Console.
2. Ativar Google Drive API.
3. Criar OAuth client ID (tipo "Desktop application" ou "Web application" dependendo do fluxo).
4. Configurar consent screen com scope `drive.file`.
5. Submeter pra verificação (necessário pra usar em modo Production).
6. Adicionar credenciais como secrets no Supabase: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

### Rollout

Lançar tudo numa release única (`feat:` → minor bump):
- Migration Supabase
- Migration SQLite
- Edge function
- App com nova UI

Antes do rollout: confirmar que app antigo continua funcionando contra novo schema (testar manualmente com binário da versão anterior).

## Fora de escopo desta spec

Itens conscientemente excluídos:

- **Múltiplas pastas no Drive** (uma por ministério, etc.) — uma pasta única "Leviticus" por org.
- **Sincronização entre orgs diferentes** — cada org tem seu Drive isolado.
- **Versionamento de músicas** — uma versão, sem histórico.
- **Streaming sem download** — sempre baixa o arquivo inteiro antes de tocar.
- **Recompressão adaptativa quando Drive cheio** — decisão tomada de manter simples.
- **Pausar backup** — não pode ser desabilitado; única forma é desconectar Drive inteiro.
- **Outros provedores de cloud (Dropbox, OneDrive)** — espaço reservado na UI mas implementação fica pra depois.
- **Mobile remote control** — não interage com Drive (existente).
- **Compartilhamento da pasta Drive com outros usuários** — não usamos. Tudo via edge function com token do admin.
- **Upload em massa (zip de músicas)** — uma de cada vez via modal.
- **Editar tags ID3 do arquivo** — preserva original.

## Riscos identificados

1. **Verificação OAuth do Google demora** — usar escopo `drive.file` reduz o atrito (não pede verificação restrita), mas ainda precisa passar por consent screen review (1-2 semanas). Mitigação: iniciar processo no início da implementação, não no final.
2. **Quota Drive grátis (15 GB) acaba rápido** — uma igreja com 200 músicas WAV reaproveitadas usaria ~3 GB; com Opus 160k usa ~500 MB. Mas se o admin tem fotos/email/outras coisas competindo, satura. UX educa sobre Google One.
3. **Bug de hash mismatch em escala** — se ffmpeg variar saída entre versões, hashes podem divergir. Mitigação: gerar hash do **arquivo final** que vai pro Drive (não do input), assim a referência é o que está no Drive de fato.
4. **Edge function cold start** — invocações esporádicas têm latência de 200-500ms. Aceitável pra UX (usuário vê "Conectando...").
5. **Resumable upload de arquivos grandes em rede ruim** — implementar retry com `Content-Range` correto, retomar de onde parou. Não é trivial. Vale ter testes de rede flaky.

## Próximos passos

1. Spec aprovada → escrever plano de implementação detalhado (writing-plans skill).
2. Plano deve quebrar em fases independentes: edge function + schema → módulo drive client → UI da modal → UI da biblioteca → UI da tab Integrações → migração inicial → erros e recuperação.
3. Cada fase com testes correspondentes antes de avançar.
