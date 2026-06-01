# Leviticus

**Player desktop offline-first pra equipes de louvor.** Organize o repertório dos ministérios, monte o setlist do culto e toque no domingo — mesmo sem internet na igreja.

🌐 **Site:** [leviticus-landing.vercel.app](https://leviticus-landing.vercel.app)
📦 **Downloads:** [Releases](https://github.com/JoaoSipauba/leviticus/releases/latest) (`.dmg` pra macOS, `.exe` pra Windows)

## O que é

Leviticus resolve uma dor concreta de quem opera louvor: na hora do culto, qualquer dependência de internet é um risco. WiFi da igreja cai, 4G fica fraco, o YouTube buffer trava no meio do louvor. O Leviticus baixa as músicas pro disco e toca local — sem rede, sem buffer, sem surpresa.

**Principais funcionalidades:**

- 🎵 **Player offline** — música baixada toca direto do disco, sem rede
- 📋 **Setlists de culto** com seções (boas-vindas, adoração, ofertório, etc.)
- 🎚️ **Ministérios** — biblioteca compartilhada por papel/grupo (vocal, banda, técnica)
- ☁️ **Backup automático no Google Drive** — toda música sobe pro seu Drive cifrada
- 🎹 **Adicionar via YouTube ou upload** — yt-dlp baixa e converte; ou arrasta um `.mp3`/`.m4a`/`.wav`
- 📊 **Multi-device** — sync via Supabase entre Mac/Windows/dispositivos da equipe
- ⏯️ **Teclas de mídia** — Play/Pause via teclas globais (mesmo com o app em background)
- 🔄 **Auto-updater** assinado — novas versões instalam sozinhas, sem interromper o culto

## Stack

Monorepo `pnpm`. Quatro pacotes principais:

| Pacote | Stack | Função |
|---|---|---|
| `apps/desktop/` | **Tauri 2** + React 18 + TypeScript + SQLite (`tauri-plugin-sql`) | App desktop (macOS + Windows) |
| `apps/landing/` | **Next.js 14** + Tailwind + Vercel | Site público + dashboard admin |
| `worker/` | Express + tsx | Job queue opcional (yt-dlp em background) |
| `supabase/` | Postgres + Edge Functions (Deno) | Backend: auth, dados, OAuth Drive proxy |

**Padrões arquiteturais:**

- **Dual-database** — Supabase é fonte de verdade (writes), SQLite local é cache (reads). Sync via `updated_at >= last_sync`.
- **HTTP via `@tauri-apps/plugin-http`** — todo cross-origin HTTP passa por Rust pra escapar de CORS do WebKit.
- **Observabilidade no Sentry** — JS + Rust unificados via `tauri-plugin-sentry`.

## Rodar localmente

Pré-requisitos: Node 22+, pnpm, Rust toolchain (`rustup`), Docker (pro Supabase local).

```bash
# 1. Subir Supabase local (Postgres + Auth + Edge Functions)
supabase start

# 2. Instalar deps do monorepo
pnpm install

# 3. Rodar app desktop em dev (abre janela Tauri com hot-reload)
cd apps/desktop && pnpm tauri dev

# 4. (Opcional) Rodar landing site
cd apps/landing && pnpm dev
```

A landing roda em `http://localhost:3000`, Supabase em `http://127.0.0.1:54321`.

### Comandos úteis

```bash
pnpm test               # roda testes em todos os pacotes
pnpm typecheck          # tsc --noEmit em todos os pacotes
cd apps/desktop && pnpm vitest         # testes unit + component em watch mode
cd apps/desktop && pnpm tauri build    # build de produção
```

## Documentação

- [`CLAUDE.md`](CLAUDE.md) — guia arquitetural completo (lido pelo Claude Code durante desenvolvimento, mas serve como onboarding pra qualquer dev)
- [`docs/`](docs/) — notas técnicas, planos de implementação, troubleshooting de runners self-hosted

## Status

Em **fase beta (0.x)**. Releases semanais via [GitHub Releases](https://github.com/JoaoSipauba/leviticus/releases). Auto-updater entrega novas versões silenciosamente quando o usuário não está tocando.

## Contribuindo

Issues e PRs são bem-vindos. Convenções de commit (`feat:`, `fix:`, `perf:`, `chore:`, etc.) — o bump de versão é inferido automaticamente via `release-it`.

Fluxo:
1. Branch a partir de `dev` (prefixos `feat/`, `fix/`, `ci/`, etc.)
2. PR mira `dev`
3. PR `dev → main` é o release PR — dispara build + publish dos `.dmg`/`.exe` automaticamente

Detalhes em [`CLAUDE.md`](CLAUDE.md).
