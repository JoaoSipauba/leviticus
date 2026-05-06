# Leviticus — Plano 2: App Desktop (Tauri + React)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o app desktop completo com Tauri v2 + React: autenticação, biblioteca de músicas com sync offline via SQLite, download de áudio via yt-dlp, player de áudio, e controle remoto via Supabase Realtime.

**Architecture:** Tauri v2 como shell nativo (acesso ao sistema de arquivos, shell para yt-dlp, SQLite local). React + Vite para a UI. Zustand para estado global. O app sempre lê do SQLite local e sincroniza com o Supabase ao abrir quando online. Áudio reproduzido via Howler.js com `convertFileSrc` do Tauri. Controle remoto via Supabase Realtime Presence + Broadcast.

**Tech Stack:** Tauri v2, React 18, TypeScript, Vite, TailwindCSS, Zustand, React Router v6, Howler.js, tauri-plugin-sql (SQLite), tauri-plugin-shell (yt-dlp), tauri-plugin-fs, @supabase/supabase-js, Vitest, @testing-library/react

**Pré-requisito:** Plano 1 completo (pacote `@leviticus/core` disponível, Supabase local rodando).

---

## Estrutura de Arquivos

```
apps/desktop/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs
│       └── lib.rs
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── router.tsx
    ├── env.ts                         # variáveis de ambiente Supabase
    ├── lib/
    │   ├── supabase.ts                # instância do cliente Supabase
    │   ├── db.ts                      # cliente SQLite local
    │   ├── sync.ts                    # sincronização Supabase → SQLite
    │   ├── ytdlp.ts                   # download via tauri-plugin-shell
    │   ├── audio.ts                   # player Howler.js
    │   ├── realtime.ts                # controle remoto Supabase Realtime
    │   └── device.ts                  # device_id persistido
    ├── store/
    │   ├── auth.ts                    # usuário, sessão
    │   ├── org.ts                     # org atual, lista de orgs
    │   ├── player.ts                  # estado do player
    │   └── remote.ts                  # dispositivos online, alvo selecionado
    ├── components/
    │   ├── Layout.tsx                 # sidebar + player mini fixo
    │   ├── Sidebar.tsx
    │   ├── PlayerMini.tsx
    │   ├── PlayerExpanded.tsx
    │   ├── SongCard.tsx
    │   ├── RemoteControl.tsx
    │   └── DownloadButton.tsx
    └── pages/
        ├── Login.tsx
        ├── OrgSelect.tsx
        ├── Library.tsx
        ├── AddSong.tsx
        ├── Groups.tsx
        ├── Playlists.tsx
        ├── PlaylistDetail.tsx
        └── OrgManage.tsx
```

---

## Task 1: Setup Tauri + React + Vite

**Files:**
- Create: `apps/desktop/` (via Tauri CLI)

- [ ] **Step 1: Verificar pré-requisitos**

```bash
rustc --version   # >= 1.77
cargo --version
node --version    # >= 20
```

Se Rust não estiver instalado: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

- [ ] **Step 2: Criar o projeto Tauri com React + TypeScript**

```bash
cd /Users/joaosipauba/Projects/pessoal/leviticus
pnpm create tauri-app apps/desktop -- --template react-ts --manager pnpm
```
Quando perguntado, selecione: `React` → `TypeScript`

- [ ] **Step 3: Verificar que o app abre**

```bash
cd apps/desktop && pnpm tauri dev
```
Esperado: janela nativa abre com a tela padrão do Vite

- [ ] **Step 4: Atualizar apps/desktop/package.json para incluir @leviticus/core**

Adicione em `dependencies`:
```json
{
  "dependencies": {
    "@leviticus/core": "workspace:*",
    "@supabase/supabase-js": "^2.43.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "@tauri-apps/plugin-sql": "^2.0.0",
    "@tauri-apps/plugin-fs": "^2.0.0",
    "howler": "^2.2.4",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@testing-library/react": "^15.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/howler": "^2.2.11",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 5: Instalar dependências**

```bash
pnpm install
```

- [ ] **Step 6: Configurar TailwindCSS**

```bash
cd apps/desktop && npx tailwindcss init -p
```

Atualize `tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

Substitua o conteúdo de `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Configurar Vitest em vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})
```

Crie `src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

Instale:
```bash
pnpm add -D @testing-library/jest-dom
```

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/
git commit -m "chore(desktop): Tauri + React + Vite + TailwindCSS setup"
```

---

## Task 2: Tauri — Plugins e Configuração

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Atualizar Cargo.toml**

```toml
[package]
name = "leviticus-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "leviticus_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Atualizar tauri.conf.json**

```json
{
  "productName": "Leviticus",
  "version": "0.1.0",
  "identifier": "com.leviticus.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "Leviticus",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png"]
  }
}
```

- [ ] **Step 3: Criar capabilities/default.json**

```json
{
  "identifier": "default",
  "description": "Leviticus default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-app-read-recursive",
    "fs:allow-app-write-recursive",
    "shell:allow-execute",
    "shell:allow-spawn",
    "sql:default",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-load"
  ]
}
```

- [ ] **Step 4: Atualizar src-tauri/src/lib.rs**

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:leviticus.db",
                    vec![tauri_plugin_sql::Migration {
                        version: 1,
                        description: "initial_schema",
                        sql: include_str!("../migrations/001_local_schema.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Criar pasta de migrações locais**

```bash
mkdir -p apps/desktop/src-tauri/migrations
```

- [ ] **Step 6: Verificar que o app ainda compila**

```bash
cd apps/desktop && pnpm tauri build --debug 2>&1 | tail -5
```
Esperado: `Finished` sem erros

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/
git commit -m "feat(desktop): configure Tauri plugins (shell, sql, fs)"
```

---

## Task 3: SQLite Local — Schema e Cliente

**Files:**
- Create: `apps/desktop/src-tauri/migrations/001_local_schema.sql`
- Create: `apps/desktop/src/lib/db.ts`

- [ ] **Step 1: Criar apps/desktop/src-tauri/migrations/001_local_schema.sql**

```sql
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS song_groups (
  song_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (song_id, group_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  scheduled_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 2: Criar apps/desktop/src/lib/db.ts**

```typescript
import Database from '@tauri-apps/plugin-sql'

let _db: Database | null = null

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load('sqlite:leviticus.db')
  }
  return _db
}

export async function getLastSync(orgId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<{ value: string }[]>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [`last_sync_${orgId}`]
  )
  return rows[0]?.value ?? null
}

export async function setLastSync(orgId: string, iso: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    [`last_sync_${orgId}`, iso]
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/migrations/ apps/desktop/src/lib/db.ts
git commit -m "feat(desktop): local SQLite schema and db client"
```

---

## Task 4: Variáveis de Ambiente, Supabase Client e Device ID

**Files:**
- Create: `apps/desktop/src/env.ts`
- Create: `apps/desktop/src/lib/supabase.ts`
- Create: `apps/desktop/src/lib/device.ts`
- Create: `apps/desktop/.env.local`

- [ ] **Step 1: Criar apps/desktop/.env.local**

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7NfFnzoVWYxvKL3hHoJuqJbCQaBrW5BmXxc
```
*(substitua pelos valores reais do `supabase start`)*

- [ ] **Step 2: Criar apps/desktop/src/env.ts**

```typescript
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
}
```

- [ ] **Step 3: Criar apps/desktop/src/lib/supabase.ts**

```typescript
import { createSupabaseClient } from '@leviticus/core'
import { env } from '../env'

export const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseAnonKey)
```

- [ ] **Step 4: Criar apps/desktop/src/lib/device.ts**

```typescript
const DEVICE_ID_KEY = 'leviticus_device_id'
const DEVICE_NAME_KEY = 'leviticus_device_name'

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function getDeviceName(): string {
  let name = localStorage.getItem(DEVICE_NAME_KEY)
  if (!name) {
    name = `Desktop ${new Date().toLocaleDateString('pt-BR')}`
    localStorage.setItem(DEVICE_NAME_KEY, name)
  }
  return name
}

export function setDeviceName(name: string): void {
  localStorage.setItem(DEVICE_NAME_KEY, name)
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/env.ts apps/desktop/src/lib/supabase.ts apps/desktop/src/lib/device.ts
git commit -m "feat(desktop): Supabase client and device identity"
```

---

## Task 5: Auth Store e Telas de Login

**Files:**
- Create: `apps/desktop/src/store/auth.ts`
- Create: `apps/desktop/src/pages/Login.tsx`
- Create: `apps/desktop/src/pages/Login.test.tsx`

- [ ] **Step 1: Escrever teste que falha para o Login**

Crie `apps/desktop/src/pages/Login.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Login } from './Login'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('Login', () => {
  it('renders email and password fields', () => {
    render(<Login onSuccess={() => {}} />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
  })

  it('calls signInWithPassword on submit', async () => {
    const { supabase } = await import('../lib/supabase')
    render(<Login onSuccess={() => {}} />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@test.com' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'senha123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'senha123',
      })
    })
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd apps/desktop && pnpm test
```
Esperado: FAIL — `Cannot find module './Login'`

- [ ] **Step 3: Criar apps/desktop/src/store/auth.ts**

```typescript
import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState = {
  user: User | null
  session: Session | null
  loading: boolean
  setSession: (session: Session | null) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  setSession: (session) =>
    set({ session, user: session?.user ?? null, loading: false }),
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
```

- [ ] **Step 4: Criar apps/desktop/src/pages/Login.tsx**

```typescript
import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  onSuccess: () => void
}

export function Login({ onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fn = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password })

    const { error } = await fn
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }
    onSuccess()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-6">Leviticus</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm text-gray-400 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm text-gray-400 mb-1"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-medium disabled:opacity-50"
          >
            {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp((v) => !v)}
          className="mt-4 text-sm text-gray-500 hover:text-gray-300 w-full text-center"
        >
          {isSignUp ? 'Já tenho conta' : 'Criar nova conta'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Rodar testes**

```bash
cd apps/desktop && pnpm test
```
Esperado: todos passando

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/store/auth.ts apps/desktop/src/pages/Login.tsx apps/desktop/src/pages/Login.test.tsx
git commit -m "feat(desktop): auth store and login/signup screen"
```

---

## Task 6: Sync Service (Supabase → SQLite)

**Files:**
- Create: `apps/desktop/src/lib/sync.ts`
- Create: `apps/desktop/src/lib/sync.test.ts`

- [ ] **Step 1: Escrever testes que falham**

Crie `apps/desktop/src/lib/sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncOrg } from './sync'

vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue([]),
  }),
  getLastSync: vi.fn().mockResolvedValue(null),
  setLastSync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}))

describe('syncOrg', () => {
  it('completes without throwing when data is empty', async () => {
    await expect(syncOrg('org-1')).resolves.not.toThrow()
  })

  it('calls supabase for each entity type', async () => {
    const { supabase } = await import('./supabase')
    await syncOrg('org-1')
    expect(supabase.from).toHaveBeenCalledWith('songs')
    expect(supabase.from).toHaveBeenCalledWith('groups')
    expect(supabase.from).toHaveBeenCalledWith('playlists')
    expect(supabase.from).toHaveBeenCalledWith('song_groups')
    expect(supabase.from).toHaveBeenCalledWith('playlist_songs')
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd apps/desktop && pnpm test
```
Esperado: FAIL — `Cannot find module './sync'`

- [ ] **Step 3: Criar apps/desktop/src/lib/sync.ts**

```typescript
import { supabase } from './supabase'
import { getDb, getLastSync, setLastSync } from './db'

export async function syncOrg(orgId: string): Promise<void> {
  const db = await getDb()
  const since = (await getLastSync(orgId)) ?? '1970-01-01T00:00:00Z'

  const [songs, groups, playlists, songGroups, playlistSongs] =
    await Promise.all([
      supabase
        .from('songs')
        .select('*')
        .eq('org_id', orgId)
        .gte('updated_at', since),
      supabase
        .from('groups')
        .select('*')
        .eq('org_id', orgId)
        .gte('updated_at', since),
      supabase
        .from('playlists')
        .select('*')
        .eq('org_id', orgId)
        .gte('updated_at', since),
      supabase
        .from('song_groups')
        .select('song_id, group_id, songs!inner(org_id)')
        .eq('songs.org_id', orgId),
      supabase
        .from('playlist_songs')
        .select('playlist_id, song_id, position, playlists!inner(org_id)')
        .eq('playlists.org_id', orgId),
    ])

  for (const s of songs.data ?? []) {
    await db.execute(
      `INSERT OR REPLACE INTO songs
       (id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.org_id, s.youtube_url, s.title, s.artist,
       s.thumbnail_url, s.duration_seconds, s.created_at, s.updated_at]
    )
  }

  for (const g of groups.data ?? []) {
    await db.execute(
      `INSERT OR REPLACE INTO groups (id, org_id, name, updated_at) VALUES (?, ?, ?, ?)`,
      [g.id, g.org_id, g.name, g.updated_at]
    )
  }

  for (const p of playlists.data ?? []) {
    await db.execute(
      `INSERT OR REPLACE INTO playlists
       (id, org_id, name, scheduled_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [p.id, p.org_id, p.name, p.scheduled_date, p.created_at, p.updated_at]
    )
  }

  for (const sg of songGroups.data ?? []) {
    await db.execute(
      `INSERT OR IGNORE INTO song_groups (song_id, group_id) VALUES (?, ?)`,
      [sg.song_id, sg.group_id]
    )
  }

  for (const ps of playlistSongs.data ?? []) {
    await db.execute(
      `INSERT OR REPLACE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)`,
      [ps.playlist_id, ps.song_id, ps.position]
    )
  }

  await setLastSync(orgId, new Date().toISOString())
}
```

- [ ] **Step 4: Rodar testes**

```bash
cd apps/desktop && pnpm test
```
Esperado: todos passando

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/sync.ts apps/desktop/src/lib/sync.test.ts
git commit -m "feat(desktop): Supabase to SQLite sync service"
```

---

## Task 7: App Shell — Roteamento, Layout e Auth Guard

**Files:**
- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/router.tsx`
- Create: `apps/desktop/src/components/Layout.tsx`
- Create: `apps/desktop/src/components/Sidebar.tsx`

- [ ] **Step 1: Atualizar apps/desktop/src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
```

- [ ] **Step 2: Criar apps/desktop/src/router.tsx**

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { App } from './App'
import { Login } from './pages/Login'
import { OrgSelect } from './pages/OrgSelect'
import { Library } from './pages/Library'
import { AddSong } from './pages/AddSong'
import { Groups } from './pages/Groups'
import { Playlists } from './pages/Playlists'
import { PlaylistDetail } from './pages/PlaylistDetail'
import { OrgManage } from './pages/OrgManage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/library" replace /> },
      { path: 'library', element: <Library /> },
      { path: 'add', element: <AddSong /> },
      { path: 'groups', element: <Groups /> },
      { path: 'playlists', element: <Playlists /> },
      { path: 'playlists/:id', element: <PlaylistDetail /> },
      { path: 'manage', element: <OrgManage /> },
    ],
  },
  { path: '/login', element: <Login onSuccess={() => window.location.replace('/org')} /> },
  { path: '/org', element: <OrgSelect /> },
])
```

- [ ] **Step 3: Criar apps/desktop/src/App.tsx**

```typescript
import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore } from './store/auth'
import { Layout } from './components/Layout'

export function App() {
  const { setSession, user } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) navigate('/login')
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (!session) navigate('/login')
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  if (!user) return null

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
```

- [ ] **Step 4: Criar apps/desktop/src/components/Sidebar.tsx**

```typescript
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

const links = [
  { to: '/library', label: 'Biblioteca' },
  { to: '/groups', label: 'Grupos' },
  { to: '/playlists', label: 'Playlists' },
  { to: '/manage', label: 'Organização' },
]

export function Sidebar() {
  const { signOut } = useAuthStore()

  return (
    <aside className="w-56 bg-gray-900 h-full flex flex-col py-6 px-3">
      <h1 className="text-white font-bold text-xl px-3 mb-8">Leviticus</h1>
      <nav className="flex-1 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={signOut}
        className="text-sm text-gray-500 hover:text-gray-300 px-3 py-2 text-left"
      >
        Sair
      </button>
    </aside>
  )
}
```

- [ ] **Step 5: Criar apps/desktop/src/components/Layout.tsx**

```typescript
import { Sidebar } from './Sidebar'
import { PlayerMini } from './PlayerMini'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
        <PlayerMini />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Criar stubs para pages que ainda não existem**

Crie cada arquivo abaixo com conteúdo mínimo:

`apps/desktop/src/pages/OrgSelect.tsx`:
```typescript
export function OrgSelect() { return <div>OrgSelect</div> }
```

`apps/desktop/src/pages/Library.tsx`:
```typescript
export function Library() { return <div className="p-6">Biblioteca</div> }
```

`apps/desktop/src/pages/AddSong.tsx`:
```typescript
export function AddSong() { return <div className="p-6">Adicionar Música</div> }
```

`apps/desktop/src/pages/Groups.tsx`:
```typescript
export function Groups() { return <div className="p-6">Grupos</div> }
```

`apps/desktop/src/pages/Playlists.tsx`:
```typescript
export function Playlists() { return <div className="p-6">Playlists</div> }
```

`apps/desktop/src/pages/PlaylistDetail.tsx`:
```typescript
export function PlaylistDetail() { return <div className="p-6">Playlist</div> }
```

`apps/desktop/src/pages/OrgManage.tsx`:
```typescript
export function OrgManage() { return <div className="p-6">Organização</div> }
```

`apps/desktop/src/components/PlayerMini.tsx`:
```typescript
export function PlayerMini() { return <div className="h-16 bg-gray-900 border-t border-gray-800" /> }
```

- [ ] **Step 7: Verificar que o app abre e navega**

```bash
cd apps/desktop && pnpm tauri dev
```
Esperado: janela abre, tela de login aparece, ao logar redireciona para /library com sidebar visível

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/
git commit -m "feat(desktop): app shell with routing, layout, and auth guard"
```

---

## Task 8: yt-dlp e Audio Player

**Files:**
- Create: `apps/desktop/src/lib/ytdlp.ts`
- Create: `apps/desktop/src/lib/audio.ts`
- Create: `apps/desktop/src/store/player.ts`
- Create: `apps/desktop/src/lib/ytdlp.test.ts`

- [ ] **Step 1: Configurar yt-dlp como shell permitido em tauri.conf.json**

Adicione dentro de `"plugins"`:
```json
{
  "plugins": {
    "shell": {
      "open": true,
      "scope": [
        {
          "name": "yt-dlp",
          "cmd": "yt-dlp",
          "args": true,
          "sidecar": false
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Escrever teste que falha para ytdlp.ts**

Crie `apps/desktop/src/lib/ytdlp.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { getSongFilename, isDownloaded } from './ytdlp'

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/mock/data'),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join('/'))),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(true),
}))

describe('ytdlp utils', () => {
  it('getSongFilename returns correct path', async () => {
    const path = await getSongFilename('song-123')
    expect(path).toContain('song-123.mp3')
  })

  it('isDownloaded returns true when file exists', async () => {
    const result = await isDownloaded('song-123')
    expect(result).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar para confirmar que falha**

```bash
cd apps/desktop && pnpm test
```
Esperado: FAIL — `Cannot find module './ytdlp'`

- [ ] **Step 4: Criar apps/desktop/src/lib/ytdlp.ts**

```typescript
import { Command } from '@tauri-apps/plugin-shell'
import { appLocalDataDir, join } from '@tauri-apps/api/path'
import { exists, mkdir } from '@tauri-apps/plugin-fs'

export async function getSongFilename(songId: string): Promise<string> {
  const dataDir = await appLocalDataDir()
  return join(dataDir, 'audio', `${songId}.mp3`)
}

export async function isDownloaded(songId: string): Promise<boolean> {
  const path = await getSongFilename(songId)
  return exists(path)
}

export async function downloadSong(
  songId: string,
  youtubeUrl: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const dataDir = await appLocalDataDir()
  const audioDir = await join(dataDir, 'audio')
  await mkdir(audioDir, { recursive: true })

  const outputPath = await getSongFilename(songId)

  const command = Command.create('yt-dlp', [
    '--no-playlist',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--newline',
    '-o', outputPath,
    youtubeUrl,
  ])

  command.stderr.on('data', (line: string) => {
    const match = line.match(/(\d+\.?\d*)%/)
    if (match) onProgress(parseFloat(match[1]) / 100)
  })

  await command.execute()
  onProgress(1)
  return outputPath
}

export async function fetchYoutubeMetadata(url: string): Promise<{
  title: string
  artist: string
  thumbnail_url: string
  duration_seconds: number
}> {
  const videoId = new URL(url).searchParams.get('v')
  if (!videoId) throw new Error('URL inválida')

  const oembedUrl =
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`

  const res = await fetch(oembedUrl)
  if (!res.ok) throw new Error('Vídeo não encontrado')

  const data = await res.json()

  return {
    title: data.title,
    artist: data.author_name,
    thumbnail_url: data.thumbnail_url,
    duration_seconds: 0, // oEmbed não retorna duração; usuário pode editar
  }
}
```

- [ ] **Step 5: Criar apps/desktop/src/lib/audio.ts**

```typescript
import { Howl } from 'howler'
import { convertFileSrc } from '@tauri-apps/api/core'

let _howl: Howl | null = null

type AudioCallbacks = {
  onEnd?: () => void
  onLoad?: () => void
}

export function playSong(filePath: string, callbacks?: AudioCallbacks): Howl {
  if (_howl) {
    _howl.stop()
    _howl.unload()
  }

  const src = convertFileSrc(filePath)
  _howl = new Howl({
    src: [src],
    format: ['mp3'],
    autoplay: true,
    onend: callbacks?.onEnd,
    onload: callbacks?.onLoad,
  })

  return _howl
}

export function getCurrentHowl(): Howl | null {
  return _howl
}

export function getPosition(): number {
  return (_howl?.seek() as number) ?? 0
}

export function getDuration(): number {
  return _howl?.duration() ?? 0
}

export function setVolume(volume: number): void {
  _howl?.volume(volume)
}

export function seekTo(seconds: number): void {
  _howl?.seek(seconds)
}

export function pauseAudio(): void {
  _howl?.pause()
}

export function resumeAudio(): void {
  _howl?.play()
}
```

- [ ] **Step 6: Criar apps/desktop/src/store/player.ts**

```typescript
import { create } from 'zustand'
import type { Song, Playlist } from '@leviticus/core'

type PlayerState = {
  currentSong: Song | null
  currentPlaylist: Playlist | null
  playlistSongs: Song[]
  playlistPosition: number | null
  isPlaying: boolean
  position: number
  volume: number
  isDownloading: boolean
  downloadProgress: number
  play: (song: Song, playlist?: { playlist: Playlist; songs: Song[]; position: number }) => void
  pause: () => void
  resume: () => void
  setPosition: (pos: number) => void
  setVolume: (vol: number) => void
  setDownloading: (loading: boolean, progress?: number) => void
  nextInPlaylist: () => Song | null
  previousInPlaylist: () => Song | null
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  currentPlaylist: null,
  playlistSongs: [],
  playlistPosition: null,
  isPlaying: false,
  position: 0,
  volume: 1,
  isDownloading: false,
  downloadProgress: 0,
  play: (song, playlistCtx) =>
    set({
      currentSong: song,
      isPlaying: true,
      position: 0,
      currentPlaylist: playlistCtx?.playlist ?? null,
      playlistSongs: playlistCtx?.songs ?? [],
      playlistPosition: playlistCtx?.position ?? null,
    }),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),
  setPosition: (position) => set({ position }),
  setVolume: (volume) => set({ volume }),
  setDownloading: (isDownloading, downloadProgress = 0) =>
    set({ isDownloading, downloadProgress }),
  nextInPlaylist: () => {
    const { playlistSongs, playlistPosition } = get()
    if (playlistPosition === null) return null
    const next = playlistPosition + 1
    if (next >= playlistSongs.length) return null
    set({ playlistPosition: next })
    return playlistSongs[next]
  },
  previousInPlaylist: () => {
    const { playlistSongs, playlistPosition } = get()
    if (playlistPosition === null || playlistPosition === 0) return null
    const prev = playlistPosition - 1
    set({ playlistPosition: prev })
    return playlistSongs[prev]
  },
}))
```

- [ ] **Step 7: Rodar testes**

```bash
cd apps/desktop && pnpm test
```
Esperado: todos passando

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/lib/ytdlp.ts apps/desktop/src/lib/ytdlp.test.ts apps/desktop/src/lib/audio.ts apps/desktop/src/store/player.ts
git commit -m "feat(desktop): yt-dlp download, audio player and player store"
```

---

## Task 9: Tela Adicionar Música

**Files:**
- Modify: `apps/desktop/src/pages/AddSong.tsx`

- [ ] **Step 1: Implementar AddSong.tsx**

```typescript
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchYoutubeMetadata, downloadSong } from '../lib/ytdlp'
import { usePlayerStore } from '../store/player'
import { getDb } from '../lib/db'

type GroupRow = { id: string; name: string }

export function AddSong() {
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState<{
    title: string; artist: string; thumbnail_url: string; duration_seconds: number
  } | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [step, setStep] = useState<'url' | 'confirm' | 'downloading'>('url')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const { setDownloading } = usePlayerStore()

  async function handleFetchMetadata() {
    setError(null)
    try {
      const data = await fetchYoutubeMetadata(url)

      // verificar duplicata
      const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_url', url)
        .single()

      if (existing) {
        setError('Essa música já existe na biblioteca da organização.')
        return
      }

      // carregar grupos disponíveis
      const db = await getDb()
      const orgId = localStorage.getItem('leviticus_org_id') ?? ''
      const rows = await db.select<GroupRow[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [orgId]
      )

      setMetadata(data)
      setTitle(data.title)
      setArtist(data.artist)
      setGroups(rows)
      setStep('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar metadados')
    }
  }

  async function handleConfirm() {
    if (selectedGroups.length === 0) {
      setError('Selecione pelo menos um grupo.')
      return
    }
    setStep('downloading')
    setError(null)

    const orgId = localStorage.getItem('leviticus_org_id') ?? ''

    const { data: song, error: insertError } = await supabase
      .from('songs')
      .insert({
        org_id: orgId,
        youtube_url: url,
        title,
        artist,
        thumbnail_url: metadata!.thumbnail_url,
        duration_seconds: metadata!.duration_seconds || null,
      })
      .select()
      .single()

    if (insertError || !song) {
      setError(insertError?.message ?? 'Erro ao salvar')
      setStep('confirm')
      return
    }

    // vincular aos grupos
    await supabase.from('song_groups').insert(
      selectedGroups.map((gid) => ({ song_id: song.id, group_id: gid }))
    )

    // download local
    setDownloading(true, 0)
    try {
      await downloadSong(song.id, url, (p) => {
        setProgress(p)
        setDownloading(true, p)
      })
    } finally {
      setDownloading(false)
    }

    // reset
    setUrl('')
    setMetadata(null)
    setSelectedGroups([])
    setStep('url')
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-xl font-semibold mb-6">Adicionar Música</h2>

      {step === 'url' && (
        <div className="space-y-4">
          <input
            type="url"
            placeholder="Cole o link do YouTube aqui"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-gray-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleFetchMetadata}
            disabled={!url}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-40"
          >
            Buscar informações
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          {metadata?.thumbnail_url && (
            <img src={metadata.thumbnail_url} className="rounded-lg w-full" alt="" />
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Artista</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Grupos</label>
            <div className="space-y-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="rounded"
                  />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setStep('url')}
              className="px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-800"
            >
              Voltar
            </button>
            <button
              onClick={handleConfirm}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Confirmar e baixar
            </button>
          </div>
        </div>
      )}

      {step === 'downloading' && (
        <div className="space-y-4">
          <p className="text-gray-400">Baixando áudio...</p>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">{Math.round(progress * 100)}%</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Testar manualmente**

```bash
cd apps/desktop && pnpm tauri dev
```
Cole uma URL do YouTube → clique em "Buscar informações" → verifique que título e artista aparecem pré-preenchidos → selecione um grupo → clique "Confirmar e baixar" → aguarde o download.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/pages/AddSong.tsx
git commit -m "feat(desktop): add song page with YouTube metadata prefill and yt-dlp download"
```

---

## Task 10: Biblioteca, Grupos e Playlists

**Files:**
- Modify: `apps/desktop/src/pages/Library.tsx`
- Modify: `apps/desktop/src/pages/Groups.tsx`
- Modify: `apps/desktop/src/pages/Playlists.tsx`
- Modify: `apps/desktop/src/pages/PlaylistDetail.tsx`
- Create: `apps/desktop/src/components/SongCard.tsx`
- Create: `apps/desktop/src/components/DownloadButton.tsx`

- [ ] **Step 1: Criar apps/desktop/src/components/DownloadButton.tsx**

```typescript
import { useState } from 'react'
import { downloadSong, isDownloaded } from '../lib/ytdlp'
import { usePlayerStore } from '../store/player'

type Props = {
  songId: string
  youtubeUrl: string
  onDownloaded?: () => void
}

export function DownloadButton({ songId, youtubeUrl, onDownloaded }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const { setDownloading: setGlobalDownloading } = usePlayerStore()

  async function handleDownload() {
    setDownloading(true)
    setGlobalDownloading(true, 0)
    try {
      await downloadSong(songId, youtubeUrl, (p) => {
        setProgress(p)
        setGlobalDownloading(true, p)
      })
      onDownloaded?.()
    } finally {
      setDownloading(false)
      setGlobalDownloading(false)
    }
  }

  if (downloading) {
    return (
      <div className="flex items-center gap-2 text-sm text-blue-400">
        <div className="w-16 bg-gray-700 rounded-full h-1">
          <div
            className="bg-blue-500 h-1 rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {Math.round(progress * 100)}%
      </div>
    )
  }

  return (
    <button
      onClick={handleDownload}
      className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
      title="Baixar"
    >
      ↓ Baixar
    </button>
  )
}
```

- [ ] **Step 2: Criar apps/desktop/src/components/SongCard.tsx**

```typescript
import { useEffect, useState } from 'react'
import type { Song } from '@leviticus/core'
import { isDownloaded, getSongFilename } from '../lib/ytdlp'
import { playSong } from '../lib/audio'
import { usePlayerStore } from '../store/player'
import { DownloadButton } from './DownloadButton'

type Props = {
  song: Song
  playlistContext?: { playlistId: string; songs: Song[]; position: number }
}

export function SongCard({ song, playlistContext }: Props) {
  const [downloaded, setDownloaded] = useState(false)
  const { play, currentSong, isPlaying } = usePlayerStore()
  const isCurrentlyPlaying = currentSong?.id === song.id && isPlaying

  useEffect(() => {
    isDownloaded(song.id).then(setDownloaded)
  }, [song.id])

  async function handlePlay() {
    if (!downloaded) return
    const filePath = await getSongFilename(song.id)
    playSong(filePath, {
      onEnd: () => usePlayerStore.getState().pause(),
    })
    play(song)
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 group">
      {song.thumbnail_url && (
        <img
          src={song.thumbnail_url}
          className="w-12 h-12 rounded object-cover flex-shrink-0"
          alt=""
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{song.title}</p>
        <p className="text-sm text-gray-400 truncate">{song.artist}</p>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {downloaded ? (
          <button
            onClick={handlePlay}
            className="text-white bg-blue-600 hover:bg-blue-700 rounded-full w-8 h-8 flex items-center justify-center"
          >
            {isCurrentlyPlaying ? '⏸' : '▶'}
          </button>
        ) : (
          <DownloadButton
            songId={song.id}
            youtubeUrl={song.youtube_url}
            onDownloaded={() => setDownloaded(true)}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implementar Library.tsx**

```typescript
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Song } from '@leviticus/core'
import { getDb } from '../lib/db'
import { SongCard } from '../components/SongCard'

export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  useEffect(() => {
    async function load() {
      const db = await getDb()
      const rows = await db.select<Song[]>(
        'SELECT * FROM songs WHERE org_id = ? ORDER BY created_at DESC',
        [orgId]
      )
      const grps = await db.select<{ id: string; name: string }[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [orgId]
      )
      setSongs(rows)
      setGroups(grps)
    }
    load()
  }, [orgId])

  const filtered = songs.filter((s) => {
    const matchesSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Biblioteca</h2>
        <Link
          to="/add"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          + Adicionar
        </Link>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="search"
          placeholder="Buscar por título ou artista..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <select
          value={groupFilter ?? ''}
          onChange={(e) => setGroupFilter(e.target.value || null)}
          className="bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        {filtered.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">
            Nenhuma música encontrada.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implementar Playlists.tsx**

```typescript
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Playlist } from '@leviticus/core'
import { getDb } from '../lib/db'
import { isDownloaded } from '../lib/ytdlp'

type PlaylistWithStatus = Playlist & { total: number; downloaded: number }

export function Playlists() {
  const [playlists, setPlaylists] = useState<PlaylistWithStatus[]>([])
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  useEffect(() => {
    async function load() {
      const db = await getDb()
      const rows = await db.select<Playlist[]>(
        `SELECT * FROM playlists WHERE org_id = ?
         ORDER BY scheduled_date DESC NULLS FIRST, created_at DESC`,
        [orgId]
      )

      const withStatus = await Promise.all(
        rows.map(async (p) => {
          const songs = await db.select<{ song_id: string }[]>(
            'SELECT song_id FROM playlist_songs WHERE playlist_id = ?',
            [p.id]
          )
          const checks = await Promise.all(songs.map((s) => isDownloaded(s.song_id)))
          return {
            ...p,
            total: songs.length,
            downloaded: checks.filter(Boolean).length,
          }
        })
      )
      setPlaylists(withStatus)
    }
    load()
  }, [orgId])

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">Playlists</h2>
      <div className="space-y-2">
        {playlists.map((p) => (
          <Link
            key={p.id}
            to={`/playlists/${p.id}`}
            className="flex items-center justify-between p-4 bg-gray-900 rounded-xl hover:bg-gray-800"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              {p.scheduled_date && (
                <p className="text-sm text-gray-400">
                  {new Date(p.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
              )}
            </div>
            <div className="text-right text-sm">
              <p className={p.downloaded < p.total ? 'text-yellow-400' : 'text-green-400'}>
                {p.downloaded}/{p.total} baixadas
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verificar visualmente**

```bash
cd apps/desktop && pnpm tauri dev
```
Verifique: biblioteca exibe músicas, busca filtra, playlists mostram status de download

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/
git commit -m "feat(desktop): library, playlists, groups screens and SongCard component"
```

---

## Task 11: Player Mini e Player Expandido

**Files:**
- Modify: `apps/desktop/src/components/PlayerMini.tsx`
- Create: `apps/desktop/src/components/PlayerExpanded.tsx`

- [ ] **Step 1: Implementar PlayerMini.tsx**

```typescript
import { useEffect, useState } from 'react'
import { usePlayerStore } from '../store/player'
import {
  pauseAudio,
  resumeAudio,
  getPosition,
  getDuration,
  seekTo,
  setVolume,
} from '../lib/audio'
import { PlayerExpanded } from './PlayerExpanded'

export function PlayerMini() {
  const {
    currentSong, isPlaying, volume,
    pause, resume, setPosition, setVolume: storeSetVolume,
  } = usePlayerStore()
  const [expanded, setExpanded] = useState(false)
  const [duration, setDuration] = useState(0)
  const [pos, setPos] = useState(0)

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      const p = getPosition()
      const d = getDuration()
      setPos(p)
      setDuration(d)
      setPosition(p)
    }, 1000)
    return () => clearInterval(interval)
  }, [isPlaying])

  function handlePlayPause() {
    if (isPlaying) { pauseAudio(); pause() }
    else { resumeAudio(); resume() }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value)
    seekTo(val)
    setPos(val)
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value)
    setVolume(val)
    storeSetVolume(val)
  }

  if (!currentSong) {
    return <div className="h-16 bg-gray-900 border-t border-gray-800" />
  }

  return (
    <>
      <div
        className="h-16 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-4 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        {currentSong.thumbnail_url && (
          <img src={currentSong.thumbnail_url} className="w-10 h-10 rounded" alt="" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{currentSong.title}</p>
          <p className="text-xs text-gray-400 truncate">{currentSong.artist}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handlePlayPause() }}
          className="text-white w-8 h-8 flex items-center justify-center hover:text-blue-400"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-gray-500">🔊</span>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={volume}
            onChange={handleVolume}
            className="w-20"
          />
        </div>
      </div>
      {expanded && (
        <PlayerExpanded
          pos={pos}
          duration={duration}
          onSeek={handleSeek}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Criar apps/desktop/src/components/PlayerExpanded.tsx**

```typescript
import { usePlayerStore } from '../store/player'
import { pauseAudio, resumeAudio, getSongFilename, playSong } from '../lib/audio'
import { getSongFilename as getPath } from '../lib/ytdlp'

type Props = {
  pos: number
  duration: number
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClose: () => void
}

export function PlayerExpanded({ pos, duration, onSeek, onClose }: Props) {
  const {
    currentSong, currentPlaylist, playlistPosition, playlistSongs,
    isPlaying, volume, isDownloading, downloadProgress,
    pause, resume, nextInPlaylist, previousInPlaylist, setVolume,
  } = usePlayerStore()

  if (!currentSong) return null

  function handlePlayPause() {
    if (isPlaying) { pauseAudio(); pause() }
    else { resumeAudio(); resume() }
  }

  async function handleNext() {
    const next = nextInPlaylist()
    if (next) {
      const path = await getPath(next.id)
      const { playSong } = await import('../lib/audio')
      playSong(path)
    }
  }

  async function handlePrev() {
    const prev = previousInPlaylist()
    if (prev) {
      const path = await getPath(prev.id)
      const { playSong } = await import('../lib/audio')
      playSong(path)
    }
  }

  const pct = duration > 0 ? (pos / duration) * 100 : 0

  return (
    <div className="fixed inset-0 bg-gray-950/95 flex flex-col items-center justify-center z-50">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-gray-400 hover:text-white text-2xl"
      >
        ✕
      </button>

      {currentSong.thumbnail_url && (
        <img
          src={currentSong.thumbnail_url}
          className="w-64 h-64 rounded-2xl shadow-2xl mb-8 object-cover"
          alt=""
        />
      )}

      <h2 className="text-2xl font-bold mb-1">{currentSong.title}</h2>
      <p className="text-gray-400 mb-8">{currentSong.artist}</p>

      {currentPlaylist && playlistPosition !== null && (
        <p className="text-sm text-gray-500 mb-4">
          {currentPlaylist.name} — {playlistPosition + 1} de {playlistSongs.length}
        </p>
      )}

      {isDownloading && (
        <div className="w-64 mb-4">
          <p className="text-sm text-blue-400 mb-1">
            Baixando... {Math.round(downloadProgress * 100)}%
          </p>
          <div className="w-full bg-gray-700 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full"
              style={{ width: `${downloadProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="w-80 mb-6">
        <input
          type="range"
          min="0"
          max={duration || 1}
          step="1"
          value={pos}
          onChange={onSeek}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{fmt(pos)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={handlePrev}
          disabled={playlistPosition === null || playlistPosition === 0}
          className="text-2xl text-gray-400 hover:text-white disabled:opacity-30"
        >
          ⏮
        </button>
        <button
          onClick={handlePlayPause}
          className="w-14 h-14 rounded-full bg-white text-gray-900 flex items-center justify-center text-2xl hover:scale-105 transition-transform"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={handleNext}
          disabled={
            playlistPosition === null ||
            playlistPosition >= playlistSongs.length - 1
          }
          className="text-2xl text-gray-400 hover:text-white disabled:opacity-30"
        >
          ⏭
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-gray-400">🔊</span>
        <input
          type="range"
          min="0" max="1" step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-32 accent-blue-500"
        />
      </div>
    </div>
  )
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
```

- [ ] **Step 3: Verificar visualmente**

```bash
cd apps/desktop && pnpm tauri dev
```
Toque em uma música baixada → barra mini aparece → clique na barra → player expandido abre com progresso e controles

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/PlayerMini.tsx apps/desktop/src/components/PlayerExpanded.tsx
git commit -m "feat(desktop): mini player and expanded player with playlist navigation"
```

---

## Task 12: Controle Remoto (Supabase Realtime)

**Files:**
- Create: `apps/desktop/src/lib/realtime.ts`
- Create: `apps/desktop/src/store/remote.ts`
- Create: `apps/desktop/src/components/RemoteControl.tsx`

- [ ] **Step 1: Criar apps/desktop/src/lib/realtime.ts**

```typescript
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DevicePresence, RemoteCommand, PlayerState } from '@leviticus/core'
import { supabase } from './supabase'
import { getDeviceId, getDeviceName } from './device'

let _channel: RealtimeChannel | null = null

export function getChannel(userId: string): RealtimeChannel {
  if (_channel) return _channel

  _channel = supabase.channel(`remote-control:${userId}`, {
    config: { presence: { key: getDeviceId() } },
  })

  return _channel
}

export async function announcePresence(userId: string): Promise<void> {
  const channel = getChannel(userId)
  const presence: DevicePresence = {
    device_id: getDeviceId(),
    device_name: getDeviceName(),
    platform: 'desktop',
  }

  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(presence)
        resolve()
      }
    })
  })
}

export function onCommand(
  userId: string,
  handler: (cmd: RemoteCommand['payload']) => void
): void {
  getChannel(userId).on('broadcast', { event: 'command' }, ({ payload }) => {
    const cmd = payload as RemoteCommand
    if (cmd.target_device_id === getDeviceId()) {
      handler(cmd.payload)
    }
  })
}

export async function broadcastPlayerState(
  userId: string,
  state: PlayerState
): Promise<void> {
  await getChannel(userId).send({
    type: 'broadcast',
    event: 'player_state',
    payload: state,
  })
}

export async function sendCommand(
  userId: string,
  command: RemoteCommand
): Promise<void> {
  await getChannel(userId).send({
    type: 'broadcast',
    event: 'command',
    payload: command,
  })
}

export function getOnlineDevices(userId: string): DevicePresence[] {
  const state = getChannel(userId).presenceState()
  return Object.values(state).flat() as DevicePresence[]
}
```

- [ ] **Step 2: Criar apps/desktop/src/store/remote.ts**

```typescript
import { create } from 'zustand'
import type { DevicePresence, PlayerState } from '@leviticus/core'

type RemoteStore = {
  onlineDevices: DevicePresence[]
  targetDeviceId: string | null
  remotePlayerState: PlayerState | null
  setOnlineDevices: (devices: DevicePresence[]) => void
  setTargetDevice: (deviceId: string | null) => void
  setRemotePlayerState: (state: PlayerState) => void
}

export const useRemoteStore = create<RemoteStore>((set) => ({
  onlineDevices: [],
  targetDeviceId: null,
  remotePlayerState: null,
  setOnlineDevices: (onlineDevices) => set({ onlineDevices }),
  setTargetDevice: (targetDeviceId) => set({ targetDeviceId }),
  setRemotePlayerState: (remotePlayerState) => set({ remotePlayerState }),
}))
```

- [ ] **Step 3: Criar apps/desktop/src/components/RemoteControl.tsx**

```typescript
import { useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { usePlayerStore } from '../store/player'
import { useRemoteStore } from '../store/remote'
import {
  announcePresence,
  onCommand,
  broadcastPlayerState,
  sendCommand,
  getOnlineDevices,
} from '../lib/realtime'
import { getDeviceId } from '../lib/device'
import { pauseAudio, resumeAudio, seekTo, setVolume } from '../lib/audio'
import { downloadSong, getSongFilename, isDownloaded } from '../lib/ytdlp'
import { playSong } from '../lib/audio'
import type { RemoteCommand } from '@leviticus/core'

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const playerStore = usePlayerStore()
  const { setOnlineDevices, setRemotePlayerState, targetDeviceId } = useRemoteStore()

  useEffect(() => {
    if (!user) return

    announcePresence(user.id)

    // escuta estado remoto dos outros dispositivos
    const { supabase } = require('../lib/supabase')
    const channel = supabase.channel(`remote-control:${user.id}`)

    channel.on('broadcast', { event: 'player_state' }, ({ payload }: { payload: any }) => {
      if (payload.device_id !== getDeviceId()) {
        setRemotePlayerState(payload)
      }
    })

    channel.on('presence', { event: 'sync' }, () => {
      setOnlineDevices(getOnlineDevices(user.id))
    })

    // escuta comandos direcionados a este dispositivo
    onCommand(user.id, async (cmd) => {
      if (cmd.type === 'play') { resumeAudio(); playerStore.resume() }
      else if (cmd.type === 'pause') { pauseAudio(); playerStore.pause() }
      else if (cmd.type === 'seek') seekTo(cmd.position_seconds)
      else if (cmd.type === 'set_volume') setVolume(cmd.volume)
      else if (cmd.type === 'play_song') {
        const downloaded = await isDownloaded(cmd.song_id)
        if (!downloaded) {
          // buscar URL do SQLite local
          const { getDb } = await import('../lib/db')
          const db = await getDb()
          const rows = await db.select<{ youtube_url: string }[]>(
            'SELECT youtube_url FROM songs WHERE id = ?', [cmd.song_id]
          )
          if (rows[0]) {
            playerStore.setDownloading(true, 0)
            await downloadSong(cmd.song_id, rows[0].youtube_url, (p) => {
              playerStore.setDownloading(true, p)
            })
            playerStore.setDownloading(false)
          }
        }
        const path = await getSongFilename(cmd.song_id)
        playSong(path)
      }
    })

    // transmite estado do player a cada 1s
    const interval = setInterval(async () => {
      const state = playerStore
      await broadcastPlayerState(user.id, {
        device_id: getDeviceId(),
        song_id: state.currentSong?.id ?? null,
        playlist_id: state.currentPlaylist?.id ?? null,
        playlist_position: state.playlistPosition,
        playlist_total: state.playlistSongs.length || null,
        is_playing: state.isPlaying,
        position_seconds: state.position,
        volume: state.volume,
        is_downloading: state.isDownloading,
        download_progress: state.downloadProgress,
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [user])

  return <>{children}</>
}

export function RemoteControl() {
  const { onlineDevices, targetDeviceId, remotePlayerState, setTargetDevice } =
    useRemoteStore()
  const { user } = useAuthStore()

  const otherDevices = onlineDevices.filter((d) => d.device_id !== getDeviceId())

  if (otherDevices.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Controle Remoto</h2>
        <p className="text-gray-500 text-sm">
          Nenhum outro dispositivo online com a mesma conta.
        </p>
      </div>
    )
  }

  async function sendCmd(payload: RemoteCommand['payload']) {
    if (!user || !targetDeviceId) return
    await sendCommand(user.id, {
      target_device_id: targetDeviceId,
      payload,
    })
  }

  return (
    <div className="p-6 max-w-md">
      <h2 className="text-xl font-semibold mb-4">Controle Remoto</h2>

      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-2">Dispositivo alvo:</p>
        <div className="space-y-2">
          {otherDevices.map((d) => (
            <button
              key={d.device_id}
              onClick={() => setTargetDevice(d.device_id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border ${
                targetDeviceId === d.device_id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 hover:bg-gray-800'
              }`}
            >
              <span className="text-xl">{d.platform === 'desktop' ? '💻' : '📱'}</span>
              <span>{d.device_name}</span>
            </button>
          ))}
        </div>
      </div>

      {targetDeviceId && remotePlayerState && (
        <div className="bg-gray-900 rounded-xl p-4 space-y-4">
          <p className="font-medium">
            {remotePlayerState.song_id ? 'Tocando' : 'Ocioso'}
          </p>

          {remotePlayerState.is_downloading && (
            <div>
              <p className="text-sm text-blue-400 mb-1">
                Baixando... {Math.round(remotePlayerState.download_progress * 100)}%
              </p>
              <div className="w-full bg-gray-700 rounded-full h-1">
                <div
                  className="bg-blue-500 h-1 rounded-full"
                  style={{ width: `${remotePlayerState.download_progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {remotePlayerState.playlist_position !== null && (
            <p className="text-sm text-gray-400">
              Música {remotePlayerState.playlist_position + 1} de{' '}
              {remotePlayerState.playlist_total}
            </p>
          )}

          <div className="flex items-center gap-4 justify-center">
            <button onClick={() => sendCmd({ type: 'previous_in_playlist' })}
              className="text-2xl text-gray-400 hover:text-white">⏮</button>
            <button
              onClick={() =>
                sendCmd({ type: remotePlayerState.is_playing ? 'pause' : 'play' })
              }
              className="w-12 h-12 rounded-full bg-white text-gray-900 flex items-center justify-center text-xl"
            >
              {remotePlayerState.is_playing ? '⏸' : '▶'}
            </button>
            <button onClick={() => sendCmd({ type: 'next_in_playlist' })}
              className="text-2xl text-gray-400 hover:text-white">⏭</button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">🔊</span>
            <input
              type="range" min="0" max="1" step="0.05"
              value={remotePlayerState.volume}
              onChange={(e) =>
                sendCmd({ type: 'set_volume', volume: parseFloat(e.target.value) })
              }
              className="flex-1 accent-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Envolver App com RealtimeProvider em App.tsx**

```typescript
// No return de App.tsx, envolver Layout:
import { RealtimeProvider } from './components/RemoteControl'

// ...
return (
  <RealtimeProvider>
    <Layout>
      <Outlet />
    </Layout>
  </RealtimeProvider>
)
```

- [ ] **Step 5: Adicionar RemoteControl na Sidebar**

Adicione nos links da Sidebar:
```typescript
{ to: '/remote', label: 'Controle Remoto' },
```

E no router.tsx:
```typescript
import { RemoteControl } from './components/RemoteControl'
// ...
{ path: 'remote', element: <RemoteControl /> },
```

- [ ] **Step 6: Verificar manualmente com dois dispositivos**

Abra o app desktop em duas janelas (ou use o app mobile do Plano 3).
Verifique: ambos aparecem na lista de dispositivos, controles funcionam em tempo real.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/realtime.ts apps/desktop/src/store/remote.ts apps/desktop/src/components/RemoteControl.tsx
git commit -m "feat(desktop): Supabase Realtime remote control with device presence"
```

---

## Task 13: Tela de Seleção de Organização

**Files:**
- Modify: `apps/desktop/src/pages/OrgSelect.tsx`

- [ ] **Step 1: Implementar OrgSelect.tsx**

```typescript
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { syncOrg } from '../lib/sync'
import { useAuthStore } from '../store/auth'

type Org = { id: string; name: string }

export function OrgSelect() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [code, setCode] = useState('')
  const [newOrgName, setNewOrgName] = useState('')
  const [mode, setMode] = useState<'list' | 'join' | 'create'>('list')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('organizations')
      .select('id, name')
      .then(({ data }) => setOrgs(data ?? []))
  }, [user])

  async function selectOrg(org: Org) {
    localStorage.setItem('leviticus_org_id', org.id)
    await syncOrg(org.id)
    navigate('/library')
  }

  async function handleJoin() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('org_invite_codes')
      .select('org_id, expires_at, is_active')
      .eq('code', code.trim().toUpperCase())
      .single()

    if (error || !data || !data.is_active) {
      setError('Código inválido ou expirado.')
      setLoading(false)
      return
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setError('Este código expirou.')
      setLoading(false)
      return
    }

    await supabase.from('organization_members').insert({
      user_id: user!.id,
      org_id: data.org_id,
    })

    localStorage.setItem('leviticus_org_id', data.org_id)
    await syncOrg(data.org_id)
    navigate('/library')
  }

  async function handleCreate() {
    if (!newOrgName.trim()) return
    setLoading(true)
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: newOrgName.trim(), owner_id: user!.id })
      .select()
      .single()

    if (error || !data) {
      setError('Erro ao criar organização.')
      setLoading(false)
      return
    }

    await supabase.from('organization_members').insert({
      user_id: user!.id,
      org_id: data.id,
    })

    localStorage.setItem('leviticus_org_id', data.id)
    navigate('/library')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-sm">
        <h1 className="text-xl font-bold text-white mb-6">Selecionar Organização</h1>

        {mode === 'list' && (
          <>
            {orgs.length > 0 && (
              <div className="space-y-2 mb-4">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => selectOrg(org)}
                    className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg"
                  >
                    {org.name}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => setMode('join')}
                className="w-full border border-gray-700 hover:bg-gray-800 rounded-lg py-2 text-sm"
              >
                Entrar com código
              </button>
              <button
                onClick={() => setMode('create')}
                className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg py-2 text-sm text-white"
              >
                Criar organização
              </button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <input
              placeholder="Código de convite"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center font-mono text-lg"
              maxLength={12}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading || !code}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 disabled:opacity-40"
            >
              Entrar
            </button>
            <button onClick={() => setMode('list')} className="w-full text-sm text-gray-500">
              Voltar
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <input
              placeholder="Nome da organização"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading || !newOrgName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 disabled:opacity-40"
            >
              Criar
            </button>
            <button onClick={() => setMode('list')} className="w-full text-sm text-gray-500">
              Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
cd apps/desktop && pnpm tauri dev
```
Crie uma organização → verifique que redireciona para /library

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/pages/OrgSelect.tsx
git commit -m "feat(desktop): org selection with join by code and create org"
```

---

## Checklist de Self-Review

- [x] Auth guard implementado — redireciona para /login se não autenticado
- [x] Sync offline implementado — SQLite local lido em todas as telas
- [x] Download via yt-dlp com progresso — tauri-plugin-shell configurado
- [x] `convertFileSrc` usado para reprodução de arquivos locais
- [x] Player mini fixo na base do layout
- [x] Player expandido com progresso, volume, prev/next na playlist
- [x] Controle remoto bidirecional via Supabase Realtime Presence + Broadcast
- [x] `PlayerState.song_id` é `string | null`
- [x] Download automático ao receber `play_song` para música não baixada
- [x] Status de downloads na tela de playlists
- [x] Busca por título e artista na biblioteca
- [x] Aviso de músicas duplicadas na tela AddSong
- [x] OrgSelect com criar org e entrar via código
- [x] Transferência de estado `is_downloading` via Realtime

---

> **Próximo:** Plano 3 — App Mobile (React Native / Expo)
