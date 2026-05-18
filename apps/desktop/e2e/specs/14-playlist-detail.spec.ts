// apps/desktop/e2e/specs/14-playlist-detail.spec.ts
//
// Journey F — PlaylistDetail flows.
// Covers: adding an "avulso" section, adding a song to that section.
// T3 (drag-and-drop reorder) is deferred — WebDriver pointer actions against
// React DnD libraries are notoriously flaky. When stable, add it as a separate
// journey using the `move_playlist_song` RPC + SQL assertion fallback.
//
// Setup: songs and playlists are seeded via admin SQL so each test focuses on
// a single UI action rather than re-running full creation flows.
//
// Sync note: songs seeded via admin must reach the local SQLite before the
// AddSongToPlaylistModal can list them. A navigation to /services/:id (which
// mounts PlaylistDetail → syncOrg) handles this.

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
} from '../helpers/app.js'
import {
  makeAdminClient,
  createPlaylistForOrg,
  createSongForOrg,
} from '../helpers/supabase.js'

describe('Journey F — PlaylistDetail flows', () => {
  let orgId: string
  let userId: string
  let song1Id: string
  let song2Id: string

  before(async () => {
    await cleanLocalSqlite()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'playlist-f' })
    orgId = seeded.orgId
    userId = seeded.userId

    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )

    // Pre-seed two songs via admin so tests can attach them to sections
    const admin = makeAdminClient()
    song1Id = await createSongForOrg(admin, orgId, userId, 'Song One F')
    song2Id = await createSongForOrg(admin, orgId, userId, 'Song Two F')
  })

  it('T1 — adicionar seção avulso: header da seção aparece na UI', async () => {
    const admin = makeAdminClient()

    // Create an empty playlist via admin
    const playlist = await createPlaylistForOrg(
      admin, orgId, userId, `Culto F T1 ${Date.now()}`, new Date()
    )

    // Reload at /library to retrigger App.tsx boot syncOrg — only this pulls the
    // admin-created playlist into SQLite (navigation alone does NOT resync).
    await browser.url('tauri://localhost/library')
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 15_000 }
    )
    await browser.execute(() => { window.location.reload() })
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'App did not boot to /library after reload (T1)' }
    )
    // 8s pra dar tempo de syncOrg + monitores de boot resolverem antes
    // de navegar pra detail. Sem isso, PlaylistDetail redireciona pra
    // /services porque a playlist ainda não está no SQLite.
    await new Promise((r) => setTimeout(r, 8_000))

    // Now navigate to the detail page (playlist row is in SQLite)
    await browser.url(`tauri://localhost/services/${playlist.id}`)
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes(`/services/${playlist.id}`),
      { timeout: 15_000, timeoutMsg: 'Did not land on PlaylistDetail' }
    )
    // Confere que NÃO redirecionou pra /services list (PlaylistDetail
    // navega pra /services se a playlist não está no SQLite).
    await browser.waitUntil(
      async () => !/\/services$/.test(await browser.getUrl()),
      { timeout: 5_000, timeoutMsg: 'PlaylistDetail redirected back to /services (T1)' }
    )

    // Click "Adicionar seção"
    const addSectionBtn = $('button*=Adicionar seção')
    await addSectionBtn.waitForExist({ timeout: 15_000, timeoutMsg: '"Adicionar seção" button not found' })
    await addSectionBtn.click()

    // AddSectionModal opens. Switch to "Avulso" tab (modal defaults to "Ministério").
    const avulsoTab = $('button=Avulso')
    await avulsoTab.waitForExist({ timeout: 5_000 })
    await avulsoTab.click()

    // Fill the section label — wait for Avulso tab content to render first
    const sectionLabel = `Test Section ${Date.now()}`
    await $('input[placeholder*="Cantora Maria"]').waitForExist({ timeout: 5_000, timeoutMsg: 'Avulso label input did not appear' })
    await setReactInputValue('input[placeholder*="Cantora Maria"]', sectionLabel)

    // Submit
    const criarBtn = $('button=Criar seção')
    await criarBtn.waitForEnabled({ timeout: 5_000 })
    await criarBtn.click()

    // Modal closes on successful onConfirm — assert closure first
    await criarBtn.waitForExist({ timeout: 5_000, reverse: true, timeoutMsg: 'AddSectionModal did not close after Criar seção click' })

    // Section header appears in the playlist detail DOM.
    // AddSectionModal creates a UI-only draft section (not yet persisted to DB
    // until first song is added), so we assert the DOM, not the DB.
    // SectionRow renders the label with CSS `text-transform: uppercase`, so
    // innerText returns the uppercase form — compare case-insensitively.
    const expectedLabel = sectionLabel.toLowerCase()
    await browser.waitUntil(
      async () => {
        const bodyText = await browser.execute(() => document.body.innerText)
        return (bodyText as string).toLowerCase().includes(expectedLabel)
      },
      { timeout: 10_000, timeoutMsg: `Section header "${sectionLabel}" did not appear in DOM` }
    )
  })

  it('T2 — adicionar música à seção: playlist_songs row persiste no banco', async () => {
    const admin = makeAdminClient()

    // Create a fresh playlist for T2
    const playlist = await createPlaylistForOrg(
      admin, orgId, userId, `Culto F T2 ${Date.now()}`, new Date()
    )

    // Reload at /library to retrigger syncOrg (pulls new playlist into SQLite).
    // PlaylistDetail redirects to /services if the row isn't in SQLite, so we
    // navigate to detail until URL sticks (waitUntil cobre delay variável).
    // Mesma sequência do T1 (sem loop com sleep fixo): reload em /library
    // pra puxar a playlist criada via admin, depois navega pro detail.
    // Sleep fixo curto (1.5s) era flaky em dev builds debug.
    await browser.url('tauri://localhost/library')
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 15_000 }
    )
    await browser.execute(() => { window.location.reload() })
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'App did not boot to /library after reload (T2)' }
    )
    // Espera mais (~8s) pra syncOrg do boot puxar a playlist criada via
    // admin pro SQLite. Sem isso, PlaylistDetail navega de volta pra
    // /services porque a row não existe local. Tempos novos somam com
    // os monitors de rede/sync que entraram em #16/#31.
    await new Promise((r) => setTimeout(r, 8_000))

    await browser.url(`tauri://localhost/services/${playlist.id}`)
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes(`/services/${playlist.id}`),
      { timeout: 15_000, timeoutMsg: 'Did not land on PlaylistDetail (T2)' }
    )
    // Garante que NÃO voltou pra /services list. Se PlaylistDetail
    // renderizou, o botão "Adicionar seção" aparece em <15s.
    await browser.waitUntil(
      async () => !/\/services$/.test(await browser.getUrl()),
      { timeout: 5_000, timeoutMsg: 'PlaylistDetail redirected back to /services (playlist not synced yet)' }
    )

    // ─── Step 1: Create a section ──────────────────────────────────────────
    const addSectionBtn = $('button*=Adicionar seção')
    await addSectionBtn.waitForExist({ timeout: 15_000 })
    await addSectionBtn.click()

    const avulsoTab = $('button=Avulso')
    await avulsoTab.waitForExist({ timeout: 5_000 })
    await avulsoTab.click()

    const sectionLabel = `Section T2 ${Date.now()}`
    await $('input[placeholder*="Cantora Maria"]').waitForExist({ timeout: 5_000, timeoutMsg: 'Avulso label input did not appear (T2)' })
    await setReactInputValue('input[placeholder*="Cantora Maria"]', sectionLabel)
    const criarBtnT2 = $('button=Criar seção')
    await criarBtnT2.waitForEnabled({ timeout: 5_000 })
    await criarBtnT2.click()
    await criarBtnT2.waitForExist({ timeout: 5_000, reverse: true, timeoutMsg: 'AddSectionModal did not close (T2)' })

    // Wait for section to appear in DOM (label rendered uppercase via CSS)
    const expectedLabelT2 = sectionLabel.toLowerCase()
    await browser.waitUntil(
      async () => {
        const bodyText = await browser.execute(() => document.body.innerText)
        return (bodyText as string).toLowerCase().includes(expectedLabelT2)
      },
      { timeout: 10_000 }
    )

    // ─── Step 2: Add a song to the section ────────────────────────────────
    // "+ Adicionar música" button is inside the section's SectionRow
    const addMusicBtn = $('button*=Adicionar música')
    await addMusicBtn.waitForExist({ timeout: 10_000, timeoutMsg: '"Adicionar música" button not found' })
    await addMusicBtn.click()

    // AddSongToPlaylistModal opens with org's songs
    // Song One F was seeded via admin and pulled by syncOrg on navigation
    const song1Btn = $('button*=Song One F')
    await song1Btn.waitForExist({ timeout: 10_000, timeoutMsg: '"Song One F" not found in modal' })
    await song1Btn.click()

    // Song is added immediately (RPC call in handleAdd). Modal stays open for more.
    // Close modal
    const concluido = $('button=Concluído')
    await concluido.waitForExist({ timeout: 5_000 })
    await concluido.click()

    // Poll for playlist_songs row. The table has a composite PK (playlist_id,
    // song_id) — no `id` column — so select a real column instead.
    let found = false
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const { data } = await admin
        .from('playlist_songs')
        .select('song_id, position')
        .eq('playlist_id', playlist.id)
        .eq('song_id', song1Id)
      if (data && data.length >= 1) { found = true; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!found) throw new Error(`playlist_songs row for song1 in playlist ${playlist.id} did not appear`)
    expect(found).toBe(true)
  })

  it.skip('T3 — reordenar músicas via drag-and-drop (diferido)', async () => {
    // Deferred: WebDriver pointer actions against React DnD are notoriously flaky.
    // When implementing, seed a playlist with 2 songs in one section via admin,
    // use browser.action('pointer').move().down().move().up() to drag song2 above
    // song1, then poll playlist_songs for the position swap.
    // If still flaky, replace with a direct RPC call + SQL assertion.
  })
})
