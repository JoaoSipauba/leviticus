# E2E Harness + First Journey (First-Time User) Design

## Goal

Set up the end-to-end testing infrastructure for the Leviticus desktop app and implement the first critical user journey: **first-time user signs up, creates an organization, lands in the empty Library**. Establish a foundation that future jornadas (already enumerated in [CLAUDE.md § Testing strategy](../../../CLAUDE.md#testing-strategy)) can extend without re-doing infrastructure.

This spec covers infrastructure + 1 test only. The other 9 jornadas listed in CLAUDE.md are follow-up work, each in its own spec/plan cycle.

---

## Scope (this spec)

**In:**
- WebdriverIO v9 harness wired to launch the desktop app.
- Dual-driver setup: `tauri-driver` (official) for Linux CI, `tauri-wd` (community) for macOS local development.
- New `e2e` job in `.github/workflows/ci.yml` that spins up Supabase via Docker, builds the app, runs the test.
- One test: `specs/01-first-time-user.spec.ts` covering the journey end-to-end.
- Helpers for app lifecycle (`launchApp`, `closeApp`) and Supabase admin queries (used for SQL assertions, not for seeding — the test only reads).
- New proxy scripts in [apps/desktop/package.json](../../../apps/desktop/package.json) that forward to the e2e workspace: `"test:e2e": "pnpm --filter leviticus-e2e test"` (CI Linux) and `"test:e2e:local": "pnpm --filter leviticus-e2e test:local"` (macOS).

**Out (deferred):**
- Jornadas #2 through #10 from CLAUDE.md.
- Test data fixtures (the test creates its own data via the UI).
- Auth via session-token injection (future jornadas that don't test auth will want this).
- Parallel test execution.
- Visual regression / snapshot testing.
- Performance benchmarking.
- Mobile (Appium) — Leviticus is desktop-only today.

---

## Architecture

### File structure

```
apps/desktop/
  e2e/
    wdio.conf.ts              # base WebdriverIO config (CI Linux)
    wdio.local.conf.ts        # macOS override: uses tauri-wd
    tsconfig.json             # TS isolated for e2e — not part of vite build
    helpers/
      app.ts                  # launchApp, closeApp, takeScreenshot
      supabase.ts             # admin client wrapper for read-only SQL assertions
      env.ts                  # resolves paths to built binary, screenshots dir, supabase URL
    specs/
      01-first-time-user.spec.ts
    package.json              # e2e-specific deps (wdio, mocha, etc.) — separate from app
```

**Why a separate `e2e/package.json`?** WebdriverIO + its mocha framework + reporters pull ~50 transitive dependencies. Bundling them into [apps/desktop/package.json](../../../apps/desktop/package.json) inflates `pnpm install` time for everyone (and the Vite app doesn't need them). Isolating in `e2e/package.json` keeps the app install clean. pnpm workspaces handle this naturally — `e2e/` becomes a sibling workspace under `apps/desktop/`.

**Why a separate `tsconfig.json`?** The e2e tests import WebdriverIO's globals (`browser`, `$`, etc.) which the app's vite build doesn't know about and shouldn't typecheck. Isolating ensures `pnpm typecheck` in the app stays clean.

### Frameworks

| Layer | Tool | Version | Why |
|---|---|---|---|
| Test runner | `@wdio/cli` | ^9 | WebdriverIO is the established Tauri E2E pairing |
| Framework | `@wdio/mocha-framework` | ^9 | `describe`/`it` syntax — same shape as vitest |
| Reporter | `@wdio/spec-reporter` | ^9 | Human-readable spec output |
| Assertion | `@wdio/globals` + `expect-webdriverio` | ^9 | bundled with wdio, includes `expect()` |
| Driver (Linux/CI) | `tauri-driver` | latest | official |
| Driver (macOS local) | `tauri-wd` | latest | community, CLI binary installed via `cargo install` |

No Selenium or Playwright — Tauri's WebDriver bindings are the only path that works for a desktop app's window.

### Driver configuration

`wdio.conf.ts` (CI Linux) launches the app binary directly via `tauri-driver`:

```ts
capabilities: [{
  'tauri:options': {
    application: '../src-tauri/target/debug/Leviticus Dev',  // built artifact
  },
  browserName: 'wry',  // Tauri's WebView wrapper
}],
services: ['tauri-driver'],
```

`wdio.local.conf.ts` extends the base config but overrides the service to use `tauri-wd`:

```ts
import baseConfig from './wdio.conf.js'
export const config = {
  ...baseConfig.config,
  services: [['tauri-wd', { /* port, etc */ }]],
}
```

Both configs are TypeScript so the build path can reference `process.platform` to pick `Leviticus Dev.app/Contents/MacOS/Leviticus Dev` (mac) vs `Leviticus Dev` (Linux bin).

---

## Journey #1 — detailed flow

`apps/desktop/e2e/specs/01-first-time-user.spec.ts`:

```
describe('First-time user', () => {
  let email: string
  let orgName: string

  before(async () => {
    email = `test+${Date.now()}@leviticus.test`
    orgName = `Igreja Teste ${Date.now()}`
    // Optional: clean leviticus.db from a previous local run to prevent
    // cached state from interfering (CI starts from a fresh container).
    await cleanLocalSqlite()
  })

  it('signs up, creates an org, lands in Library', async () => {
    // 1. App launches at /login
    await expect($('h1')).toHaveText(/Entrar|Login/i)

    // 2. Toggle to signup mode
    await $('=Cadastrar').click()

    // 3. Fill credentials
    await $('input[type=email]').setValue(email)
    await $('input[type=password]').setValue('senha123')

    // 4. Submit
    await $('button[type=submit]').click()

    // 5. Wait for redirect to /org
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/org'),
      { timeout: 10_000, timeoutMsg: 'Did not redirect to /org after signup' }
    )

    // 6. Create org
    await $('=Criar organização').click()
    await $('input[placeholder*=Nome]').setValue(orgName)
    await $('=Criar').click()

    // 7. Wait for redirect to /library
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/library'),
      { timeout: 10_000, timeoutMsg: 'Did not redirect to /library after org creation' }
    )

    // 8. UI assertion: empty library is shown
    await expect($('h2, h1')).toHaveText(/Biblioteca/)
    await expect($('body')).toHaveText(/Nenhuma música|biblioteca vazia/i)

    // 9. SQL assertions: verify seed_owner_role trigger ran
    const supabase = makeAdminClient()
    const { data: user } = await supabase.auth.admin.listUsers()
    const u = user.users.find((u) => u.email === email)
    expect(u).toBeDefined()

    const { data: orgs } = await supabase.from('organizations').select('id, name').eq('name', orgName)
    expect(orgs).toHaveLength(1)
    const org = orgs![0]

    const { data: roles } = await supabase
      .from('roles')
      .select('id, name')
      .eq('org_id', org.id)
      .eq('name', 'Dono')
    expect(roles).toHaveLength(1)

    const { data: assignments } = await supabase
      .from('user_role_assignments')
      .select('user_id, role_id')
      .eq('org_id', org.id)
      .eq('user_id', u!.id)
    expect(assignments).toHaveLength(1)
    expect(assignments![0].role_id).toBe(roles![0].id)
  })
})
```

Selector strategy: use `=Text` (WebdriverIO's text-matching selector) for buttons/links since the app's button labels are stable Portuguese strings. For inputs, use `[placeholder*=...]` or `[type=...]` — also stable. **Don't** use auto-generated `data-testid` (the app doesn't have them; adding them just for E2E is over-engineering when text selectors work).

### Selector hardening (deferred but flagged)

If a button label changes during future product work, the test breaks. Acceptable risk for v1 — the labels in journey #1 (`Cadastrar`, `Criar`, `Entrar`) are foundational UX terms unlikely to churn. When jornadas #2+ start failing from label changes, we'll add `data-testid` selectively. Don't pre-optimize.

---

## CI workflow

New job `e2e` in [.github/workflows/ci.yml](../../../.github/workflows/ci.yml), runs after `test` (the existing typecheck+unit job) passes:

```yaml
e2e:
  name: E2E (first-time user)
  needs: test
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - uses: dtolnay/rust-toolchain@stable
    - name: Install Tauri Linux deps
      run: |
        sudo apt-get update
        sudo apt-get install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev
    - name: Install tauri-driver
      run: cargo install tauri-driver --locked
    - name: Install JS dependencies
      run: pnpm install --frozen-lockfile
    - name: Build core package
      run: pnpm --filter @leviticus/core build
    - name: Setup Supabase CLI
      uses: supabase/setup-cli@v1
      with: { version: latest }
    - name: Start Supabase
      working-directory: .
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
```

**Supabase keys at runtime:** `supabase start` outputs local anon + service-role keys (deterministic on the local container). The `Capture Supabase keys` step (above) captures them into the workflow's outputs map; subsequent steps reference them via `${{ steps.supabase-keys.outputs.anon }}` / `service_role`.

**`xvfb-run`:** Linux needs a virtual framebuffer to run a windowed app headlessly. Standard Tauri E2E pattern.

**Workflow trigger:** same as the existing `test` job (push to main/dev, PR to main). Runs in parallel with the `test` job after both checkout — no, scratch that — `needs: test` means it runs sequentially after `test` passes. If `test` fails, `e2e` doesn't run (saves CI minutes).

---

## macOS local workflow

Pre-req (one-time):

```bash
cargo install tauri-wd --locked
```

Day-to-day:

```bash
# Terminal 1: Supabase + dev app (one-time per session)
supabase start
cd apps/desktop && pnpm tauri build --debug --config src-tauri/tauri.conf.dev.json

# Terminal 2: run the test
cd apps/desktop/e2e && pnpm test:local
```

The `test:local` script in `e2e/package.json`:

```json
{
  "scripts": {
    "test": "wdio run wdio.conf.ts",
    "test:local": "wdio run wdio.local.conf.ts"
  }
}
```

If `tauri-wd` isn't installed, the `test:local` config fails with a friendly error pointing to the install instruction. Better than a generic "ECONNREFUSED" from WebdriverIO.

---

## Helpers

### `e2e/helpers/app.ts`

```ts
// Resolves the binary path per OS.
export function appBinaryPath(): string {
  const target = path.resolve(__dirname, '../../src-tauri/target/debug')
  if (process.platform === 'darwin') {
    return path.join(target, 'bundle/macos/Leviticus Dev.app/Contents/MacOS/Leviticus Dev')
  }
  return path.join(target, 'leviticus-desktop')  // matches `name` in src-tauri/Cargo.toml
}

export async function cleanLocalSqlite(): Promise<void> {
  const dbPath = path.join(
    os.homedir(),
    'Library/Application Support/com.leviticus.app.dev/leviticus.db'
  )
  if (process.platform !== 'darwin') return  // only macOS local
  try { await fs.unlink(dbPath) } catch {} // ignore if not exists
}
```

### `e2e/helpers/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js'

export function makeAdminClient() {
  const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY required for E2E')
  return createClient(url, key, { auth: { persistSession: false } })
}
```

The service-role key bypasses RLS. Tests use it for read-only assertions on the DB. **Never** ship the service-role key to the app — only the test runner has it.

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/wdio.conf.ts` | CREATE — base config |
| `apps/desktop/e2e/wdio.local.conf.ts` | CREATE — macOS override |
| `apps/desktop/e2e/tsconfig.json` | CREATE |
| `apps/desktop/e2e/package.json` | CREATE — separate workspace |
| `apps/desktop/e2e/helpers/app.ts` | CREATE |
| `apps/desktop/e2e/helpers/supabase.ts` | CREATE |
| `apps/desktop/e2e/helpers/env.ts` | CREATE |
| `apps/desktop/e2e/specs/01-first-time-user.spec.ts` | CREATE |
| `apps/desktop/e2e/.gitignore` | CREATE — ignore screenshots/, node_modules/ |
| `apps/desktop/package.json` | MODIFY — add `test:e2e` and `test:e2e:local` proxy scripts |
| `pnpm-workspace.yaml` | MODIFY — register `apps/desktop/e2e` as a workspace package |
| `.github/workflows/ci.yml` | MODIFY — add `e2e` job |
| `CLAUDE.md` | MODIFY — update Testing strategy section: replace "TODO setup" with the actual commands and link to e2e/ |

---

## Risks

- **`tauri-wd` is community-maintained.** If unmaintained or breaks against a Tauri update, macOS local E2E stops working. Mitigation: CI never depends on it; if it dies, you fall back to running E2E via CI only.
- **E2E test flakiness from timing.** WebdriverIO `waitUntil` with explicit timeouts should handle this, but if signup hits a slow Supabase response, the 10s timeout may bite. Mitigation: set timeouts generously in v1, tune later based on observation.
- **`tauri build --debug` produces a different artifact than the release build.** Some bugs only appear in release builds (optimizer differences, asset bundling). Mitigation acknowledged: this E2E catches integration bugs, not optimization bugs. Optimization bugs are caught by manual smoke before tagging a release.
- **`xvfb-run` on CI doesn't have GPU/audio.** Fine for journey #1 (no audio playback). Will need adjustment when jornada #3 (play music) is implemented.
- **Supabase CLI version drift.** If `supabase/setup-cli` updates its default `latest` to a version with breaking changes, CI breaks. Mitigation: pin the version in the workflow after the first green run.

---

## Out of scope (re-stated for clarity)

- Jornadas #2-#10 from CLAUDE.md.
- Fixtures / test data seeding.
- Auth via session token (will be needed when journeys #2+ skip auth).
- Custom reporters, retries, parallel execution, sharding.
- Visual regression.
- Performance budgets.
- Audio device setup for jornada #3.
