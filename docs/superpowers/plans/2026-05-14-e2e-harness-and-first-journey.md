# E2E Harness + First Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the WebdriverIO E2E test harness for the Leviticus desktop app and implement one test covering the first-time-user journey (signup → create org → land in empty Library).

**Architecture:** New pnpm workspace package at `apps/desktop/e2e/` holds WebdriverIO config + helpers + specs. Dual driver setup: `tauri-driver` on Linux CI (official), `tauri-wd` on macOS local (community). CI adds a new `e2e` job that spins up Supabase via Docker, builds the app in debug mode, runs the test against the built binary using `xvfb-run` for headless display.

**Tech Stack:** WebdriverIO 9, @wdio/mocha-framework, @wdio/spec-reporter, expect-webdriverio, @supabase/supabase-js (admin client for SQL assertions), TypeScript, tsx, tauri-driver (Rust, CI only), tauri-wd (Rust, optional macOS local).

**Spec:** [docs/superpowers/specs/2026-05-14-e2e-harness-and-first-journey-design.md](../specs/2026-05-14-e2e-harness-and-first-journey-design.md)

---

## File Map

| File | Action |
|---|---|
| `apps/desktop/e2e/package.json` | CREATE — pnpm workspace package `leviticus-e2e` |
| `apps/desktop/e2e/tsconfig.json` | CREATE |
| `apps/desktop/e2e/.gitignore` | CREATE |
| `apps/desktop/e2e/helpers/env.ts` | CREATE |
| `apps/desktop/e2e/helpers/app.ts` | CREATE |
| `apps/desktop/e2e/helpers/supabase.ts` | CREATE |
| `apps/desktop/e2e/wdio.conf.ts` | CREATE — base config (CI Linux via tauri-driver) |
| `apps/desktop/e2e/wdio.local.conf.ts` | CREATE — macOS override via tauri-wd |
| `apps/desktop/e2e/specs/01-first-time-user.spec.ts` | CREATE |
| `pnpm-workspace.yaml` | MODIFY — register `apps/desktop/e2e` |
| `apps/desktop/package.json` | MODIFY — add `test:e2e` and `test:e2e:local` proxy scripts |
| `.github/workflows/ci.yml` | MODIFY — add `e2e` job |
| `CLAUDE.md` | MODIFY — Testing strategy: replace "TODO setup" with real commands |

---

## Task 1: pnpm workspace skeleton for e2e

**Files:**
- Create: `apps/desktop/e2e/package.json`
- Create: `apps/desktop/e2e/tsconfig.json`
- Create: `apps/desktop/e2e/.gitignore`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Inspect current `pnpm-workspace.yaml`**

```bash
cat pnpm-workspace.yaml
```

Note the existing entries. The new entry must follow the same indentation/style.

- [ ] **Step 2: Create the e2e package.json**

```json
{
  "name": "leviticus-e2e",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "wdio run ./wdio.conf.ts",
    "test:local": "wdio run ./wdio.local.conf.ts"
  },
  "devDependencies": {
    "@supabase/supabase-js": "^2.43.0",
    "@types/mocha": "^10.0.6",
    "@types/node": "^22.0.0",
    "@wdio/cli": "^9.0.0",
    "@wdio/globals": "^9.0.0",
    "@wdio/local-runner": "^9.0.0",
    "@wdio/mocha-framework": "^9.0.0",
    "@wdio/spec-reporter": "^9.0.0",
    "expect-webdriverio": "^5.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "webdriverio": "^9.0.0"
  }
}
```

Write this to `apps/desktop/e2e/package.json`.

- [ ] **Step 3: Create the e2e tsconfig**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["@wdio/globals/types", "@wdio/mocha-framework", "expect-webdriverio", "node"]
  },
  "include": ["wdio.conf.ts", "wdio.local.conf.ts", "specs/**/*.ts", "helpers/**/*.ts"]
}
```

Write to `apps/desktop/e2e/tsconfig.json`.

- [ ] **Step 4: Create the e2e .gitignore**

```
node_modules/
screenshots/
.wdio-logs/
```

Write to `apps/desktop/e2e/.gitignore`.

- [ ] **Step 5: Register the workspace in `pnpm-workspace.yaml`**

Open `pnpm-workspace.yaml`. Add `'apps/desktop/e2e'` to the `packages:` list. After the edit, the file should include all existing entries plus the new one. Example shape:

```yaml
packages:
  - 'apps/*'
  - 'apps/desktop/e2e'
  - 'packages/*'
  - 'worker'
```

(Match whatever your existing list looks like; do not delete or reorder entries.)

- [ ] **Step 6: Install dependencies**

From the repo root:

```bash
pnpm install
```

Expected: pnpm picks up the new workspace, installs ~150 transitive deps for wdio. No errors.

- [ ] **Step 7: Verify the workspace is registered**

```bash
pnpm --filter leviticus-e2e exec wdio --version
```

Expected: prints a version like `9.x.x`. If "command not found" or similar, the workspace isn't registered correctly — revisit Steps 5-6.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/e2e/package.json \
        apps/desktop/e2e/tsconfig.json \
        apps/desktop/e2e/.gitignore \
        pnpm-workspace.yaml \
        pnpm-lock.yaml
git commit -m "feat(e2e): create leviticus-e2e pnpm workspace skeleton"
```

---

## Task 2: Helper modules

**Files:**
- Create: `apps/desktop/e2e/helpers/env.ts`
- Create: `apps/desktop/e2e/helpers/app.ts`
- Create: `apps/desktop/e2e/helpers/supabase.ts`

- [ ] **Step 1: Create `env.ts`**

```ts
// apps/desktop/e2e/helpers/env.ts
//
// Resolves environment variables and paths used by the e2e harness.
// Reads from process.env so callers (CI workflow, local shell) can override.

import { homedir, platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Path to the Tauri debug build (after `tauri build --debug`). */
export function appBinaryPath(): string {
  const target = path.resolve(__dirname, '../../src-tauri/target/debug')
  if (platform() === 'darwin') {
    // macOS bundles produce a .app — the executable inside is what WebDriver launches.
    return path.join(
      target,
      'bundle/macos/Leviticus Dev.app/Contents/MacOS/Leviticus Dev'
    )
  }
  // Linux: the bare binary lives in the target/debug root.
  // Name matches `name` in apps/desktop/src-tauri/Cargo.toml.
  return path.join(target, 'leviticus-desktop')
}

/** Path to the local SQLite file used by the dev app on macOS. */
export function localSqliteDbPath(): string {
  return path.join(
    homedir(),
    'Library/Application Support/com.leviticus.app.dev/leviticus.db'
  )
}

/** Supabase URL — defaults to the local supabase start endpoint. */
export function supabaseUrl(): string {
  return process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
}

/** Service-role key (required for admin SQL assertions). */
export function supabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY required for e2e tests. ' +
        'Set it via the local shell or capture from `supabase status -o json`.'
    )
  }
  return key
}

/** Directory where WebdriverIO writes screenshots on failure. */
export function screenshotsDir(): string {
  return path.resolve(__dirname, '../screenshots')
}
```

Write to `apps/desktop/e2e/helpers/env.ts`.

- [ ] **Step 2: Create `app.ts`**

```ts
// apps/desktop/e2e/helpers/app.ts
//
// App-lifecycle helpers. The WebDriver service handles launching/quitting
// the actual app process — these helpers cover ancillary state.

import fs from 'node:fs/promises'
import { platform } from 'node:os'
import { localSqliteDbPath, screenshotsDir } from './env.js'

/**
 * Removes the local SQLite cache used by the dev app on macOS. Safe to call
 * even if the file doesn't exist. No-op on non-darwin platforms (CI Linux
 * starts from a fresh container, so there's nothing to clean).
 */
export async function cleanLocalSqlite(): Promise<void> {
  if (platform() !== 'darwin') return
  try {
    await fs.unlink(localSqliteDbPath())
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
}

/** Saves a screenshot of the current window state. Used by afterTest hook on failure. */
export async function takeScreenshot(label: string): Promise<string> {
  await fs.mkdir(screenshotsDir(), { recursive: true })
  const safe = label.replace(/[^a-zA-Z0-9-_]/g, '_')
  const filename = `${Date.now()}-${safe}.png`
  const fullPath = `${screenshotsDir()}/${filename}`
  await browser.saveScreenshot(fullPath)
  return fullPath
}
```

Write to `apps/desktop/e2e/helpers/app.ts`.

- [ ] **Step 3: Create `supabase.ts`**

```ts
// apps/desktop/e2e/helpers/supabase.ts
//
// Admin Supabase client for the e2e harness. Uses the service-role key, so
// it bypasses RLS — only the test runner has access to this key. The desktop
// app never sees it.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseUrl, supabaseServiceRoleKey } from './env.js'

let _client: SupabaseClient | null = null

export function makeAdminClient(): SupabaseClient {
  if (_client) return _client
  _client = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}
```

Write to `apps/desktop/e2e/helpers/supabase.ts`.

- [ ] **Step 4: Typecheck the e2e package**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/e2e/helpers/
git commit -m "feat(e2e): add env/app/supabase helper modules"
```

---

## Task 3: WebdriverIO base config (CI Linux)

**Files:**
- Create: `apps/desktop/e2e/wdio.conf.ts`

- [ ] **Step 1: Write the base config**

```ts
// apps/desktop/e2e/wdio.conf.ts
//
// Default WebdriverIO config for the e2e harness. Targets Linux + tauri-driver
// (used in CI). macOS local development uses wdio.local.conf.ts which extends
// from this base and swaps the driver.

import { spawn, type ChildProcess } from 'node:child_process'
import { appBinaryPath, screenshotsDir } from './helpers/env.js'
import { takeScreenshot } from './helpers/app.js'

let tauriDriver: ChildProcess | null = null

export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  reporters: ['spec'],
  specs: ['./specs/**/*.spec.ts'],
  capabilities: [
    {
      browserName: 'wry',
      'tauri:options': { application: appBinaryPath() },
    } as WebdriverIO.Capabilities,
  ],

  // tauri-driver listens on port 4444 by default. WebdriverIO connects there.
  hostname: '127.0.0.1',
  port: 4444,
  // tauri-driver doesn't speak the W3C "/session" suffix — we use the default path.

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  // tsx loader so we can write specs/helpers in TypeScript directly.
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: { transpileOnly: true, project: './tsconfig.json' },
  },

  beforeSession: () => {
    // Launch tauri-driver as a sub-process before the WebdriverIO session
    // connects. It manages WebKitGTKDriver internally on Linux.
    tauriDriver = spawn('tauri-driver', [], {
      stdio: [null, process.stdout, process.stderr],
    })
  },

  afterSession: () => {
    tauriDriver?.kill()
    tauriDriver = null
  },

  afterTest: async (test, _ctx, result) => {
    if (result.error) {
      const filePath = await takeScreenshot(test.title)
      console.error(`Screenshot saved: ${filePath}`)
    }
  },

  // Where wdio puts run logs (separate from screenshots).
  outputDir: './.wdio-logs',
}
```

Write to `apps/desktop/e2e/wdio.conf.ts`.

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: no errors. If errors reference WebdriverIO globals, double-check `tsconfig.json` includes `@wdio/globals/types` in `types`.

- [ ] **Step 3: Verify the config is loadable**

```bash
cd apps/desktop/e2e && pnpm exec wdio config --version
```

This doesn't run tests — just checks WebdriverIO can parse its config. Expected: prints wdio version with no errors. (If wdio complains about missing `tauri-driver` here, that's fine — tauri-driver only matters when we actually run a session.)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/e2e/wdio.conf.ts
git commit -m "feat(e2e): WebdriverIO base config targeting tauri-driver (Linux/CI)"
```

---

## Task 4: macOS local config (tauri-wd)

**Files:**
- Create: `apps/desktop/e2e/wdio.local.conf.ts`

- [ ] **Step 1: Write the local config**

```ts
// apps/desktop/e2e/wdio.local.conf.ts
//
// macOS local override. Extends the base config but uses tauri-wd (community
// CLI binary) instead of tauri-driver. Install with:
//   cargo install tauri-wd --locked
//
// See https://danielraffel.me/2026/02/14/i-built-a-webdriver-for-wkwebview-tauri-apps-on-macos/

import { spawn, type ChildProcess } from 'node:child_process'
import { config as baseConfig } from './wdio.conf.js'
import { takeScreenshot } from './helpers/app.js'

let tauriWd: ChildProcess | null = null

export const config: WebdriverIO.Config = {
  ...baseConfig,

  beforeSession: () => {
    // tauri-wd is the macOS WebDriver substitute. Default port is 4444 — matches
    // the base config's port so we don't need to override.
    tauriWd = spawn('tauri-wd', [], {
      stdio: [null, process.stdout, process.stderr],
    })
  },

  afterSession: () => {
    tauriWd?.kill()
    tauriWd = null
  },

  // Re-define afterTest because object spread doesn't merge nested functions —
  // we want the same screenshot behavior here.
  afterTest: async (test, _ctx, result) => {
    if (result.error) {
      const filePath = await takeScreenshot(test.title)
      console.error(`Screenshot saved: ${filePath}`)
    }
  },
}
```

Write to `apps/desktop/e2e/wdio.local.conf.ts`.

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/e2e/wdio.local.conf.ts
git commit -m "feat(e2e): macOS local config using tauri-wd"
```

---

## Task 5: First-time user spec

**Files:**
- Create: `apps/desktop/e2e/specs/01-first-time-user.spec.ts`

This is the actual test. It exercises the full sign-up → create-org → land-in-Library flow and asserts the seed_owner_role trigger correctly populated `roles` + `user_role_assignments`.

- [ ] **Step 1: Inspect the Login page to confirm button text**

```bash
grep -n "Cadastrar\|Entrar\|Login" apps/desktop/src/pages/Login.tsx | head -10
```

Note the exact button labels — the selectors in the spec must match.

- [ ] **Step 2: Inspect OrgSelect to confirm flow + button labels**

```bash
grep -n "Criar\|Entrar com código\|placeholder" apps/desktop/src/pages/OrgSelect.tsx | head -10
```

The spec we already reviewed (`OrgSelect.tsx`) has buttons "Criar organização" → form mode → "Criar" submit. Verify it matches what you see; if labels differ in current code, adjust the selectors below.

- [ ] **Step 3: Write the spec**

```ts
// apps/desktop/e2e/specs/01-first-time-user.spec.ts
//
// Critical journey #1 from CLAUDE.md § Testing strategy.
// Covers: signup → create first org → seed_owner_role trigger → empty Library.

import { browser, $, expect } from '@wdio/globals'
import { makeAdminClient } from '../helpers/supabase.js'
import { cleanLocalSqlite } from '../helpers/app.js'

describe('Journey #1 — First-time user', () => {
  let email: string
  let orgName: string

  before(async () => {
    email = `test+${Date.now()}@leviticus.test`
    orgName = `Igreja Teste ${Date.now()}`
    await cleanLocalSqlite()
  })

  it('signs up, creates an org, lands in Library, and seeds the Dono role', async () => {
    // ─── Login screen renders ─────────────────────────────────────────────
    await expect(browser).toHaveUrl(/\/login$/)

    // ─── Switch to signup mode ────────────────────────────────────────────
    // The Login page has a mode toggle; click the "Cadastrar" link/button.
    await $('=Cadastrar').click()

    // ─── Fill credentials ─────────────────────────────────────────────────
    await $('input[type=email]').setValue(email)
    await $('input[type=password]').setValue('senha-do-teste-e2e')

    // ─── Submit ───────────────────────────────────────────────────────────
    await $('button[type=submit]').click()

    // ─── Wait for redirect to /org ────────────────────────────────────────
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      {
        timeout: 15_000,
        timeoutMsg: 'Did not redirect to /org after signup within 15s',
      }
    )

    // ─── Open the "create org" form ───────────────────────────────────────
    await $('=Criar organização').click()

    // ─── Fill org name and submit ─────────────────────────────────────────
    await $('input[placeholder*="Nome da organização"]').setValue(orgName)
    // The submit button is also labeled "Criar" inside the form mode.
    await $('button=Criar').click()

    // ─── Wait for redirect to /library ────────────────────────────────────
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      {
        timeout: 15_000,
        timeoutMsg: 'Did not redirect to /library after creating org within 15s',
      }
    )

    // ─── UI assertion: empty library ──────────────────────────────────────
    // The Library page renders a heading "Biblioteca" and an empty-state message.
    await expect($('h2,h1')).toBeExisting()
    // Don't assert exact empty-state copy — let the SQL assertions cover correctness.

    // ─── SQL assertions: seed_owner_role trigger fired ────────────────────
    const supabase = makeAdminClient()

    // Find the auth.users row for our test email.
    const usersRes = await supabase.auth.admin.listUsers()
    if (usersRes.error) throw new Error(`listUsers failed: ${usersRes.error.message}`)
    const user = usersRes.data.users.find((u) => u.email === email)
    if (!user) throw new Error(`auth.users row not found for ${email}`)

    // Find the org row by name (we generated a unique name).
    const orgsRes = await supabase
      .from('organizations')
      .select('id, name, owner_id')
      .eq('name', orgName)
    if (orgsRes.error) throw new Error(`organizations select failed: ${orgsRes.error.message}`)
    expect(orgsRes.data ?? []).toHaveLength(1)
    const org = orgsRes.data![0]
    expect(org.owner_id).toBe(user.id)

    // Verify the seeded "Dono" role exists for this org.
    const rolesRes = await supabase
      .from('roles')
      .select('id, name')
      .eq('org_id', org.id)
      .eq('name', 'Dono')
    if (rolesRes.error) throw new Error(`roles select failed: ${rolesRes.error.message}`)
    expect(rolesRes.data ?? []).toHaveLength(1)
    const donoRoleId = rolesRes.data![0].id

    // Verify the assignment connecting our user → Dono role for this org.
    const assignmentsRes = await supabase
      .from('user_role_assignments')
      .select('user_id, org_id, role_id, group_id')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .is('group_id', null)
    if (assignmentsRes.error) {
      throw new Error(`user_role_assignments select failed: ${assignmentsRes.error.message}`)
    }
    expect(assignmentsRes.data ?? []).toHaveLength(1)
    expect(assignmentsRes.data![0].role_id).toBe(donoRoleId)

    // Verify Dono has all 7 permissions.
    const permsRes = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role_id', donoRoleId)
    if (permsRes.error) throw new Error(`role_permissions select failed: ${permsRes.error.message}`)
    const perms = (permsRes.data ?? []).map((p) => p.permission).sort()
    expect(perms).toEqual([
      'add_songs',
      'add_songs_to_playlist',
      'manage_groups',
      'manage_members',
      'manage_playlists',
      'manage_roles',
      'manage_songs',
    ])
  })
})
```

Write to `apps/desktop/e2e/specs/01-first-time-user.spec.ts`.

- [ ] **Step 4: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean. If `@wdio/globals` import errors out, double-check `tsconfig.json` types.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/e2e/specs/01-first-time-user.spec.ts
git commit -m "feat(e2e): journey #1 — signup, create org, verify Dono seed"
```

---

## Task 6: Proxy scripts in apps/desktop/package.json

**Files:**
- Modify: `apps/desktop/package.json`

The proxy scripts let you run `pnpm test:e2e` from `apps/desktop` without remembering the workspace name.

- [ ] **Step 1: Read the current scripts block**

```bash
cd apps/desktop && cat package.json | grep -A 15 '"scripts"'
```

Note the existing scripts. The new entries go alongside.

- [ ] **Step 2: Add the two scripts**

Open `apps/desktop/package.json`. In the `scripts` block, add (after the existing `test` entry):

```json
    "test:e2e": "pnpm --filter leviticus-e2e test",
    "test:e2e:local": "pnpm --filter leviticus-e2e test:local",
```

Final shape of the `scripts` block should be (preserve all existing entries, just add the two new ones):

```json
  "scripts": {
    "dev": "vite",
    "dev:local": "vite --mode devlocal",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev --config src-tauri/tauri.conf.dev.json",
    "test": "vitest run --passWithNoTests",
    "test:e2e": "pnpm --filter leviticus-e2e test",
    "test:e2e:local": "pnpm --filter leviticus-e2e test:local",
    "release": "release-it"
  },
```

- [ ] **Step 3: Verify the scripts resolve**

```bash
cd apps/desktop && pnpm run
```

Expected: lists all scripts including the new `test:e2e` and `test:e2e:local`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/package.json
git commit -m "feat(e2e): add test:e2e and test:e2e:local proxy scripts"
```

---

## Task 7: CI workflow — add e2e job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Inspect the current workflow**

```bash
cat .github/workflows/ci.yml
```

Note the existing `test` job (typecheck+unit). The new `e2e` job goes after it.

- [ ] **Step 2: Add the e2e job**

Open `.github/workflows/ci.yml`. After the existing `test` job, append (preserving the workflow's existing top-level `name:`, `on:`, and `jobs:` keys):

```yaml
  e2e:
    name: E2E (first-time user)
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

      - name: Setup pnpm
        uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4

      - name: Setup Node
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Install Tauri Linux deps
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libssl-dev \
            libgtk-3-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            xvfb

      - name: Install tauri-driver
        run: cargo install tauri-driver --locked

      - name: Install JS dependencies
        run: pnpm install --frozen-lockfile

      - name: Build core package
        run: pnpm --filter @leviticus/core build

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase
        run: supabase start

      - name: Capture Supabase keys
        id: supabase-keys
        run: |
          echo "anon=$(supabase status -o json | jq -r '.ANON_KEY')" >> $GITHUB_OUTPUT
          echo "service_role=$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')" >> $GITHUB_OUTPUT

      - name: Build app (debug)
        working-directory: apps/desktop
        env:
          VITE_SUPABASE_URL: http://127.0.0.1:54321
          VITE_SUPABASE_ANON_KEY: ${{ steps.supabase-keys.outputs.anon }}
        run: pnpm tauri build --debug --config src-tauri/tauri.conf.dev.json

      - name: Run E2E tests
        working-directory: apps/desktop/e2e
        env:
          SUPABASE_URL: http://127.0.0.1:54321
          SUPABASE_SERVICE_ROLE_KEY: ${{ steps.supabase-keys.outputs.service_role }}
        run: xvfb-run --auto-servernum pnpm test

      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-screenshots
          path: apps/desktop/e2e/screenshots/
          if-no-files-found: ignore
```

- [ ] **Step 3: Validate the workflow YAML locally**

```bash
# If you have actionlint installed, run it. Otherwise, just visually verify
# indentation and the `jobs:` structure is preserved.
which actionlint && actionlint .github/workflows/ci.yml || cat .github/workflows/ci.yml | head -80
```

Expected: actionlint reports no errors, OR (if not installed) the YAML visually parses cleanly — `jobs:` has both `test:` and `e2e:` at the same indentation level.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add e2e job for first-time-user journey"
```

---

## Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

The Testing strategy section currently says `pnpm test:e2e   # TODO setup`. Replace that with the now-real commands and add a link to the e2e workspace.

- [ ] **Step 1: Open CLAUDE.md and find the Testing strategy section**

```bash
grep -n "test:e2e\|TODO setup" CLAUDE.md
```

Note the line numbers around the placeholder.

- [ ] **Step 2: Replace the TODO line**

In the Testing strategy section's "Comandos" block, change:

```bash
# E2E (a configurar — Linux CI ou tauri-wd no Mac)
cd apps/desktop && pnpm test:e2e   # TODO setup
```

to:

```bash
# E2E — CI Linux (oficial, source of truth)
cd apps/desktop && pnpm test:e2e

# E2E — Mac local (rápido; requer `cargo install tauri-wd --locked` uma vez)
cd apps/desktop && pnpm test:e2e:local
```

- [ ] **Step 3: Add a link to the e2e workspace below the Comandos block**

After the closing triple-backtick of the Comandos code block, append:

```markdown
Os testes E2E vivem em [apps/desktop/e2e/](apps/desktop/e2e/). Antes de rodar local, garante que o Supabase está rodando (`supabase start`) e que o app dev está buildado (`pnpm tauri build --debug --config src-tauri/tauri.conf.dev.json`).
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: replace E2E TODO with real commands and link to e2e/"
```

---

## Task 9: Local smoke test (macOS)

**Files:** none modified — manual verification step.

This task verifies the harness runs end-to-end before pushing. Do not skip even if all previous steps committed cleanly — a green YAML doesn't mean the test actually runs.

- [ ] **Step 1: Install tauri-wd (one-time)**

```bash
cargo install tauri-wd --locked
```

Expected: completes after a couple of minutes; `tauri-wd --version` prints a version.

- [ ] **Step 2: Ensure Supabase is running**

```bash
supabase status
```

If not running:

```bash
supabase start
```

- [ ] **Step 3: Capture the service-role key for this run**

```bash
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')
echo "Key length: ${#SUPABASE_SERVICE_ROLE_KEY}"
```

Expected: prints a length > 0 (the key is several hundred chars).

- [ ] **Step 4: Build the dev app in debug mode**

```bash
cd apps/desktop && pnpm tauri build --debug --config src-tauri/tauri.conf.dev.json
```

Expected: produces `src-tauri/target/debug/bundle/macos/Leviticus Dev.app`. Build takes ~5min on first run.

- [ ] **Step 5: Run the E2E test**

```bash
cd apps/desktop && pnpm test:e2e:local
```

Expected: spec-reporter prints `Journey #1 — First-time user > signs up, creates an org, lands in Library, and seeds the Dono role` followed by a green ✓ and `1 passing`.

If it fails:
- Check `apps/desktop/e2e/screenshots/` for what the window looked like at failure.
- Check `apps/desktop/e2e/.wdio-logs/` for the WebdriverIO trace.
- Common issues: button label changed in app (update selectors in spec), tauri-wd not running on port 4444 (check `lsof -i :4444`), Supabase not seeded with migrations (run `supabase db reset`).

- [ ] **Step 6 (only if Step 5 passes): Push the branch**

Don't push if the smoke test failed — debug locally first.

```bash
git push -u origin feat/organization-tab
```

Wait for the CI run to start. Watch the `e2e` job. Expected: green ✓ within ~12-15 minutes (Supabase boot + Rust build + xvfb run).

If CI fails but local passed: usually a missing apt package or environment difference. Pull the `e2e-screenshots` artifact from the workflow run to see what the window looked like.

---

## Final notes

- All 9 tasks completed, branch pushed, and CI green = harness ready. Future jornadas (#2-#10) just add `apps/desktop/e2e/specs/NN-*.spec.ts` files.
- If `tauri-wd` becomes unmaintained, switch macOS local to a CI-only flow (delete `wdio.local.conf.ts` and the `test:e2e:local` script). The base config + tauri-driver path continues to work in CI.
- Don't bundle yt-dlp/ffmpeg mocking yet — jornada #2 (Adicionar música) will need them; that's a different spec.
