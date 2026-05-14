# E2E Journey #3 — Add Song (Paste URL) Design

## Goal

Add the third E2E journey: cover the "add song via paste URL" flow end-to-end, including 3 error paths. Validates the most complex sub-system in the app (the yt-dlp sidecar bridge) without depending on real network/YouTube.

Builds on the WebdriverIO harness shipped earlier. Introduces the **fake-binary mock pattern** — a reusable approach that future journeys (#4 cultos, #3 player) can extend without re-mocking.

This corresponds to jornada **#2** in the priority list in [CLAUDE.md § Testing strategy](../../../CLAUDE.md#testing-strategy).

---

## Scope

**In:**
- One new spec file `e2e/specs/03-add-song.spec.ts` with **4 `it()` tests** in one outer describe.
- One fixture: `e2e/fixtures/fake-yt-dlp.sh` — a configurable mock that responds to the 2 yt-dlp invocations the paste-URL flow emits, with 3 failure modes.
- New `app.ts` helpers: `installYtDlpMock()`, `setYtDlpMockMode()`, `signupAndCreateOrg()`.
- New `supabase.ts` helper: `findSongByYoutubeUrl()`.
- SQL- and filesystem-based assertions (DB state + audio file on disk).

**Out:**
- Tab "Buscar" (uses YT search via yt-dlp `--flat-playlist`). Future spec.
- Preview-audio (uses `--get-url`). Future spec.
- ffmpeg mock — paste-URL flow doesn't invoke ffmpeg.
- Ministry binding (no `song_groups` insertion in test).
- Edit/delete song flows.
- Other error paths not in T2-T4 (e.g. yt-dlp not found, duplicate song detection).

---

## Tests overview

The outer `describe('Journey #2 — Add song via paste URL')` contains 4 sibling `it()` blocks. Each `before()` is hoisted to share signup/org setup across all 4 tests in the same WebDriver session — the user state survives between tests because the app stays open.

| # | Test | Mock mode | Assertion |
|---|---|---|---|
| **T1** | Happy path | `happy` (default) | song row + file on disk |
| **T2** | URL inválida | n/a (yt-dlp never called) | error message in `<p role="alert">` |
| **T3** | yt-dlp metadata fail | `fail-metadata` | error message + no song row |
| **T4** | yt-dlp download fail | `fail-download` | error message + song row rollbacked |

Test ordering matters only in that T2 doesn't need a mock; T1 and T3-T4 need different mock modes. The state mutator `setYtDlpMockMode()` runs in each test's setup.

---

## Mock binary — `e2e/fixtures/fake-yt-dlp.sh`

Reads `/tmp/fake-yt-dlp.mode` to decide behavior. The file is written by `setYtDlpMockMode()` from the test runner before each `it()`.

```bash
#!/usr/bin/env bash
# Fake yt-dlp for E2E. Reads /tmp/fake-yt-dlp.mode to switch behavior.
# Covers 2 invocations the paste-URL flow emits:
#   metadata: yt-dlp --no-playlist --no-download --print "%(title)s|||%(uploader)s|||%(duration)s" <url>
#   download: yt-dlp --no-playlist -f bestaudio[ext=m4a]/bestaudio --newline --socket-timeout 10 -o <template> <url>
#
# Modes:
#   happy            — return canned metadata; write fake .m4a on download
#   fail-metadata    — exit 1 with yt-dlp-style stderr on --print
#   fail-download    — return canned metadata, but exit 1 with stderr on -o
#
# Not covered (future): --flat-playlist (search tab), --get-url (preview).

MODE="$(cat /tmp/fake-yt-dlp.mode 2>/dev/null || echo happy)"

TITLE="${FAKE_YTDLP_TITLE:-Test Song Title}"
UPLOADER="${FAKE_YTDLP_UPLOADER:-Test Channel}"
DURATION="${FAKE_YTDLP_DURATION:-123}"

# ── Metadata path ────────────────────────────────────────────────────────────
if printf '%s\n' "$@" | grep -q -- '--print'; then
  if [ "$MODE" = "fail-metadata" ]; then
    echo "ERROR: [youtube] dQw4w9WgXcQ: Video unavailable" >&2
    exit 1
  fi
  printf '%s|||%s|||%s\n' "$TITLE" "$UPLOADER" "$DURATION"
  exit 0
fi

# ── Download path (find -o template, write fake .m4a) ────────────────────────
if [ "$MODE" = "fail-download" ]; then
  echo "ERROR: HTTPSConnectionPool(host='rr1---sn-test.googlevideo.com'): Read timed out." >&2
  exit 1
fi

prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    out_path="$(printf '%s' "$arg" | sed 's/%(ext)s/m4a/g' | sed 's/\.\%([^)]*)s//g')"
    mkdir -p "$(dirname "$out_path")"
    head -c 1024 /dev/zero > "$out_path"
    echo "[download] Destination: $out_path"
    echo "[download] 100% of 1.00KiB"
    exit 0
  fi
  prev="$arg"
done

exit 1
```

**Permissions:** the helper `chmod 0755` the file at install time.

**Cross-platform note:** the path conventions (`$APPLOCALDATA/bin`) resolve differently on Linux (CI) vs macOS (local). The install helper handles both:
- macOS local: `~/Library/Application Support/com.leviticus.app.dev/bin/yt-dlp`
- Linux CI: `~/.local/share/com.leviticus.app.dev/bin/yt-dlp`

---

## Helpers

### `e2e/helpers/app.ts` additions

```ts
import { platform } from 'node:os'

/** Resolves the path Tauri's shell capability maps to for `yt-dlp` (and `ffmpeg`). */
function appLocalBinDir(): string {
  if (platform() === 'darwin') {
    return path.join(homedir(), 'Library/Application Support/com.leviticus.app.dev/bin')
  }
  // Linux (CI) — Tauri uses XDG data dir
  return path.join(homedir(), '.local/share/com.leviticus.app.dev/bin')
}

/** Audio output dir — where the app saves downloaded songs. */
export function appAudioDir(): string {
  return path.join(path.dirname(appLocalBinDir()), 'audio')
}

/**
 * Copies the fake yt-dlp shell script to where the app expects the binary
 * and sets it executable. Run once in `before()` of any test that needs yt-dlp.
 *
 * The mock's behavior is then mode-switched at runtime via setYtDlpMockMode.
 */
export async function installYtDlpMock(): Promise<void> {
  const binDir = appLocalBinDir()
  await fs.mkdir(binDir, { recursive: true })
  const fixtureSrc = path.resolve(__dirname, '../fixtures/fake-yt-dlp.sh')
  const dest = path.join(binDir, 'yt-dlp')
  await fs.copyFile(fixtureSrc, dest)
  await fs.chmod(dest, 0o755)
  // Start in happy mode by default.
  await setYtDlpMockMode('happy')
}

/** Writes /tmp/fake-yt-dlp.mode — read by fake-yt-dlp.sh on each invocation. */
export async function setYtDlpMockMode(
  mode: 'happy' | 'fail-metadata' | 'fail-download'
): Promise<void> {
  await fs.writeFile('/tmp/fake-yt-dlp.mode', mode, 'utf-8')
}

/**
 * Full UI signup + create org. Encapsulates the proven flow from journey #1
 * so subsequent journeys can start "logged in with an empty Library" cheaply.
 * Returns IDs for SQL assertions.
 *
 * Pre-req: app is at `/login` (cleanLocalSqlite was called before app boot).
 */
export async function signupAndCreateOrg(opts: {
  name?: string
  emailPrefix?: string
  orgName?: string
} = {}): Promise<{ userId: string; orgId: string; email: string }> {
  const ts = Date.now()
  const email = `${opts.emailPrefix ?? 'addsong'}+${ts}@leviticus.test`
  const orgName = opts.orgName ?? `Org Add Song ${ts}`

  // Login screen renders
  await browser.waitUntil(
    async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
    { timeout: 30_000, timeoutMsg: 'Login screen did not load' }
  )
  await $('input[type=email]').waitForExist({ timeout: 30_000 })
  await $('button=Criar conta').click()
  await setReactInputValue('input#name', opts.name ?? 'Usuário Teste')
  await setReactInputValue('input#email', email)
  await setReactInputValue('input#password', 'senha-do-teste-e2e')
  const submit = $('button[type=submit]')
  await submit.waitForEnabled({ timeout: 5_000 })
  await submit.click()

  // Org screen
  await browser.waitUntil(
    async () => /\/org$/.test(await browser.getUrl()),
    { timeout: 15_000, timeoutMsg: 'Did not redirect to /org' }
  )
  await $('button=Criar organização').click()
  await setReactInputValue('input[placeholder="Nome da organização"]', orgName)
  const create = $('button=Criar')
  await create.waitForEnabled({ timeout: 5_000 })
  await create.click()

  // Wait for the org row to materialize in Supabase
  const supabase = makeAdminClient()
  const deadline = Date.now() + 30_000
  let org: { id: string; owner_id: string } | null = null
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('organizations')
      .select('id, owner_id')
      .eq('name', orgName)
    if (data && data.length > 0) { org = data[0]; break }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!org) throw new Error(`Org "${orgName}" not in DB after 30s`)

  return { userId: org.owner_id, orgId: org.id, email }
}
```

### `e2e/helpers/supabase.ts` additions

```ts
/** Polls until a song row with this org+youtube_url appears or the deadline hits. */
export async function findSongByYoutubeUrl(
  admin: SupabaseClient,
  orgId: string,
  youtubeUrl: string,
  timeoutMs = 15_000
): Promise<{ id: string; title: string; artist: string; duration_seconds: number; song_type: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data } = await admin
      .from('songs')
      .select('id, title, artist, duration_seconds, song_type')
      .eq('org_id', orgId)
      .eq('youtube_url', youtubeUrl)
    if (data && data.length === 1) return data[0]
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}
```

---

## Test details

All tests live in `e2e/specs/03-add-song.spec.ts`. The outer `before()` does setup once; each `it()` is then a self-contained scenario.

### Outer setup

```ts
describe('Journey #2 — Add song via paste URL', () => {
  let userId: string
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    await installYtDlpMock()  // happy mode by default
    // wdio.local.conf.ts's beforeSession wipes WebKit, then this signs us up.
    const seeded = await signupAndCreateOrg()
    userId = seeded.userId
    orgId = seeded.orgId
  })

  // ... tests below
})
```

### T1 — Happy path

Open "Nova música" → paste URL → "Buscar informações" → confirm metadata → click "Adicionar" → wait for step 4 → assert song in DB + file on disk.

The fake URL `https://youtube.com/watch?v=t1happy1234` (must be 11-char video ID). The mock returns canned `Test Song Title|||Test Channel|||123`.

Assertions:
- `songs` row exists for `(orgId, normalizedUrl)` with `title='Test Song Title'`, `artist='Test Channel'`, `duration_seconds=123`, `song_type='normal'`.
- File exists at `appAudioDir()/<songId>.m4a` and is ≥1 byte.

### T2 — URL inválida

`setYtDlpMockMode('happy')` (so we'd succeed if reached, proving we DON'T reach yt-dlp). Open modal → paste `https://example.com/watch?v=abc1234567a` → click "Buscar informações" → assert step stays at 1 → assert `<p role="alert">` text contains `"URL inválida: apenas links do YouTube são aceitos"`.

No song row created (assert via SQL with the URL — `null` expected).

### T3 — Vídeo indisponível (metadata fail)

`setYtDlpMockMode('fail-metadata')`. Open modal → paste valid URL `https://youtube.com/watch?v=t3metaerr0` → click "Buscar informações" → assert step stays at 1 → assert error text contains `"Não foi possível buscar as informações do vídeo. Tente novamente."`.

No song row created.

### T4 — Download fail

`setYtDlpMockMode('fail-download')`. Open modal → paste valid URL `https://youtube.com/watch?v=t4dnerror0` → click "Buscar" → confirm metadata renders → click "Adicionar".

Behavior:
- App inserts song row (because metadata succeeded)
- Tries to download → fails
- Catch block runs `DELETE FROM songs` + `DELETE FROM song_groups` to rollback
- Sets error on step 2
- Re-renders step 2

Assertions:
- Step is back at 2.
- Error text contains `"Falha ao baixar o áudio. Tente novamente."`
- `songs` row does NOT exist for this URL (rollback confirmed). Poll for absence over 5s.
- File does NOT exist at expected path.

---

## State management between tests

Tests run serially in a single WebDriver session. After T1 happy path, the modal is closed (`step=4` shows close button). Each subsequent test opens the modal fresh via "Nova música" click. Between tests:
- The modal state is reset because each test clicks "Nova música" again (or the "Adicionar outra" path).
- URLs are unique per test (T1: `t1happy...`, T2: example.com, T3: `t3metaerr...`, T4: `t4dnerror...`) so DB queries don't cross-contaminate.

Between describe-blocks (when journey #2's spec finishes and next test file starts), the WebDriver session ends and the app process is killed. Next session starts fresh per the harness pattern.

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/fixtures/fake-yt-dlp.sh` | CREATE |
| `apps/desktop/e2e/helpers/app.ts` | MODIFY — add 4 helpers |
| `apps/desktop/e2e/helpers/supabase.ts` | MODIFY — add `findSongByYoutubeUrl` |
| `apps/desktop/e2e/specs/03-add-song.spec.ts` | CREATE |

No app source changes. No CI workflow changes. No new migrations.

---

## Cross-cutting decisions

- **Reuse `signupAndCreateOrg` instead of session injection.** Discussed in brainstorm — UI signup is more durable than coupling to supabase-js internal storage format. Adds ~15s to setup; the helper is reused by future journeys.
- **Mock at the binary level, not at the JS layer.** Subprocess interception is cleanest and works the same in CI Linux. The fake binary covers happy + 2 fail modes — extensible.
- **Mock mode via `/tmp` file**, not env vars. Env vars require restarting the WebDriver session to propagate; a file is read by the script on each invocation. Mode-switch is O(1).
- **Single spec, 4 tests in one describe.** Setup cost (signup + create org = ~15s) is shared across all 4 tests. Total runtime estimate: ~40-60s.
- **`fail-download` rollback assertion** is the only test that verifies a side-effect of failure (DB cleanup). The other failure tests just check the message — the app doesn't have side-effects to rollback before metadata returns.

---

## Risks

- **The yt-dlp Rust ensure_yt_dlp may verify version/signature** before declaring the binary ready. If it does, the fake script needs to also respond to `--version`. We'll detect this on the first local run; if it surfaces, extend the mock to:
  ```bash
  if [ "$1" = "--version" ]; then
    echo "2024.09.27"; exit 0
  fi
  ```
- **`/tmp/fake-yt-dlp.mode` is global state.** If tests ever run in parallel (we don't today — `maxInstances: 1`), they would clobber each other. Acceptable for current harness.
- **The fake .m4a file is 1024 zero bytes** — not a valid m4a. If a future test tries to PLAY the song, Howler will error. For journey #3 (play music), we'll generate a tiny valid file via ffmpeg or include a fixture.
- **Step 3/4 transition timing.** The success step takes ~400ms via `setTimeout`. Test must wait for either step 4 OR the modal to close. Wait pattern uses URL stability + the "Adicionar outra" button.

---

## Out of scope (re-stated)

- Tab "Buscar" (YT search).
- Preview audio.
- ffmpeg mock.
- Edit / delete song.
- Ministry binding on song create.
- yt-dlp `--version` handling (will add if needed at run time).
- Multi-add session ("Adicionar outra" flow).
