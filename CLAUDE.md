# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Leviticus is a church music player — a Tauri v2 desktop app (macOS) that lets worship teams manage songs, download audio from YouTube, and organize setlists (called "cultos") and ministries. It uses a dual-database architecture: Supabase (remote, source of truth) + SQLite via `tauri-plugin-sql` (local cache for offline use).

## Monorepo Structure

```
apps/desktop/     # Tauri v2 + React 18 + TypeScript desktop app
  src/            # React frontend
  src-tauri/      # Rust backend (lib.rs, Cargo.toml, capabilities/, migrations/)
packages/core/    # Shared TypeScript types used by desktop and worker
worker/           # Express.js background service (yt-dlp job queue, optional)
supabase/         # Supabase local dev config and migrations
```

Package manager: **pnpm** (workspaces). Always use `pnpm`, never `npm` or `yarn`.

## Commands

### Desktop app
```bash
# Dev (starts Vite + Tauri, requires Supabase running)
cd apps/desktop && pnpm tauri dev

# Production build
cd apps/desktop && pnpm tauri build

# TypeScript check only
cd apps/desktop && pnpm build   # runs tsc && vite build

# Run tests
cd apps/desktop && pnpm test
# Run a single test file
cd apps/desktop && pnpm vitest run src/lib/sync.test.ts
```

### Supabase local
```bash
supabase start          # starts local Supabase (Docker)
supabase status         # check if running + get connection URLs
supabase migration up   # apply pending migrations to local DB
supabase stop
```

### Monorepo
```bash
pnpm test       # runs tests across all packages
pnpm typecheck  # runs typecheck across all packages
```

### Worker
```bash
cd worker && pnpm dev   # tsx watch (development)
```

## Architecture

### Dual-database pattern
- **Supabase** (PostgreSQL, remote) is the source of truth for all data. All writes go to Supabase first.
- **SQLite** (local, via `tauri-plugin-sql`) is a read cache. After every Supabase write, `syncOrg(orgId)` is called to pull the latest data into SQLite.
- UI reads come from SQLite (fast, offline-capable). UI writes go to Supabase then trigger a sync.
- `src/lib/sync.ts` — `syncOrg()` pulls incremental changes using `updated_at >= last_sync`. Junction tables (`song_groups`, `playlist_songs`) lack `updated_at` so are always fully re-fetched.
- `src/lib/db.ts` — singleton `getDb()` for SQLite access; also manages `sync_metadata` table that stores the last sync timestamp per org.

### Supabase client
`src/lib/supabase.ts` — configured with `@tauri-apps/plugin-http`'s `fetch` as the global fetch implementation. This is **required** because WebKit (macOS) blocks direct fetch to `127.0.0.1` (local Supabase). All Supabase HTTP calls go through Tauri's Rust-side HTTP client.

### HTTP permissions
`src-tauri/capabilities/default.json` — the `http:allow-fetch` permission lists allowed URL patterns. If a new remote URL is needed, add it here. Current scope: `http://127.0.0.1:54321/**`, `https://*.supabase.co/**`, `https://*.supabase.io/**`.

### Audio playback
`src/audio.ts` (not in `src/lib/`) — singleton Howler.js instance. **Must use `html5: true`** because the `asset://` Tauri protocol requires HTML5 audio mode. File paths are converted via `convertFileSrc()` before passing to Howler. The `PlayerMini` component polls `getPosition()` every 500ms while playing.

### Player state
`src/store/player.ts` — Zustand store. Holds `currentSong`, `currentPlaylist`, `playlistSongs`, `playlistPosition`, `isPlaying`, `volume`. Playlist navigation (`nextInPlaylist`, `previousInPlaylist`) mutates position in the store. **The store does not call Howler directly** — `PlayerMini` bridges store state and Howler calls.

### Media keys (macOS)
Registered in Rust (`src-tauri/src/lib.rs`) via `tauri-plugin-global-shortcut`. Only fires on `ShortcutState::Pressed` (not Released) to avoid double-trigger. Emits Tauri events (`media-play-pause`, `media-next`, `media-prev`) that `PlayerMini` listens to via `@tauri-apps/api/event`'s `listen()`.

### SQLite migrations
Two locations — they must stay in sync:
- `src-tauri/migrations/` — applied to the **local** SQLite DB at app startup via `tauri-plugin-sql`.
- `supabase/migrations/` — applied to **Supabase** (local dev via `supabase migration up`, remote via `supabase db push`).

### Auth flow
1. `App.tsx` calls `supabase.auth.getSession()` on mount; redirects to `/login` if no session.
2. After login → `/org` (org select/create) → sets `leviticus_org_id` in `localStorage`.
3. `orgId` is read from `localStorage` throughout the app (not from a store).
4. Inserts into `playlists` require `created_by: user.id` (NOT NULL FK to `auth.users`). Retrieve with `supabase.auth.getUser()` before insert.

### Realtime / remote control
`src/lib/realtime.ts` — Supabase Realtime channel `remote-control:{userId}`. Desktop announces presence and listens for broadcast commands. Used by a potential mobile remote control feature.

### Shared types
`packages/core/src/` — TypeScript types only (`Song`, `Playlist`, `DevicePresence`, etc.). Must be built (`pnpm build` in `packages/core`) before the desktop app can use them. In practice, the workspace resolves `@leviticus/core` from source via `dist/`.

## UI conventions

- **Never use emojis** in React components, UI text, or user-facing messages.
- **Always use icons from lucide-react** (already installed) for visual representations. Example: `<Check size={16} />` instead of "✓", `<Music size={20} />` instead of any music emoji.
- Import icons with named imports: `import { Check, Music, Plus } from 'lucide-react'`.

## Error messages

Always show clear, friendly error messages in Portuguese. Rules:
- If the error has a known cause (validation, network, missing field), show a specific and actionable message. Example: `"ID do vídeo não encontrado. Use um link no formato youtube.com/watch?v=..."`.
- If the error is unexpected or comes from an internal/server exception, show a generic friendly fallback: `"Algo deu errado. Tente novamente."` — never expose raw error objects, stack traces, or Supabase internal messages to the user.
- Log the raw error to `console.error` before showing the friendly version so it remains debuggable.
- Pattern used throughout the app: `setError(insertError?.message ?? 'Fallback amigável')` — replace raw `.message` exposure with a curated message whenever the error originates from Supabase or Tauri internals.

## Migrations checklist

Toda alteração de schema no Supabase precisa ser **retrocompatível com a versão do app que está em produção**. Apps antigos continuam rodando até o usuário aceitar o auto-update — não podem quebrar enquanto isso.

### Regras

1. **Aditivo por padrão.** Colunas novas devem ser `NULL` ou ter `DEFAULT`. Tabelas novas e índices são livres. Nunca adicione `NOT NULL` sem default em coluna nova numa tabela com dados.
2. **Nunca dropar/renomear numa única migration.** Renomear ou remover coluna que o app em campo ainda usa quebra writes/reads. Faça em duas releases (expand-and-contract):
   - **Release N (expand)**: adiciona coluna nova, copia dados, mantém a antiga. Trigger ou app v2 espelha entre as duas.
   - Lança app v2 (que usa só a nova) e espera o auto-update propagar.
   - **Release N+1 (contract)**: dropa a coluna antiga. Só depois que telemetria confirmar que ~todos estão na v2.
3. **Nunca mude tipo de coluna existente** (`text → int`, etc.) — vira expand-and-contract com coluna nova.
4. **Nunca adicione FK obrigatória** em coluna nova com NOT NULL — vira nullable, backfill, e só depois (numa release futura) NOT NULL.
5. **Inserts/Updates do app sempre listam colunas explicitamente.** Nunca confiar em `select('*')` pra montar payload de write — listar apenas os campos que o app conhece. Isso já é o padrão; manter.
6. **Selects do sync listam colunas explicitamente.** [sync.ts](apps/desktop/src/lib/sync.ts) deve usar `.select('id, org_id, ...')` ao invés de `.select('*')` — torna o contrato explícito e previne surpresas com colunas novas.
7. **Migrations Supabase e SQLite local andam juntas.** Toda mudança em [supabase/migrations/](supabase/migrations/) que afete tabelas sincronizadas precisa de migration espelho em [apps/desktop/src-tauri/migrations/](apps/desktop/src-tauri/migrations/), aplicada em release de app subsequente.
8. **Quebra inevitável → version gate.** Se uma mudança *não pode* ser retrocompatível (raro), use a tabela `app_config.min_supported_version`. App checa no boot e mostra tela bloqueante "Atualize pra continuar". Reservar pra emergências.

### Antes de aprovar uma migration de schema

- [ ] É aditiva (nova coluna nullable/com default, nova tabela, novo índice)? Se não, ela está numa release "expand" com a "contract" planejada pra release futura?
- [ ] Existe migration espelho em `apps/desktop/src-tauri/migrations/` se a tabela é sincronizada?
- [ ] Algum `.select()`/`.insert()`/`.update()` no app vai quebrar? (`grep` pelo nome da coluna que mudou)
- [ ] App da versão atual em produção continua funcionando contra o schema novo? (testar manualmente: rodar binário antigo contra Supabase com migration aplicada)

## Releasing

Releases são publicadas no GitHub a partir de tags `v*`. O workflow [.github/workflows/release.yml](.github/workflows/release.yml) builda em runner macOS Apple Silicon, gera `.dmg` (e bundle assinado pra updater) e cria a GitHub Release automaticamente.

### Fluxo de release (preferido — pela UI do GitHub Actions)

1. Vai em [Actions → Release Bump → Run workflow](https://github.com/JoaoSipauba/leviticus/actions/workflows/release-bump.yml).
2. Escolhe o tipo de bump (`patch` | `minor` | `major`) e clica em Run workflow.
3. O job no Ubuntu roda `pnpm release ${bump} --ci`, bumpa versão (package.json + Cargo.toml + CHANGELOG.md), commita, cria + pusha a tag e logo em seguida dispara o workflow `Release`.
4. `Release` builda macOS + Windows em paralelo (~10–15 min) e publica `.dmg` / `.exe` / `latest.json` no Supabase Storage e na aba Releases.

### Fluxo de release (fallback — local)

```bash
# Em apps/desktop, com working dir limpo, na branch main:
pnpm release patch --ci
# → release-it bumpa versão (package.json + Cargo.toml), gera CHANGELOG.md,
#   commita, cria tag vX.Y.Z e dá push.
# Push da tag dispara o workflow Release (não passa pelo Release Bump).
```

### Auto-updater — setup inicial (uma vez só)

O updater verifica assinatura criptográfica dos bundles antes de instalar. Sem a chave configurada, o app builda mas o updater não funciona.

1. **Gerar keypair Tauri localmente:**
   ```bash
   pnpm --filter appsdesktop tauri signer generate -w ~/.tauri/leviticus.key
   ```
   Cria `~/.tauri/leviticus.key` (privada) e `~/.tauri/leviticus.key.pub` (pública). Define uma senha forte — vai ser a `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

2. **Colocar pubkey em [tauri.conf.json](apps/desktop/src-tauri/tauri.conf.json):**
   Copiar o conteúdo de `~/.tauri/leviticus.key.pub` (uma única linha em base64) pro campo `plugins.updater.pubkey`. Commitar e fazer push.

3. **Adicionar secrets ao GitHub** (Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY`: conteúdo completo de `~/.tauri/leviticus.key` (multi-linhas, incluindo headers).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: a senha definida no passo 1.

4. **Backup da privada.** Guarde `~/.tauri/leviticus.key` em local seguro (1Password, etc.). Se perder, **nenhum app antigo aceita updates futuros** — todo mundo precisaria reinstalar manualmente.

A partir daí, toda release lança bundle assinado e os apps em campo se atualizam automaticamente quando detectam nova versão.

### UX do updater

[UpdateNotification.tsx](apps/desktop/src/components/UpdateNotification.tsx) mostra um toast no canto inferior direito quando há nova versão. Comportamento:

- Check inicial 5s após boot, depois a cada 6h.
- **Nunca atualiza durante reprodução**: se `usePlayerStore.getState().isPlaying === true`, o check é adiado por 5 minutos. Evita interromper culto.
- Botões: **Atualizar agora** (download + instala em background) ou **Mais tarde** (silencia até a próxima versão).
- Após instalar, modal pede pra reiniciar — usuário pode adiar e o update aplica no próximo restart natural.
- Falhas no check (offline, pubkey inválida, endpoint fora do ar) são silenciosas — não incomodam o usuário.

## Key constraints

- `tsconfig.json` has `noUnusedLocals: true` — unused variables cause build failures.
- YouTube URLs must have a `v=` parameter. The `fetchYoutubeMetadata` function in `src/lib/ytdlp.ts` auto-prepends `https://` if missing.
- Audio files are stored at `$APPLOCALDATADIR/audio/{songId}.mp3`. The `assetProtocol` scope in `tauri.conf.json` must cover `$APPLOCALDATA/**` to serve them.
- **yt-dlp é baixado em runtime pra `$APPLOCALDATA/bin/yt-dlp(.exe)` no primeiro uso.** Não bundlamos no `.app` porque Tauri roda `codesign --deep -s -` (ad-hoc) e re-assina TODOS os binários internos — isso quebra o Python.framework dentro do yt-dlp_macos (PyInstaller bundle) por mismatch de Team ID. Solução: deixar o binário fora do bundle. Comando Rust `ensure_yt_dlp` em [yt_dlp.rs](apps/desktop/src-tauri/src/yt_dlp.rs) baixa do GitHub releases (pin em `YT_DLP_VERSION`). [ytdlp.ts](apps/desktop/src/lib/ytdlp.ts) chama `invoke('ensure_yt_dlp')` antes de cada `Command.create('yt-dlp', ...)`. A capability shell mapeia o nome `yt-dlp` pra `$APPLOCALDATA/bin/yt-dlp(.exe)` via [yt-dlp-mac.json](apps/desktop/src-tauri/capabilities/yt-dlp-mac.json) e [yt-dlp-win.json](apps/desktop/src-tauri/capabilities/yt-dlp-win.json).
- **ffmpeg** ainda é usado só pela função `exportSongToMp3` (export para mp3) e segue dependente de instalação no sistema (`/opt/homebrew/bin/ffmpeg` em macOS, não disponível em Windows). O fluxo principal (busca/download/preview) não precisa de ffmpeg porque o yt-dlp baixa m4a/opus nativos sem reencodar.
- `tauri-plugin-global-shortcut` registration is wrapped in `let _ =` (not `?`) to prevent the app from crashing if macOS Accessibility permission is denied.

## Perceived performance

The app must always feel fast and snappy to the user. Every interaction should feel instantaneous. Rules:

- **Seek / click interactions**: apply `transition: none` at the moment of click; re-enable a short transition (≤ 0.15s) afterwards for smooth passive updates. Never let a CSS animation delay a user-triggered action.
- **CSS transitions**: keep them short (≤ 0.2s for UI state changes, ≤ 0.15s for data-driven fills like progress bars). Reserve longer transitions only for entrance/exit animations on modals or overlays.
- **State updates on user input**: update state synchronously and immediately — never make visual feedback wait for a promise to resolve when the result is already known.
- **Audio/media**: seek and volume changes must be applied to the media element before any visual state update, so the audio never lags behind the UI.
- When in doubt: remove the animation before shipping, rather than ship something that feels slow.
