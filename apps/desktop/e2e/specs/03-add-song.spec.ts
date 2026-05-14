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
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    await installYtDlpMock()
    const seeded = await signupAndCreateOrg()
    orgId = seeded.orgId
  })

  it('Test 1 — happy path: paste URL → fetch metadata → confirm → song persists', async () => {
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const videoId = 't1happy1234'
    const url = `https://youtube.com/watch?v=${videoId}`

    // ─── Open the Add Song modal ──────────────────────────────────────────
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library after org creation' }
    )
    const addBtn = $('button=Adicionar')
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

    // ─── Step 2 renders — the "Baixar música" button only appears there ───
    const submitBtn = $('button=Baixar música')
    await submitBtn.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 2 did not render' })
    await submitBtn.waitForEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // ─── SQL assertion: song row appears within 60s ───────────────────────
    // The flow does: insert songs row, then downloadSong() which awaits the
    // fake yt-dlp. Mock writes 1KB .m4a quickly, so the row appears fast.
    const song = await findSongByYoutubeUrl(supabase, orgId, url, 60_000)
    if (!song) throw new Error(`Song row for ${url} did not appear in 60s`)
    expect(song.title).toBe('Test Song Title')
    expect(song.artist).toBe('Test Channel')
    expect(song.duration_seconds).toBe(123)
    expect(song.song_type).toBe('normal')

    // ─── Filesystem assertion: audio file exists ──────────────────────────
    const audioPath = path.join(appAudioDir(), `${song.id}.m4a`)
    const stat = await fs.stat(audioPath)
    expect(stat.size).toBeGreaterThanOrEqual(1024)
  })
})
