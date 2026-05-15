# E2E Journey #2 (Add Song via Paste URL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the third E2E spec (`03-add-song.spec.ts`) with 4 tests covering happy-path add + 3 error scenarios (URL inválida, vídeo indisponível, download falha). Introduces the reusable fake-binary mock pattern for yt-dlp.

**Architecture:** Mock at the subprocess level — a bash script at the path Tauri's shell capability points to (`$APPLOCALDATA/bin/yt-dlp`). Mock mode is switched at runtime via a `/tmp/fake-yt-dlp.mode` file. Setup helpers handle file installation and a reusable signup+create-org flow. SQL/filesystem assertions are the source of truth.

**Tech Stack:** WebdriverIO 9 + Mocha (existing harness). bash for the mock. Supabase service-role admin client (existing). No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-14-e2e-journey-3-add-song-design.md](../specs/2026-05-14-e2e-journey-3-add-song-design.md)

---

## File Map

| File | Action |
|---|---|
| `apps/desktop/e2e/fixtures/fake-yt-dlp.sh` | CREATE — configurable mock binary |
| `apps/desktop/e2e/helpers/app.ts` | MODIFY — add 4 helpers: `appLocalBinDir`, `appAudioDir`, `installYtDlpMock`, `setYtDlpMockMode`, `signupAndCreateOrg` |
| `apps/desktop/e2e/helpers/supabase.ts` | MODIFY — add `findSongByYoutubeUrl` |
| `apps/desktop/e2e/specs/03-add-song.spec.ts` | CREATE — outer describe + 4 `it()` tests |

No CI workflow changes. No app source changes. No new migrations.

---

## Task 1: Fake yt-dlp script + install/setMode helpers

**Files:**
- Create: `apps/desktop/e2e/fixtures/fake-yt-dlp.sh`
- Modify: `apps/desktop/e2e/helpers/app.ts`

This task delivers the mock infrastructure: the bash script that fakes yt-dlp, plus the helpers to install it and switch its mode.

- [ ] **Step 1: Create the fake yt-dlp script**

Create `apps/desktop/e2e/fixtures/fake-yt-dlp.sh` with this exact content:

```bash
#!/usr/bin/env bash
# Fake yt-dlp for E2E. Reads /tmp/fake-yt-dlp.mode to switch behavior.
# Covers 2 invocations the paste-URL flow emits:
#   metadata: yt-dlp --no-playlist --no-download --print "%(title)s|||%(uploader)s|||%(duration)s" <url>
#   download: yt-dlp --no-playlist -f bestaudio[ext=m4a]/bestaudio --newline --socket-timeout 10 -o <template> <url>
#
# Modes (read from /tmp/fake-yt-dlp.mode at every invocation):
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

- [ ] **Step 2: Make it executable in git**

```bash
chmod 0755 apps/desktop/e2e/fixtures/fake-yt-dlp.sh
git update-index --chmod=+x apps/desktop/e2e/fixtures/fake-yt-dlp.sh 2>/dev/null || true
```

(The `git update-index` is harmless if not yet tracked; we'll add+commit in Step 6. The actual file mode is what matters for `fs.copyFile` to keep the executable bit, which our helper handles via `fs.chmod` anyway.)

- [ ] **Step 3: Smoke-test the mock locally**

```bash
echo happy > /tmp/fake-yt-dlp.mode
bash apps/desktop/e2e/fixtures/fake-yt-dlp.sh --no-playlist --no-download --print '%(title)s|||%(uploader)s|||%(duration)s' 'https://youtube.com/watch?v=dQw4w9WgXcQ'
```

Expected output:
```
Test Song Title|||Test Channel|||123
```

```bash
echo fail-metadata > /tmp/fake-yt-dlp.mode
bash apps/desktop/e2e/fixtures/fake-yt-dlp.sh --print 'x' 'url'; echo "exit=$?"
```

Expected: stderr "ERROR: [youtube] ..." and `exit=1`.

```bash
echo happy > /tmp/fake-yt-dlp.mode
bash apps/desktop/e2e/fixtures/fake-yt-dlp.sh -o '/tmp/test-song.%(ext)s' 'url'
ls -la /tmp/test-song.m4a
```

Expected: file `/tmp/test-song.m4a` exists, size 1024.

Clean up: `rm /tmp/test-song.m4a /tmp/fake-yt-dlp.mode`.

- [ ] **Step 4: Add the helpers to `apps/desktop/e2e/helpers/app.ts`**

Read the existing file first:

```bash
cat apps/desktop/e2e/helpers/app.ts
```

Note existing imports (should include `fs`, `homedir`, `path`). Append these helpers AFTER the existing `stubConfirm` function:

```ts
/** Resolves the path Tauri's shell capability maps to for `yt-dlp` (and `ffmpeg`). */
export function appLocalBinDir(): string {
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
  const fixtureSrc = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/fake-yt-dlp.sh'
  )
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
```

**Important:** at the top of the file, ensure these imports are present (they probably are from prior tasks, but verify):

```ts
import { homedir, platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
```

If `fileURLToPath` and `platform` aren't already imported, add them. The existing `homedir` and `path` imports should already exist from Task 9 of journey #1.

- [ ] **Step 5: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/e2e/fixtures/fake-yt-dlp.sh \
        apps/desktop/e2e/helpers/app.ts
git commit -m "feat(e2e): fake yt-dlp mock + install/setMode helpers

Configurable subprocess-level mock for yt-dlp covering happy + 2 failure
modes (fail-metadata, fail-download). Reads /tmp/fake-yt-dlp.mode at
every invocation. Reusable across future journeys (#3 player, #4 cultos)."
```

---

## Task 2: signupAndCreateOrg helper + findSongByYoutubeUrl

**Files:**
- Modify: `apps/desktop/e2e/helpers/app.ts`
- Modify: `apps/desktop/e2e/helpers/supabase.ts`

The signup helper encapsulates the proven UI flow from journey #1 so subsequent journeys can start "logged in with an empty Library" cheaply. The SQL helper polls for a song row by youtube_url — used by all 4 tests.

- [ ] **Step 1: Add `signupAndCreateOrg` to `apps/desktop/e2e/helpers/app.ts`**

The helper depends on `browser`, `$`, `setReactInputValue` from this file, and `makeAdminClient` from the supabase helper. Append to `apps/desktop/e2e/helpers/app.ts` AFTER the helpers added in Task 1.

If the supabase helper isn't already imported, add at the top:

```ts
import { makeAdminClient } from './supabase.js'
```

Then append:

```ts
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

- [ ] **Step 2: Add `findSongByYoutubeUrl` to `apps/desktop/e2e/helpers/supabase.ts`**

Append AFTER the existing helpers (after `createInviteCode`):

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
    if (data && data.length === 1) {
      const row = data[0] as {
        id: string; title: string; artist: string; duration_seconds: number; song_type: string
      }
      return row
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/e2e/helpers/app.ts apps/desktop/e2e/helpers/supabase.ts
git commit -m "feat(e2e): signupAndCreateOrg helper + findSongByYoutubeUrl

signupAndCreateOrg encapsulates the journey #1 flow as a reusable
helper. findSongByYoutubeUrl polls Supabase for a song row by
(org_id, youtube_url) — used by all 4 tests in journey #2."
```

---

## Task 3: Spec — Test 1 (happy path)

**Files:**
- Create: `apps/desktop/e2e/specs/03-add-song.spec.ts`

This task ships the spec file with ONLY Test 1 (happy path). Proves the harness + mock end-to-end before adding error tests. Adding T2-T4 happens in Task 4.

- [ ] **Step 1: Create the spec with Test 1**

```ts
// apps/desktop/e2e/specs/03-add-song.spec.ts
//
// Journey #2 from CLAUDE.md § Testing strategy — "Adicionar música".
// Covers the paste-URL flow end-to-end plus 3 error scenarios.
//
// All 4 tests share a single signed-in user/org (the outer before() runs
// once per WebDriver session). Each test runs against a unique URL so DB
// state is isolated.

import { browser, $, expect } from '@wdio/globals'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
  installYtDlpMock,
  setYtDlpMockMode,
  appAudioDir,
} from '../helpers/app.js'
import { makeAdminClient, findSongByYoutubeUrl } from '../helpers/supabase.js'

describe('Journey #2 — Add song via paste URL', () => {
  let userId: string
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    await installYtDlpMock()
    const seeded = await signupAndCreateOrg()
    userId = seeded.userId
    orgId = seeded.orgId
  })

  it('Test 1 — happy path: paste URL → fetch metadata → confirm → song persists', async () => {
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const videoId = 't1happy1234'
    const url = `https://youtube.com/watch?v=${videoId}`

    // ─── Open the Add Song modal ──────────────────────────────────────────
    // The Library page has a button labeled "Nova música" or similar.
    // Wait for it to render after the post-create syncOrg completes.
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library after org creation' }
    )
    const addBtn = $('button=Nova música')
    await addBtn.waitForExist({ timeout: 15_000 })
    await addBtn.click()

    // ─── Switch to "Colar URL" tab (in case it's not default) ─────────────
    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) {
      await pasteTab.click()
    }

    // ─── Paste the URL and fetch metadata ─────────────────────────────────
    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    // ─── Step 2 renders with the canned metadata ──────────────────────────
    // Wait for the title input (only present on step 2) to appear with the
    // mocked value.
    const titleInput = $('input[value*="Test Song Title"]')
    await titleInput.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 2 did not render with canned title' })

    // ─── Click "Adicionar" (submit) ───────────────────────────────────────
    // The submit button on step 2 reads "Adicionar".
    const submitBtn = $('button=Adicionar')
    await submitBtn.waitForEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // ─── SQL assertion: song row appears within 30s ───────────────────────
    const song = await findSongByYoutubeUrl(supabase, orgId, url, 30_000)
    if (!song) throw new Error(`Song row for ${url} did not appear in 30s`)
    expect(song.title).toBe('Test Song Title')
    expect(song.artist).toBe('Test Channel')
    expect(song.duration_seconds).toBe(123)
    expect(song.song_type).toBe('normal')

    // ─── Filesystem assertion: audio file exists ──────────────────────────
    // The fake yt-dlp writes a 1KB .m4a to the audio dir keyed by song.id.
    const audioPath = path.join(appAudioDir(), `${song.id}.m4a`)
    const stat = await fs.stat(audioPath)
    expect(stat.size).toBeGreaterThanOrEqual(1024)
  })
})
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Run locally**

```bash
pkill -f tauri-wd 2>/dev/null; sleep 1
cd /Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop
pnpm test:e2e:local 2>&1 | tail -30
```

Expected: 3 specs run (`01-first-time-user`, `02-org-invites`, `03-add-song`). The new test passes. If it fails:

- Check `apps/desktop/e2e/screenshots/` for the failure snapshot.
- Common issues:
  - **Button label mismatch.** Inspect `AddSongModal.tsx` for the exact label of "Nova música" trigger (might be "+ Nova música" or similar). Update selector.
  - **Paste tab not the default.** The `if (await pasteTab.isExisting())` guard handles this — if the tab buttons render differently (e.g. "Buscar"/"Colar URL" toggle), the selector for the input must still match.
  - **URL input placeholder.** `input[placeholder*="youtube.com"]` matches any input with placeholder substring containing "youtube.com". Verify the actual placeholder in `AddSongModal.tsx` step 1. If it's different (e.g. "Cole o link..."), adjust to `input[placeholder*="link"]`.
  - **Step 2 title input selector** — `input[value*="Test Song Title"]` looks for an input whose `value` attribute contains the mocked title. If step 2 uses something other than a `<input>` for the title field, switch to `$('input#title')` or inspect.
  - **Audio path mismatch.** If file isn't at `audio/<id>.m4a` but at a different extension or directory, inspect ytdlp.ts's `getAudioDir` and `getSongFilename`. The fake script always writes `.m4a`.
  - **`Adicionar` button missing or disabled.** If step 2 requires a `song_type` selection before enabling submit, the test needs a click on the default chip. Inspect AddSongModal step-2 rendering.

If any of those bite, fix the selector and re-run. Don't change the test behavior — only adapt to actual UI labels/structure.

- [ ] **Step 4: Commit (only after local run passes)**

```bash
git add apps/desktop/e2e/specs/03-add-song.spec.ts
git commit -m "feat(e2e): journey #2 test 1 — paste URL, fetch metadata, persist song"
```

---

## Task 4: Spec — Tests 2, 3, 4 (error scenarios)

**Files:**
- Modify: `apps/desktop/e2e/specs/03-add-song.spec.ts`

Appends three error-scenario `it()` blocks as siblings of Test 1, inside the same outer describe.

- [ ] **Step 1: Read current spec file**

```bash
cat apps/desktop/e2e/specs/03-add-song.spec.ts
```

Locate the closing `})` of Test 1 (`it('Test 1 — happy path ...', async () => { ... })`). The new tests go BEFORE the outer describe's closing `})`.

- [ ] **Step 2: Append Test 2 (URL inválida)**

Add this `it()` block right after Test 1's closing `})`:

```ts
  it('Test 2 — URL inválida: client-side rejection, no song persisted', async () => {
    // The mock is in happy mode — if the validator failed and we reached
    // yt-dlp, we'd succeed (false positive). Keeping it in happy mode proves
    // the client never invoked yt-dlp.
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const invalidUrl = 'https://example.com/watch?v=abc1234567a'

    // Open the modal (cleanup any prior state by closing if step 4 left open)
    // Try clicking "Adicionar outra" first — if it's there, we're on step 4.
    const addAnother = $('button=Adicionar outra')
    if (await addAnother.isExisting()) {
      await addAnother.click()
    } else {
      const closeBtn = $('button[aria-label*="ech"]')  // "Fechar" close button
      if (await closeBtn.isExisting()) await closeBtn.click()
      await $('button=Nova música').click()
    }

    // Ensure we're on step 1 (paste URL tab)
    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', invalidUrl)
    await $('button=Buscar informações').click()

    // Error message should appear in <p role="alert">
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 5_000 })
    const alertText = await alert.getText()
    expect(alertText).toContain('URL inválida')
    expect(alertText).toContain('apenas links do YouTube')

    // Confirm no song row was created
    const song = await findSongByYoutubeUrl(supabase, orgId, invalidUrl, 2_000)
    expect(song).toBeNull()
  })
```

- [ ] **Step 3: Append Test 3 (vídeo indisponível)**

Right after Test 2:

```ts
  it('Test 3 — vídeo indisponível: yt-dlp exits non-zero, friendly error shown', async () => {
    await setYtDlpMockMode('fail-metadata')
    const supabase = makeAdminClient()
    const videoId = 't3metaerr0'
    const url = `https://youtube.com/watch?v=${videoId}`

    // Reset modal to step 1
    const addAnother = $('button=Adicionar outra')
    if (await addAnother.isExisting()) {
      await addAnother.click()
    } else {
      // Modal might still be open from T2 with the error visible — click X or
      // re-open.
      const closeBtn = $('button[aria-label*="ech"]')
      if (await closeBtn.isExisting()) await closeBtn.click()
      await $('button=Nova música').click()
    }

    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 10_000 })
    const alertText = await alert.getText()
    expect(alertText).toContain('Não foi possível buscar as informações do vídeo')

    const song = await findSongByYoutubeUrl(supabase, orgId, url, 2_000)
    expect(song).toBeNull()
  })
```

- [ ] **Step 4: Append Test 4 (download falha + rollback)**

Right after Test 3:

```ts
  it('Test 4 — download falha: row inserted then rolled back, error shown', async () => {
    await setYtDlpMockMode('fail-download')
    const supabase = makeAdminClient()
    const videoId = 't4dnerror0'
    const url = `https://youtube.com/watch?v=${videoId}`

    // Reset modal to step 1
    const addAnother = $('button=Adicionar outra')
    if (await addAnother.isExisting()) {
      await addAnother.click()
    } else {
      const closeBtn = $('button[aria-label*="ech"]')
      if (await closeBtn.isExisting()) await closeBtn.click()
      await $('button=Nova música').click()
    }

    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    // Step 2 renders with metadata (mock succeeds on --print)
    const titleInput = $('input[value*="Test Song Title"]')
    await titleInput.waitForExist({ timeout: 15_000 })

    // Click "Adicionar" — this inserts the song row, then download fails
    // and the catch block rolls back via DELETE.
    const submitBtn = $('button=Adicionar')
    await submitBtn.waitForEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // After failure, app returns to step 2 with error message visible
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 30_000 })
    const alertText = await alert.getText()
    expect(alertText).toContain('Falha ao baixar o áudio')

    // The rollback DELETEs the song row — poll for ABSENCE over 5s.
    const deadline = Date.now() + 5_000
    let stillThere = true
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('songs')
        .select('id')
        .eq('org_id', orgId)
        .eq('youtube_url', url)
      if (!data || data.length === 0) { stillThere = false; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (stillThere) throw new Error(`Song row for ${url} was not rolled back after download failure`)
  })
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Run locally**

```bash
pkill -f tauri-wd 2>/dev/null; sleep 1
cd /Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop
pnpm test:e2e:local 2>&1 | tail -40
```

Expected: 3 specs, 6 total `it()` blocks pass (Journey #1's 1 + Journey #6's 2 + Journey #2's 4). Total runtime ~80-120s.

If a test fails, the diagnostic strategy is the same as Task 3 Step 3 — check the failure screenshot, inspect the source for label mismatches, and adapt selectors only.

If the test ordering causes issues (e.g. T2's "reset modal" logic doesn't work because T1 left a different state than expected):
- Print the current URL / modal state at the start of each `it()` via `console.log(await browser.getUrl())` to diagnose.
- Consider closing the modal explicitly at the END of T1 instead of reopening at the start of T2.

If `button=Adicionar outra` selector matches something else, use a more specific selector like inspecting `AddSongModal.tsx` step 4 markup.

- [ ] **Step 7: Commit (only after local run passes)**

```bash
git add apps/desktop/e2e/specs/03-add-song.spec.ts
git commit -m "feat(e2e): journey #2 tests 2-4 — URL inválida, vídeo indisponível, download falha

Three error-scenario tests covering the existing UX:
- T2: client-side rejection of non-YouTube URLs
- T3: yt-dlp metadata exit non-zero (vídeo indisponível)
- T4: download exit non-zero (network error) — rollback validation"
```

---

## Final push

- [ ] **Push to update PR #15**

```bash
git push
```

The CI's `e2e` job will run all 6 tests (or whatever count when CI catches up). Watch for failures specific to Linux paths or xvfb (e.g. file paths under `~/.local/share/...` instead of `~/Library/Application Support/...`). The `appLocalBinDir` helper already handles this via `platform()` check.

If CI fails:
- Inspect the e2e-screenshots artifact uploaded on failure.
- The Linux path differences are the most likely failure category — most tests should be identical between Mac local and CI.
