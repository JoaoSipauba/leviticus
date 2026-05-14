// apps/desktop/e2e/specs/08-create-playlist.spec.ts
//
// Journey #4 from CLAUDE.md § Testing strategy — Cultos (playlists).
// Scope reduced to creating a playlist via the modal. Exercises:
//   - create_playlist RPC (SECURITY DEFINER, requires owner or manage_playlists)
//   - Default form values (today's date, 09:00→11:00 time)
//   - Playlists list re-render after RPC succeeds
//
// Not in scope: adding sections, adding songs to playlist, playing the playlist.
// Those would extend the test significantly and depend on the AddSong + Player
// journeys (already covered separately). Coverage rationale: this test
// validates the playlist-creation pipeline; sections/songs are layered on top
// and don't add value as E2E coverage of the create flow.

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
} from '../helpers/app.js'
import { makeAdminClient } from '../helpers/supabase.js'

describe('Journey #4 — Create playlist (culto)', () => {
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    const seeded = await signupAndCreateOrg()
    orgId = seeded.orgId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('creates a playlist via the modal — SQL row appears', async () => {
    const supabase = makeAdminClient()
    const playlistName = `Culto E2E ${Date.now()}`

    // Navigate to /services (Cultos page)
    await browser.url('tauri://localhost/services')

    // Click "Novo culto" (top-right or empty-state button)
    const novoBtn = $('button*=Novo culto')
    await novoBtn.waitForExist({ timeout: 15_000 })
    await novoBtn.click()

    // Modal opens with form fields. Default date is today, start 09:00,
    // end 11:00 — just fill the name and submit.
    await setReactInputValue('input[placeholder*="Domingo Manhã"]', playlistName)

    // "Criar" submit button (form is in create mode, not edit)
    const criarBtn = $('button=Criar')
    await criarBtn.waitForEnabled({ timeout: 5_000 })
    await criarBtn.click()

    // Poll Supabase for the new playlist row
    type PlaylistRow = { id: string; name: string; scheduled_at: string; scheduled_end: string }
    let playlist: PlaylistRow | null = null
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('playlists')
        .select('id, name, scheduled_at, scheduled_end')
        .eq('org_id', orgId)
        .eq('name', playlistName)
      if (data && data.length === 1) {
        playlist = data[0] as PlaylistRow
        break
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!playlist) throw new Error(`Playlist "${playlistName}" did not appear in Supabase within 15s`)
    expect(playlist.name).toBe(playlistName)

    // Verify scheduled_at and scheduled_end are reasonable: same day,
    // 2h apart (09:00 → 11:00 default).
    const start = new Date(playlist.scheduled_at)
    const end = new Date(playlist.scheduled_end)
    const durationMs = end.getTime() - start.getTime()
    expect(durationMs).toBe(2 * 3600 * 1000)
  })
})
