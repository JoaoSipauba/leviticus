// apps/desktop/e2e/specs/10-add-song-variations.spec.ts
//
// Journey B — Add song variations.
// Extends coverage beyond the basic paste-URL happy path (Journey #2).
// Covers: duplicate URL detection, song_type selection, and ministry binding.
//
// Structure: outer before() boots a fresh org once. T1 adds the first song
// (needed to test the dup check). T2 picks "Playback" type. T3 seeds a
// ministry via admin and verifies song_groups row after creation.

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
  installYtDlpMock,
  setYtDlpMockMode,
} from '../helpers/app.js'
import { makeAdminClient, findSongByYoutubeUrl, createGroupForOrg } from '../helpers/supabase.js'

describe('Journey B — Add song variations', () => {
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    await installYtDlpMock()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'addsong-b' })
    orgId = seeded.orgId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  // ─── Helper: open the AddSong modal and switch to "Colar URL" tab ─────────
  async function openAddSongModal() {
    const addBtn = $('button*=Adicionar')
    await addBtn.waitForExist({ timeout: 15_000 })
    await addBtn.click()
    // Espera o modal renderizar — tab "Colar URL" precisa existir antes do
    // click. Sem waitForExist, em builds mais lentos o test prosseguia sem
    // trocar de tab e o input do youtube nem estava no DOM.
    // Timeout folgado (15s): sob a suíte completa o app abre mais devagar
    // e 5s estourava de forma intermitente (issue #100).
    const pasteTab = $('button=Colar URL')
    await pasteTab.waitForExist({ timeout: 15_000, timeoutMsg: 'AddSongModal não abriu (Colar URL tab missing)' })
    await pasteTab.click()
    // Garante que o input está visível antes do helper a chamar.
    await $('input[placeholder*="youtube.com"]').waitForExist({
      timeout: 10_000,
      timeoutMsg: 'Input do YouTube não apareceu após clicar Colar URL',
    })
  }

  // ─── Helper: fetch metadata for a URL and advance to step 2 ──────────────
  async function fetchMetadataAndWaitStep2(url: string) {
    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()
    const submitBtn = $('button=Baixar música')
    await submitBtn.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 2 did not render' })
    await submitBtn.waitForEnabled({ timeout: 5_000 })
    return submitBtn
  }

  it('T1 — URL duplicada: inline error após segunda tentativa com mesmo URL', async () => {
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const videoId = 'b1dup1234ab'
    const url = `https://youtube.com/watch?v=${videoId}`

    // ─── Add the song once (happy path) ──────────────────────────────────
    await openAddSongModal()
    const submitBtn = await fetchMetadataAndWaitStep2(url)
    await submitBtn.click()

    // Wait for step 4 ("Adicionar outra" button signals success)
    const addOutraBtn = $('button=Adicionar outra')
    await addOutraBtn.waitForExist({ timeout: 60_000, timeoutMsg: 'Song did not finish adding' })

    const song = await findSongByYoutubeUrl(supabase, orgId, url, 30_000)
    if (!song) throw new Error(`Song for ${url} did not appear in DB`)

    // ─── Attempt to add the SAME URL again ────────────────────────────────
    await addOutraBtn.click()

    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    // Dup check runs after fetchYoutubeMetadata returns → error on step 1
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 15_000, timeoutMsg: 'Expected dup-URL error alert' })
    expect(await alert.getText()).toContain('Essa música já existe na biblioteca')

    // song row unchanged (still exactly 1)
    const { data } = await supabase
      .from('songs').select('id').eq('org_id', orgId).eq('youtube_url', url)
    expect((data ?? []).length).toBe(1)
  })

  it('T2 — tipo "Playback": song_type salvo corretamente', async () => {
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const videoId = 'b2play234ab'
    const url = `https://youtube.com/watch?v=${videoId}`

    // Modal is at step 1 after T1 (dup check stays on step 1)
    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    const submitBtn = $('button=Baixar música')
    await submitBtn.waitForExist({ timeout: 15_000, timeoutMsg: 'Step 2 did not render for T2' })
    await submitBtn.waitForEnabled({ timeout: 5_000 })

    // Click the "Playback" chip in step 2
    const playbackBtn = $('button=Playback')
    await playbackBtn.waitForExist({ timeout: 5_000, timeoutMsg: 'Playback chip not found' })
    await playbackBtn.click()

    await submitBtn.click()

    // Poll for song row with song_type='playback'
    const song = await findSongByYoutubeUrl(supabase, orgId, url, 60_000)
    if (!song) throw new Error(`Song for ${url} did not appear in DB`)
    expect(song.song_type).toBe('playback')
  })

  it('T3 — vínculo com ministério: song_groups row criado', async () => {
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const videoId = 'b3minis234b'
    const url = `https://youtube.com/watch?v=${videoId}`

    // Seed a ministry via admin BEFORE opening the modal
    const ministry = await createGroupForOrg(supabase, orgId, `Louvor E2E ${Date.now()}`)

    // Navigate to /library to trigger syncOrg so the ministry enters SQLite
    await browser.url('tauri://localhost/library')
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 15_000 }
    )

    // Open modal fresh
    await openAddSongModal()
    await fetchMetadataAndWaitStep2(url)

    // Click the ministry chip (button whose text contains the ministry name)
    const ministryChip = $(`button*=${ministry.name}`)
    await ministryChip.waitForExist({ timeout: 10_000, timeoutMsg: `Ministry chip "${ministry.name}" not found` })
    await ministryChip.click()

    // Submit
    await $('button=Baixar música').click()

    // Wait for song row
    const song = await findSongByYoutubeUrl(supabase, orgId, url, 60_000)
    if (!song) throw new Error(`Song for ${url} did not appear in DB`)

    // Verify song_groups row exists
    const deadline = Date.now() + 15_000
    let found = false
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('song_groups')
        .select('song_id')
        .eq('song_id', song.id)
        .eq('group_id', ministry.id)
      if (data && data.length === 1) { found = true; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!found) throw new Error(`song_groups row for (${song.id}, ${ministry.id}) did not appear`)
  })
})
