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

    const addBtn = $('button*=Adicionar')
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
    const verBibBtn = $('button=Ver biblioteca')
    await verBibBtn.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 4 did not render' })
    await verBibBtn.click()

    // ─── Wait for the SongCard's play button to appear in the Library ─────
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
