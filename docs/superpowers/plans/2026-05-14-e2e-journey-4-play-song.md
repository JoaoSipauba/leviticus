# E2E Journey #3 (Play/Pause Song) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the fourth E2E spec (`04-play-song.spec.ts`) with one test that exercises play → pause → play via the SongCard button's `aria-label` flip (state-driven). No real audio.

**Architecture:** Reuse all existing helpers (`signupAndCreateOrg`, `installYtDlpMock`, `setReactInputValue`, `cleanLocalSqlite`). Add a song via the UI flow (paste URL → Buscar → Baixar) so the SongCard renders with a real `song.id`, then click the play button on the SongCard and wait for the `aria-label` to flip from "Tocar" to "Pausar" and back.

**Tech Stack:** WebdriverIO 9 + Mocha (existing harness). No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-14-e2e-journey-4-play-song-design.md](../specs/2026-05-14-e2e-journey-4-play-song-design.md)

---

## File Map

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/04-play-song.spec.ts` | CREATE — single `it()` |

No CI workflow changes. No app source changes. No new helpers.

---

## Task 1: Create the play/pause spec

**Files:**
- Create: `apps/desktop/e2e/specs/04-play-song.spec.ts`

- [ ] **Step 1: Create the spec file**

Write `apps/desktop/e2e/specs/04-play-song.spec.ts`:

```ts
// apps/desktop/e2e/specs/04-play-song.spec.ts
//
// Journey #3 from CLAUDE.md § Testing strategy — "Tocar música".
// Single test exercising the SongCard play/pause button. Assertion is
// state-driven via the aria-label flip (Tocar ↔ Pausar) which depends on
// the Zustand `isPlaying` state — independent of Howler actually playing
// audio (the fake .m4a fixture is intentionally invalid).

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
  installYtDlpMock,
} from '../helpers/app.js'
import { makeAdminClient, findSongByYoutubeUrl } from '../helpers/supabase.js'

describe('Journey #3 — Play / Pause song', () => {
  let orgId: string

  before(async () => {
    // ─── Reset + mock + signup + create org ───────────────────────────────
    await cleanLocalSqlite()
    await installYtDlpMock()
    const seeded = await signupAndCreateOrg()
    orgId = seeded.orgId

    // ─── Land on /library after org creation ──────────────────────────────
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library after org creation' }
    )

    // ─── Add a song via the AddSongModal flow ─────────────────────────────
    const supabase = makeAdminClient()
    const videoId = 'playpaus001'  // 11 chars — fetchYoutubeMetadata requires exactly 11
    const url = `https://youtube.com/watch?v=${videoId}`

    const addBtn = $('button=Adicionar')
    await addBtn.waitForExist({ timeout: 15_000 })
    await addBtn.click()

    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    const submitBtn = $('button=Baixar música')
    await submitBtn.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 2 did not render' })
    await submitBtn.waitForEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // ─── Wait for the song to land in Supabase ────────────────────────────
    const song = await findSongByYoutubeUrl(supabase, orgId, url, 60_000)
    if (!song) throw new Error(`Song row for ${url} did not appear in 60s`)

    // ─── Close the modal so the SongCard becomes clickable ────────────────
    // Step 4 has "Ver biblioteca" (closes modal + navigates) and "Adicionar
    // outra" (resets to step 1). Use "Ver biblioteca" to dismiss the modal.
    const verBibBtn = $('button=Ver biblioteca')
    await verBibBtn.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 4 did not render' })
    await verBibBtn.click()

    // ─── Wait for the SongCard's play button to appear in the Library ─────
    // After the modal closes, the new SongCard is rendered with the song's
    // title and an aria-labeled play button.
    const tocarBtn = $('button[aria-label=Tocar]')
    await tocarBtn.waitForExist({ timeout: 30_000, timeoutMsg: 'SongCard play button did not render' })
  })

  it('plays, then pauses, then plays again', async () => {
    // ─── Click play ───────────────────────────────────────────────────────
    const tocarBtn = $('button[aria-label=Tocar]')
    await tocarBtn.waitForExist({ timeout: 5_000 })
    await tocarBtn.click()

    // ─── Wait for the button to flip to "Pausar" — proves isPlaying=true ──
    const pausarBtn = $('button[aria-label=Pausar]')
    await pausarBtn.waitForExist({
      timeout: 10_000,
      timeoutMsg: 'Play button did not flip to Pausar — store wiring or re-render broken',
    })

    // ─── Click pause ──────────────────────────────────────────────────────
    await pausarBtn.click()

    // ─── Wait for the button to flip back to "Tocar" — proves isPlaying=false ──
    await tocarBtn.waitForExist({
      timeout: 10_000,
      timeoutMsg: 'Pause button did not flip back to Tocar — pause wiring broken',
    })

    // ─── Click play again to verify resume cycle works ────────────────────
    await tocarBtn.click()
    await pausarBtn.waitForExist({
      timeout: 10_000,
      timeoutMsg: 'Resume did not flip button back to Pausar — resume wiring broken',
    })

    // Final assertion: we ended in "playing" state.
    expect(await pausarBtn.isExisting()).toBe(true)
  })
})
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop/e2e && pnpm exec tsc --noEmit
```

Expected: clean. If errors, report.

- [ ] **Step 3: Run all specs locally**

```bash
pkill -f tauri-wd 2>/dev/null; sleep 1
cd /Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop && pnpm test:e2e:local 2>&1 | tail -40
```

Expected: 4 specs run, 8 total `it()` blocks pass (Journey #1's 1 + Journey #6's 2 + Journey #2's 4 + Journey #3's 1). Total runtime ≈ 50-90s.

If Journey #3's test fails:
- Check `apps/desktop/e2e/screenshots/` for the failure snapshot.
- **Most likely issue: button labels.** The plan uses `button[aria-label=Tocar]`. WebdriverIO's CSS attribute selector should match. If WebdriverIO requires the value to be quoted (`[aria-label="Tocar"]`), update.
- **"Ver biblioteca" button not appearing on step 4.** Inspect AddSongModal.tsx around line 2010 (where I saw it). If the label is different, adjust.
- **Multiple buttons with aria-label="Tocar"** — if the Library has more than one SongCard with this label (unlikely since we only added 1 song). Use `(await $$('button[aria-label=Tocar]'))[0]` or just `$('button[aria-label=Tocar]')` which returns the first.

If runtime exceeds the spec's 25s budget significantly: profile via `console.log(\`step X done at \${Date.now()}\`)` between steps. Usually the AddSong wait is the bottleneck.

- [ ] **Step 4: Commit (only after local run passes)**

```bash
git add apps/desktop/e2e/specs/04-play-song.spec.ts
git commit -m "feat(e2e): journey #3 — play/pause song via SongCard button"
```

- [ ] **Step 5: Push to update PR #15**

```bash
git push
```

The CI's `e2e` job picks up the new spec via the `specs/**/*.spec.ts` glob automatically.
