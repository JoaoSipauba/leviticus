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
    const addBtn = $('button*=Adicionar')
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

  it('Test 2 — URL inválida: client-side rejection, no song persisted', async () => {
    // Keep mock in happy mode — if we accidentally reach yt-dlp, the metadata
    // call would succeed and the test would fail (false positive). The whole
    // point is the validator catches non-YouTube URLs before yt-dlp is called.
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const invalidUrl = 'https://example.com/watch?v=abc1234567a'

    // After Test 1 succeeded, the modal is at step 4. Click "Adicionar outra"
    // to reset to step 1.
    await $('button=Adicionar outra').click()

    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', invalidUrl)
    await $('button=Buscar informações').click()

    // The error renders inside <p role="alert"> on step 1.
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 5_000, timeoutMsg: 'Expected error alert on invalid URL' })
    const alertText = await alert.getText()
    expect(alertText).toContain('URL inválida')
    expect(alertText).toContain('apenas links do YouTube')

    // Confirm no song row was created
    const song = await findSongByYoutubeUrl(supabase, orgId, invalidUrl, 2_000)
    expect(song).toBeNull()
  })

  it('Test 3 — vídeo indisponível: yt-dlp exits non-zero, friendly error shown', async () => {
    await setYtDlpMockMode('fail-metadata')
    const supabase = makeAdminClient()
    const videoId = 't3metaerr00'  // 11 chars, valid YT video ID format
    const url = `https://youtube.com/watch?v=${videoId}`

    // Modal still at step 1 from Test 2; just paste new URL and submit.
    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 10_000, timeoutMsg: 'Expected error alert on yt-dlp metadata failure' })
    // The error text doesn't update instantly — poll until it changes from
    // T2's "URL inválida..." to T3's expected message (or timeout).
    await browser.waitUntil(
      async () => {
        const txt = await alert.getText()
        return txt.includes('Não foi possível buscar as informações do vídeo')
      },
      { timeout: 10_000, timeoutMsg: 'Did not see the yt-dlp metadata-failure message in alert' }
    )

    const song = await findSongByYoutubeUrl(supabase, orgId, url, 2_000)
    expect(song).toBeNull()
  })

  it('Test 4 — download falha: row inserted then rolled back, error shown', async () => {
    await setYtDlpMockMode('fail-download')
    const supabase = makeAdminClient()
    const videoId = 't4dnerror00'  // 11 chars, valid YT video ID format
    const url = `https://youtube.com/watch?v=${videoId}`

    // Modal still at step 1 from Test 3; paste new URL and submit.
    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    // Metadata mock succeeds → step 2 renders with the "Baixar música" button.
    const submitBtn = $('button=Baixar música')
    await submitBtn.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 2 did not render after metadata fetch' })
    await submitBtn.waitForEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // App inserts song row, then download mock fails. Catch block rolls back
    // via DELETE and returns to step 2 with error.
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 30_000, timeoutMsg: 'Expected error alert on download failure' })
    await browser.waitUntil(
      async () => {
        const txt = await alert.getText()
        return txt.includes('Falha ao baixar o áudio')
      },
      { timeout: 10_000, timeoutMsg: 'Did not see the download-failure message in alert' }
    )

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
    if (stillThere) {
      throw new Error(`Song row for ${url} was not rolled back after download failure`)
    }
  })
})
