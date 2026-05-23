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

### Regra: nunca use `fetch` nativo pra HTTP cross-origin

**Sempre** importe `fetch` de `@tauri-apps/plugin-http` (alias comum: `tauriFetch`). O `fetch` nativo do WebKit aplica CORS, e servidores externos (Google Drive, Supabase Edge Functions, oEmbed, etc.) não autorizam `Origin: http://localhost:1420` ou `Origin: tauri://localhost`. Resultado: navegador bloqueia com `Access-Control-Allow-Origin`.

Padrão em qualquer arquivo que faz HTTP:
```ts
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
const res = await tauriFetch(url, { method: 'POST', headers: {...}, body: JSON.stringify(body) })
```

Em testes Vitest, mock o módulo aliasando pro `globalThis.fetch` stubado:
```ts
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => (globalThis.fetch as any)(...args),
}))
```

URLs novos precisam ser adicionados ao `http:allow-fetch` em `capabilities/default.json`.

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

### Animações e hovers — obrigatórios em UI nova

Toda tela/componente novo, e todo ajuste de UI existente, **deve** ter
animações e estados de hover sempre que fizer sentido. Interface estática
parece quebrada ou barata. Regras:

- **Hovers**: todo elemento interativo (botão, card, linha de lista, ícone
  clicável, aba) precisa de feedback de hover — mudança de cor/fundo/opacidade.
  Use `transition-colors` ou `transition` curtas (ver "Perceived performance").
- **Entrada/saída**: modais, dropdowns, toasts, banners e itens que aparecem
  dinamicamente entram (e idealmente saem) com animação.
- **Reuse o vocabulário do projeto.** As animações vivem em
  [src/index.css](apps/desktop/src/index.css) como `@keyframes` + classes
  `.animate-*` (`animate-modal-in`, `animate-modal-out`, `animate-fade-slide-in`,
  `animate-pop-in`, `animate-dock-in`, `animate-pulse-light`, etc.). **Sempre
  prefira uma classe existente** a inventar uma animação nova. Se precisar de
  algo novo, adicione um `@keyframes` + classe no mesmo arquivo, no mesmo estilo
  (durações curtas, easing `cubic-bezier` consistente com as demais).
- **Não invente estética divergente**: durações, easings e intensidade devem
  bater com o que o resto do app já faz. Animação chamativa/lenta destoa.
- Respeite a régra de "Perceived performance" abaixo: animações nunca podem
  atrasar o feedback de uma ação do usuário.

## Funcionalidades core — padrões da indústria

Pra funcionalidades **CORE** do app — áudio, player, drag-and-drop, formulários complexos, autenticação, upload de arquivos, sync offline-first — siga os padrões consolidados da indústria. Não invente sua versão a menos que tenha razão muito específica (e a razão precisa ser commitada no código + CLAUDE.md).

**Antes de implementar uma feature core**, pesquise o estado da arte (1-2 referências bastam, ex: MDN, biblioteca mais usada, blog técnico recente). Documente no PR a abordagem escolhida e POR QUE diverge se divergir.

**Sinais de que você está reinventando errado:**
- Acumulando workarounds (visibilitychange, defensive checks, polling com guards) — geralmente o padrão da indústria já resolve isso na arquitetura
- Comportamento erra "ocasionalmente" — bug de race condition / event timing é sintoma de polling onde devia ter listener
- 3+ issues abertas no mesmo arquivo apontando pra mesma área — refactor pendente

**Áudio especificamente:**
- Preferir eventos do `HTMLMediaElement` (`timeupdate`, `ended`, `loadedmetadata`, `error`) a polling com `setInterval`
- `timeupdate` é browser-managed: pausa em tab inativa, dispara ~250ms automático
- `ended` é a fonte da verdade pro fim — defensive `pos >= duration` só como sanity check
- Howler.js é uma escolha legítima como wrapper, mas com `html5: true` (necessário em Tauri pelo `asset://`) o `onend` é flaky — favorecer listeners nativos quando possível

**Drag-and-drop, formulários, etc.**: aplicar a mesma régua. Pesquisar 1-2 referências, divergir só com razão escrita.

A dívida arquitetural histórica de áudio (Howler+polling) está documentada em #63 — não bloqueia ship, mas sinaliza que o padrão "polling com workarounds" deve ser evitado em features novas.

## Error messages

Always show clear, friendly error messages in Portuguese. Rules:
- If the error has a known cause (validation, network, missing field), show a specific and actionable message. Example: `"ID do vídeo não encontrado. Use um link no formato youtube.com/watch?v=..."`.
- If the error is unexpected or comes from an internal/server exception, show a generic friendly fallback: `"Algo deu errado. Tente novamente."` — never expose raw error objects, stack traces, or Supabase internal messages to the user.
- Log the raw error to `console.error` before showing the friendly version so it remains debuggable.
- Pattern used throughout the app: `setError(insertError?.message ?? 'Fallback amigável')` — replace raw `.message` exposure with a curated message whenever the error originates from Supabase or Tauri internals.

## Action feedback

Toda ação do usuário precisa de feedback explícito — sucesso *e* falha. Silêncio depois de um clique deixa o usuário sem saber se algo aconteceu.

Regras:
- **Sucesso**: use `toastSuccess('Mensagem curta em pt-BR')` de `src/store/toasts.ts` logo após a ação concluir. Exemplos: "Música removida do dispositivo", "MP3 exportado", "Setlist salvo".
- **Falha**: use `toastError('Mensagem amigável')` no `catch` — depois de logar o erro cru com `console.error`. Nunca apenas `console.error` + `return`: o usuário precisa saber que falhou.
- **Operações longas**: mostre estado intermediário (spinner, label "Removendo…", barra de progresso) durante o `await`, e fecha com toast no fim.
- **Operações destrutivas** (deletar música/culto/conta): além do toast de sucesso, exija confirmação inline ou modal antes — feedback ≠ substituir confirmação.
- **Mudanças mudas ok**: filtros, edição em tempo real de campos, navegação — não precisam de toast porque a própria UI reflete o resultado.

Antes de marcar uma ação como pronta, verifique: o usuário vê confirmação? Se não, adicione toast.

## Observabilidade (Sentry)

Toda exceção em fluxo crítico precisa ir pro Sentry pra a gente conseguir debugar em produção sem depender de bug report manual. Issue #39.

Padrão: importe `captureException` de [src/lib/observability.ts](apps/desktop/src/lib/observability.ts) e use no `catch`:

```ts
import { captureException } from '../lib/observability.js'
import { toastError } from '../store/toasts.js'

try {
  await uploadSongToDrive(...)
} catch (e) {
  captureException(e, { feature: 'add-song', step: 'upload-drive', extras: { songId } })
  toastError('Música baixada, mas backup falhou. Tente de novo depois.')
}
```

Convenções:
- **`feature`**: módulo do app (`add-song`, `sync`, `audio`, `cloud-storage`, `auth`).
- **`step`**: etapa dentro do fluxo (`upload`, `download`, `decrypt`, `refresh-token`).
- **`extras`**: contexto extra que ajuda a reproduzir (`songId`, `orgId`, `url`).
- **Não passe dados sensíveis** (senhas, tokens, conteúdo de mensagens).

`captureException` **sempre** loga em `console.error` primeiro — funciona em dev mesmo sem DSN. Em prod, manda pro Sentry + console. No-op (sem erro) se `VITE_SENTRY_DSN` não estiver configurada.

Outros helpers:
- `setUserContext({ id, orgId })` — chamado no login. Agrupa erros por usuário no painel.
- `addBreadcrumb('mensagem', 'category', { data })` — eventos intermediários úteis (clicou play, abriu modal). Não dispara request — fica no buffer e vai junto da próxima exceção.

Setup em prod: defina `VITE_SENTRY_DSN` como GitHub secret (`Settings → Secrets → VITE_SENTRY_DSN`) e exponha no workflow de build. Em dev local não precisa — Sentry fica desligado e logs ficam só no console (esperado).

### Cobertura no Rust (backend Tauri)

`tauri-plugin-sentry` + `sentry` crate inicializados em [src-tauri/src/lib.rs](apps/desktop/src-tauri/src/lib.rs) no `run()`. Captura:

- **Panics do Rust** (`panic!` / `unwrap()` em `None` / `expect()` que falha)
- **Crashes nativos** via minidumps (segfault, OOM, abort) — exceto em iOS
- **Erros de commands Tauri** que retornam `Err(String)` ainda **não** vão automaticamente — pra capturar, use `sentry::capture_error(&err)` antes do `return Err(...)` dentro do comando

O plugin faz **bridge entre Rust e JS SDK**: breadcrumbs e tags ficam unificados nos events. Ou seja, um panic no Rust traz junto o histórico de cliques que aconteceu antes no frontend, e vice-versa.

**Setup do DSN no Rust:** `option_env!("VITE_SENTRY_DSN")` lê em **compile time**.
- Prod: release.yml expõe a secret via `env:` antes do `pnpm tauri build` — propagado pro cargo.
- Dev local: precisa exportar antes de buildar. Exemplo:
  ```bash
  export VITE_SENTRY_DSN=https://...@sentry.io/...
  pnpm tauri dev
  ```
  Sem o export, `option_env!` devolve None e o init é skip (no-op). Frontend Sentry continua funcionando normal.

## Testing strategy

Três camadas, em ordem de custo-benefício. Toda nova feature deve ter cobertura na camada mais barata em que faz sentido — não pular pra E2E o que cabe em unit.

### Regra: cobertura é parte da definição de pronto

Toda feature nova **e** todo ajuste em feature existente exige uma passada explícita por testes antes de marcar como concluído. Não é opcional, não é "depois". O fluxo é:

1. **Antes de começar**: identificar o que vai mudar (função pura? componente? jornada de UI?) e em qual camada faz sentido cobrir (unit / component / E2E).
2. **Durante**: adicionar ou atualizar testes na camada mais barata possível. Se a mudança quebrar um teste existente, o teste tem prioridade — confirmar se a expectativa do teste continua válida antes de só "consertar" o teste.
3. **Antes de marcar pronto**: rodar `pnpm test` (e `pnpm test:e2e:local` se a mudança toca jornadas cobertas em E2E). Se houver gap óbvio sem cobertura, criar o teste antes de fechar.

Não bypassar essa checagem porque "a mudança é pequena" ou "o usuário só pediu o ajuste". Pequenas mudanças sem teste viram regressões silenciosas. Quando a cobertura realmente não fizer sentido (puro CSS, refactor sem mudança de comportamento, etc.), declare isso explicitamente no PR/handoff em vez de pular em silêncio.

### Regra: teste verde isolado E na suíte

Um teste só conta como verde se passa **rodado sozinho E rodado junto com os outros**. Antes de marcar qualquer trabalho de teste como pronto, rode as duas formas:

- **Isolado** — o arquivo sozinho (`pnpm vitest run <arquivo>`, ou `--spec ./specs/<arquivo>` no E2E).
- **Na suíte completa** — `pnpm test` e, se a mudança toca jornadas E2E, `pnpm test:e2e:local`.

Se um teste passa isolado mas falha na suíte (ou vice-versa), isso é um **defeito do teste** — vazamento de estado entre testes, race de timing, ou dependência de ordem de execução. Não é "reroda que passa": corrija a causa (isolar estado, ancorar esperas no estado real em vez de `sleep` fixo, dar timeout coerente com a lentidão sob carga) antes de fechar. Flakiness não rastreada mascara regressão real — se não der pra corrigir na hora, abra issue `type:dx` e referencie no handoff.

### Como escrever testes isoláveis (anti-flaky)

A regra acima é o *quê*; isto é o *como*. Vale pra toda camada (unit, component, E2E).

**Princípios gerais (qualquer camada):**

- **Cada teste cria e destrói o próprio estado.** Não dependa de dado que outro teste deixou, nem de ordem de execução. Se dois testes precisam do mesmo setup, cada um monta o seu (ou use `beforeEach`, não `before`).
- **`beforeEach` reseta tudo que o teste toca.** Mocks (`vi.clearAllMocks()`), refs/flags hoisted (`permState.value = true`), `localStorage`, stores Zustand. Estado de módulo que persiste entre testes é a causa nº 1 de "passa isolado, falha na suíte".
- **Nunca ancore espera em tempo fixo.** Nada de `sleep(500)` torcendo pra algo acontecer. Espere o **estado real**: o elemento existir, a row aparecer no banco, o mock ter sido chamado. `sleep` fixo passa sozinho (máquina ociosa) e falha na suíte (máquina sob carga).
- **IDs e nomes únicos por teste.** Use sufixo de timestamp (`+${Date.now()}`) em emails, nomes de org, URLs — evita colisão com rows de testes anteriores no mesmo banco.

**Unit / component (Vitest):**

- Mocks declarados com `vi.hoisted` + estado mutável (`{ value }`) devem ser **resetados no `beforeEach`** — senão o último teste que setou `false` vaza pro próximo arquivo/teste.
- Não compartilhe instância de store entre testes; recrie ou limpe (`.getState().clear()` / reset).
- Se um teste muda algo global (`vi.setSystemTime`, `vi.stubGlobal`), restaure no `finally`/`afterEach`.

**E2E (WebdriverIO):**

- **Cada spec file assume só o ponto de partida do harness** (app em `/login`, ou seja lá o que o `beforeSession` garante) — nunca o estado deixado pelo spec anterior. Se o spec precisa estar logado, ele faz o login no próprio `before`.
- **`cleanLocalSqlite()` no `before`** de qualquer spec que dependa de cache local limpo.
- **Seed via service-role admin client** (`helpers/supabase.ts`) — monte org/song/playlist direto no banco, não dependa de outro spec ter criado.
- Entre `describe`s no mesmo arquivo, se o primeiro deixou o app logado, o segundo faz signout explícito no `before` (ver `02-org-invites.spec.ts`).
- **Espere o boot terminar** (`#boot-splash` sumir) depois de cada `browser.url(...)` — o splash só some após `syncOrg`, então é o sinal de "dados prontos". Não navegue e leia a tela no mesmo tick.
- Timeouts generosos o suficiente pra suíte sob carga (a CI roda tudo serial); `waitUntil` com `timeoutMsg` descritivo, nunca `pause`.

### Stack

| Ferramenta | Versão | Onde mora |
|---|---|---|
| **vitest** + **jsdom** | 1.5 | runner + DOM emulado |
| **@testing-library/react** + **user-event** + **jest-dom** | 15 / 14 / 6 | testes de componente |
| **mockIPC** de `@tauri-apps/api/mocks` | parte do `@tauri-apps/api` | mock de `invoke()` e calls de plugins (sql, http, fs, shell) |
| **WebdriverIO** + **tauri-driver** | a configurar | E2E no Linux CI |

### Camadas

**1. Unit (lógica pura)** — [apps/desktop/src/lib/](apps/desktop/src/lib/) e [packages/core/src/](packages/core/src/).
- Sem DOM, sem Tauri. Funções puras: parsers, formatters, sync, permission resolvers.
- Já existe: [sync.test.ts](apps/desktop/src/lib/sync.test.ts), [permissions.test.ts](apps/desktop/src/lib/permissions.test.ts), [ytdlp.test.ts](apps/desktop/src/lib/ytdlp.test.ts).
- Padrão: `vi.mock('./db.js')` + `vi.mock('./supabase.js')`, asserções diretas no retorno.

**2. Component (RTL + jsdom)** — [apps/desktop/src/components/](apps/desktop/src/components/) e [apps/desktop/src/pages/](apps/desktop/src/pages/).
- Renderiza um componente isolado, simula eventos (`userEvent`), verifica DOM e side effects mockados.
- Já existe: [Login.test.tsx](apps/desktop/src/pages/Login.test.tsx).
- Sempre mockar: `supabase`, `getDb`, e qualquer `invoke()` via `mockIPC`. Setup típico:

```ts
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'

beforeEach(() => {
  mockIPC((cmd, args) => {
    if (cmd === 'ensure_yt_dlp') return '/fake/bin/yt-dlp'
    if (cmd === 'ensure_ffmpeg') return '/fake/bin/ffmpeg'
    // plugin-sql chamadas chegam como 'plugin:sql|select' etc.
    return null
  })
})
afterEach(() => clearMocks())
```

**3. E2E (Linux CI)** — pasta `e2e/` (a criar). WebdriverIO + tauri-driver contra o app empacotado real, com Supabase local em Docker.
- **Limitação macOS:** `tauri-driver` oficial só funciona em Windows e Linux — WKWebView no Mac não tem driver nativo. Estratégia: rodar E2E só no CI (GitHub Actions Ubuntu). Local no Mac, testar manualmente.
- Alternativa opcional pra macOS local: [`tauri-webdriver-automation`](https://danielraffel.me/2026/02/14/i-built-a-webdriver-for-wkwebview-tauri-apps-on-macos/) (community, lançado fev/2026). Não adotar como dependência obrigatória.

### Jornadas críticas — escopo do E2E

Lista priorizada do que precisa estar verde antes de cada release. Não cobre tudo, cobre o que dói quebrar:

| # | Jornada | Cobre |
|---|---|---|
| 1 | **Auth → Org Select → Library** | signup → login → criar org → seed do papel Dono → sync inicial → ver Biblioteca vazia |
| 2 | **Adicionar música** | abrir AddSongModal → buscar YouTube (yt-dlp mockado) → preencher metadados → confirmar → ver na Biblioteca |
| 3 | **Tocar música** | clicar play em SongCard → PlayerMini aparece → seek funciona → pause/resume → próxima/anterior em playlist |
| 4 | **Criar e tocar culto** | criar culto com horário agendado → adicionar seção → adicionar músicas → entrar em modo de execução → tocar sequência |
| 5 | **Ministérios** | criar → adicionar músicas → navegar pelo ministério → editar/remover |
| 6 | **Aba Organização — convites** | gerar código → copiar → revogar; segundo usuário entra com código |
| 7 | **Aba Organização — papéis** | criar papel "Líder" → toggle de permissões → atribuir a membro via ⋯ menu |
| 8 | **Aba Organização — danger zone** | transferir propriedade (Dono passa pra outro membro) → membro antigo perde acesso ao papel; type-to-confirm delete da org |
| 9 | **Auto-updater** | check inicial mockado → toast aparece → "Mais tarde" silencia até próxima versão; deferral durante reprodução (não interrompe culto) |
| 10 | **Media keys (macOS)** | manual-only por enquanto (CI Linux não tem o `tauri-plugin-global-shortcut` na mesma forma); validar ao menos que o evento `media-play-pause` é processado |

### O que NÃO entra no E2E

- **Downloads reais do YouTube** — flakiness de rede. yt-dlp e ffmpeg sempre mockados via sidecar fake ou `mockIPC`.
- **Áudio real tocando** — CI sem device de áudio. Howler é mockado; testes verificam que `getPosition` é chamado, não que som sai.
- **Builds assinadas** — pubkey/keypair e fluxo de instalação real do updater não roda em CI; só o caminho de check + decisão.
- **Comportamento macOS específico** — Accessibility permissions, asset:// protocol nuances. Validados manualmente.

### Comandos

```bash
# unit + component, todo monorepo
pnpm test

# unit + component, só apps/desktop
cd apps/desktop && pnpm test

# único arquivo, modo watch desligado
cd apps/desktop && pnpm vitest run src/lib/sync.test.ts

# watch mode
cd apps/desktop && pnpm vitest

# E2E — CI Linux (oficial, source of truth)
cd apps/desktop && pnpm test:e2e

# E2E — Mac local (rápido; requer `cargo install tauri-webdriver-automation --locked` (binary se chama `tauri-wd`) uma vez)
cd apps/desktop && pnpm test:e2e:local
```

Os testes E2E vivem em [apps/desktop/e2e/](apps/desktop/e2e/). Antes de rodar local, garante que o Supabase está rodando (`supabase start`) e que o app dev está buildado (`pnpm tauri build --debug --config src-tauri/tauri.conf.dev.json`).

Antes de abrir PR pra `main`: `pnpm test` + `pnpm typecheck` devem passar. O workflow [`release-bump.yml`](.github/workflows/release-bump.yml) já roda `test` no Ubuntu como gate antes do bump de versão.

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

## Git workflow — toda alteração via branch + PR

**Nunca commitar nem dar push direto em `main` ou `dev`.** Todo trabalho — feature, fix, ci, docs, por menor que seja — segue o fluxo:

1. **Branch a partir de `dev`**, com nome prefixado: `feat/`, `fix/`, `ci/`, `test/`, `docs/`, `chore/`.
2. **PR pra `dev`** — mergeia quando o trabalho está pronto e verde.
3. **PR de `dev` → `main`** — é o *release PR*. Exige `CI passed` verde, conversas de review resolvidas e a branch atualizada com a `main`.
4. Merge na `main` dispara o `release-bump` → versionamento e build (ver "Releasing").

Regras:
- **`main` é protegida**: só recebe alteração via PR (push direto bloqueado), exige `CI passed` + resolução de conversas. Nunca contornar com `--admin`, `--no-verify` ou force-push.
- **`dev` também é só via branch + PR** — não dar push direto, mesmo pra mudança trivial.
- **Feature branch sempre abre PR pra `dev`** — nunca PR direto de feature pra `main`. O único PR que mira `main` é o `dev → main`.
- **Commits convencionais** (`feat:`, `fix:`, `perf:`, `chore:`, `ci:`, `docs:`, `test:`) — o `release-it` infere o bump de versão a partir deles (ver "Releasing").
- **CI roda só em PRs com base `main`** ([ci.yml](.github/workflows/ci.yml)). Antes de abrir o PR `dev → main`: `pnpm test` + `pnpm typecheck` local, e perguntar sobre E2E (ver "Testing strategy").

## Releasing

Releases são publicadas no GitHub a partir de tags `v*`. O workflow [.github/workflows/release.yml](.github/workflows/release.yml) builda nos **self-hosted runners** (Mac M1 + Windows JOAO-PC), gera `.dmg` + `.exe` + bundle assinado pra updater, e cria a GitHub Release automaticamente.

Setup detalhado dos runners e gotchas Windows: ver [docs/self-hosted-runners.md](docs/self-hosted-runners.md). Em particular: **o runner Windows precisa rodar como user `joaos` (não service SYSTEM)** — sem isso, `makensis` falha com `error 0x2` ([tauri-apps/tauri#9895](https://github.com/tauri-apps/tauri/issues/9895)). Pra subir após reboot, logar no Windows e rodar `run.cmd` em foreground.

### Fluxo de release (automático)

Cada push na `main` dispara o workflow [`Release Bump`](.github/workflows/release-bump.yml):

1. Job `test`: typecheck + unit tests no self-hosted Mac (~1 min).
2. Job `bump`: se testes passaram, roda `pnpm release --ci`. O plugin conventional-changelog do release-it olha os commits desde a última tag e decide:
   - `feat:` → bump minor
   - `fix:` ou `perf:` → bump patch
   - `BREAKING CHANGE:` no body → bump major
   - só `chore:` / `refactor:` / `docs:` → não faz nada (workflow encerra sem release)
3. Se houve bump, commit `chore(release): vX.Y.Z` vai pra main + tag `vX.Y.Z` é criada.
4. Job dispara `gh workflow run release.yml --ref vX.Y.Z` — o workflow `Release` builda macOS + Windows em paralelo (~10–15 min) e publica `.dmg` / `.exe` / `latest.json` no Supabase Storage e na aba Releases.

Mensagens de commit importam: use prefixos convencionais (`feat:`, `fix:`, etc.) — releases acontecem em função deles.

### Forçar uma release manual

Casos raros (publicar mesmo sem commits relevantes, ou reverter pra versão específica):

[Actions → Release Bump → Run workflow](https://github.com/JoaoSipauba/leviticus/actions/workflows/release-bump.yml) → escolhe bump (`patch`/`minor`/`major`) e dispara. Pula a inferência por conventional commits.

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

O updater tem dois caminhos, por momento:

**1. Check no boot (splash).** [boot-update.ts](apps/desktop/src/lib/boot-update.ts) → `checkUpdateOnBoot()` roda durante o splash, em paralelo ao auth (gate `updateCheckDone` no [App.tsx](apps/desktop/src/App.tsx)). Tem timeout de 3s — offline ou endpoint fora do ar não seguram o splash. Se acha update, o splash mostra "Instalando atualização" (evento `leviticus-updating` → [index.html](apps/desktop/index.html)), baixa, instala e reinicia o app na versão nova — estilo Discord. Sem update / falha / timeout: boot segue normal. Não interrompe culto porque nada está tocando no boot.

**2. Check periódico (app aberto).** [UpdateNotification.tsx](apps/desktop/src/components/UpdateNotification.tsx) cobre updates que saem com o app já aberto. Segue o padrão de mercado (Chrome/VS Code/Slack): download silencioso, notifica só quando está pronto. Comportamento:

- Primeiro check após 1h (o boot já foi coberto pelo splash), depois a cada 1h.
- **Nunca busca update durante reprodução**: se `usePlayerStore.getState().isPlaying === true`, o check é adiado por 5 minutos.
- Update encontrado → **download silencioso em background**, sem UI nenhuma.
- Download concluído → toast no canto inferior direito: "Há uma nova atualização disponível", botões **Reiniciar agora** (instala + reinicia) e **Pular**.
- **Pular** esconde o toast e reaparece em 1h (não some de vez, senão um app sempre-aberto nunca atualizaria).
- **Auto-apply**: se o toast for ignorado (nem Reiniciar nem Pular) por 2h, a atualização é aplicada sozinha. **Nunca durante culto** — se `isPlaying`, segura e re-tenta a cada 1min, aplicando assim que o louvor termina. É o "active hours" do Windows Update aplicado ao louvor.
- Falhas (offline, pubkey inválida, endpoint fora do ar, download interrompido) são silenciosas — não incomodam o usuário.

**Windows:** `plugins.updater.windows.installMode` é `"quiet"` ([tauri.conf.json](apps/desktop/src-tauri/tauri.conf.json)) — sem isso o NSIS abre uma janela passiva de progresso, redundante com o splash. `quiet` funciona porque o instalador é per-user (não precisa de UAC).

## Key constraints

- `tsconfig.json` has `noUnusedLocals: true` — unused variables cause build failures.
- YouTube URLs must have a `v=` parameter. The `fetchYoutubeMetadata` function in `src/lib/ytdlp.ts` auto-prepends `https://` if missing.
- Audio files are stored at `$APPLOCALDATADIR/audio/{songId}.mp3`. The `assetProtocol` scope in `tauri.conf.json` must cover `$APPLOCALDATA/**` to serve them.
- **yt-dlp e ffmpeg são baixados em runtime pra `$APPLOCALDATA/bin/` no primeiro uso (lazy).** Não bundlamos no `.app` porque Tauri roda `codesign --deep -s -` (ad-hoc) e re-assina TODOS os binários internos — isso quebra o Python.framework dentro do yt-dlp_macos (PyInstaller bundle) por mismatch de Team ID. Mesma classe de problema afetaria o ffmpeg estático. Solução: manter os binários fora do bundle, baixar lazy.
  - **yt-dlp**: comando Rust `ensure_yt_dlp` em [yt_dlp.rs](apps/desktop/src-tauri/src/yt_dlp.rs), pin em `YT_DLP_VERSION`. Origem: releases oficiais do yt-dlp.
  - **ffmpeg**: comando Rust `ensure_ffmpeg` em [ffmpeg.rs](apps/desktop/src-tauri/src/ffmpeg.rs), pin em `FFMPEG_STATIC_TAG`. Origem: [eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (.gz, single binary).
  - [ytdlp.ts](apps/desktop/src/lib/ytdlp.ts) chama `invoke('ensure_yt_dlp')` / `invoke('ensure_ffmpeg')` antes de cada `Command.create('yt-dlp', ...)` / `Command.create('ffmpeg', ...)` (cache por módulo).
  - Capabilities: nome `yt-dlp` e `ffmpeg` mapeados pra `$APPLOCALDATA/bin/...(.exe)` via [ext-bin-mac.json](apps/desktop/src-tauri/capabilities/ext-bin-mac.json) (macOS/Linux) e [ext-bin-win.json](apps/desktop/src-tauri/capabilities/ext-bin-win.json) (Windows).
  - Não depende mais de Homebrew em macOS — `brew install ffmpeg` não é mais pré-requisito.
- `tauri-plugin-global-shortcut` registration is wrapped in `let _ =` (not `?`) to prevent the app from crashing if macOS Accessibility permission is denied.

## Perceived performance

The app must always feel fast and snappy to the user. Every interaction should feel instantaneous. Rules:

- **Seek / click interactions**: apply `transition: none` at the moment of click; re-enable a short transition (≤ 0.15s) afterwards for smooth passive updates. Never let a CSS animation delay a user-triggered action.
- **CSS transitions**: keep them short (≤ 0.2s for UI state changes, ≤ 0.15s for data-driven fills like progress bars). Reserve longer transitions only for entrance/exit animations on modals or overlays.
- **State updates on user input**: update state synchronously and immediately — never make visual feedback wait for a promise to resolve when the result is already known.
- **Audio/media**: seek and volume changes must be applied to the media element before any visual state update, so the audio never lags behind the UI.
- When in doubt: remove the animation before shipping, rather than ship something that feels slow.

## Acompanhar achados — abertura de issues

Sempre que encontrar, durante o trabalho, algo que **não vai ser tratado naquela tarefa** mas tem impacto futuro, abra uma issue no GitHub. Isso impede que bugs, riscos ou melhorias se percam no histórico de PRs.

**Abrir issue quando:**

- Bug em código existente que não está no escopo da task atual
- Vulnerabilidade ou risco de segurança identificado
- Melhoria de UX/performance/DX que vale a pena mas extrapola o escopo
- Tech debt que ficou explícito (ex: arquivo grande demais, lógica duplicada, workaround feio)
- Gap de documentação detectado
- Inconsistência entre módulos
- Limitação ou edge case que pode afetar usuário em produção
- Comportamento estranho de ferramenta/teste (flakiness, build lento, etc.) que vai ser sentido por outros devs

**NÃO abrir quando:**

- O item já está coberto pelo plano em execução
- É algo a ser feito numa task imediatamente seguinte do mesmo plano
- O "achado" é só uma observação subjetiva ("podia ser mais limpo") sem impacto concreto

### Como abrir

Use `gh issue create --label <cat> --label <pri> --title "..." --body "..."`. Antes, faça `gh issue list --search "<termos>"` pra evitar duplicar. O body deve responder:

1. **O que** — descrição curta do problema/melhoria
2. **Onde** — file path + linha ou módulo afetado
3. **Por que importa** — qual o impacto se não tratado
4. **Como reproduzir** (pra bug) ou **proposta** (pra enhancement)
5. **Contexto** — link pro commit/PR/plano onde foi descoberto

### Categorias (labels `type:*`)

| Label | Quando usar |
|---|---|
| `type:bug` | Comportamento incorreto em código que já está em uso |
| `type:security` | Vulnerabilidade, exposição de credencial, falha de auth/RLS |
| `type:performance` | Lentidão, alto uso de memória, gargalo mensurável |
| `type:ux` | Comportamento confuso, falta de feedback, copy ruim, fluxo travado |
| `type:enhancement` | Melhoria de feature existente |
| `type:feature` | Funcionalidade nova |
| `type:tech-debt` | Refactor, código morto, arquitetura precisa de ajuste |
| `type:dx` | Developer experience: testes lentos, build flaky, scripts manuais |
| `type:docs` | Documentação faltando ou incorreta |

### Prioridades (labels `priority:*`)

| Label | Critério | Exemplo |
|---|---|---|
| `priority:critical` | Bloqueia uso ou expõe dado sensível. Tratar antes do próximo release | Token vazado em log, crash no boot, RLS quebrado |
| `priority:high` | Afeta usuário observavelmente mas tem workaround. Próximo ciclo | Botão não dá feedback, race condition em sync ocasional |
| `priority:medium` | Vale a pena fazer, sem urgência | Limpar warning de deprecation, melhorar mensagem de erro, refator localizado |
| `priority:low` | Nice to have, backlog longo prazo | Refatorar componente grande sem dor atual, adicionar i18n |

### Durante execução de planos (Claude Code)

- Se notar algo durante uma task que não está no escopo, **abra a issue imediatamente** depois do commit principal (ou no fim da task)
- Se um subagent reportar `DONE_WITH_CONCERNS`, avalie cada concern — se for fora do escopo do plano atual, vira issue
- Sempre incluir link pro commit ou PR onde o achado foi descoberto no body da issue
- Reportar pro usuário no resumo da task: "Abri issue #N pra X"

### Setup inicial (uma vez)

As labels precisam existir no repo. Comandos pra criar (rodar uma vez por repo):

```bash
gh label create "type:bug" --color "d73a4a" --description "Defeito em código existente"
gh label create "type:security" --color "b60205" --description "Vulnerabilidade ou risco"
gh label create "type:performance" --color "fbca04" --description "Performance"
gh label create "type:ux" --color "1d76db" --description "Experiência do usuário"
gh label create "type:enhancement" --color "a2eeef" --description "Melhoria de feature"
gh label create "type:feature" --color "0e8a16" --description "Funcionalidade nova"
gh label create "type:tech-debt" --color "5319e7" --description "Dívida técnica"
gh label create "type:dx" --color "c5def5" --description "Developer experience"
gh label create "type:docs" --color "0075ca" --description "Documentação"
gh label create "priority:critical" --color "b60205" --description "Antes do próximo release"
gh label create "priority:high" --color "d93f0b" --description "Próximo ciclo"
gh label create "priority:medium" --color "fbca04" --description "Sem urgência, vale fazer"
gh label create "priority:low" --color "c5def5" --description "Backlog longo prazo"
```

## Status das issues — automação

Issues têm 3 estados visíveis: backlog (sem label de status), `status:in-review`, `status:in-dev`, e closed (= em produção).

Transições automáticas via [.github/workflows/issue-status.yml](.github/workflows/issue-status.yml) + [.github/workflows/release-close-issues.yml](.github/workflows/release-close-issues.yml):

| Quando | Estado da issue |
|---|---|
| Issue criada | sem label de status (backlog) |
| PR aberta com `Closes #N` / `Fixes #N` no body, base `dev` ou `main` | `status:in-review` |
| PR mergeada em `dev` | `status:in-dev` + comentário "Mergeada via #X" |
| PR fechada sem merge | status removido (volta pro backlog) |
| Release `v*` publicada (após PR de `dev → main` + release-bump) | todas as `status:in-dev` viram closed + comentário "Publicado em vX.Y.Z" |

### Convenção pro PR body

Toda PR que resolve issue deve incluir `Closes #N` no body (ou `Fixes #N` / `Resolves #N`). Caso resolva múltiplas, repita: `Closes #44, Closes #45, Closes #46`. Sem isso, o workflow não consegue mapear PR → issue.

PR que faz parte do trabalho mas não fecha a issue (ex: refactor parcial): mencione `Refs #N` em vez de `Closes` — não dispara label change.

### Edge cases

- **Hotfix direto em main** (raro): a issue só fecha se tiver `status:in-dev` na próxima release. Se não, fechar manualmente.
- **Issue reaberta após release**: precisa re-label manual se aplicável.
