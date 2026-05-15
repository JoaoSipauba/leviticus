// apps/desktop/e2e/specs/11-edit-song.spec.ts
//
// Journey C — EditSongModal flows.
// Previously had zero E2E coverage. Covers editing a song's title and deleting
// a song from the library entirely (including file removal).
//
// Delete uses an inline confirmation inside the SongCard's dropdown menu
// (not window.confirm), so no stubConfirm needed.
//
// T1 (edit title) runs before T2 (delete) because T2 removes the song — after
// T2 the library is empty and the session is done.

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

describe('Journey C — EditSongModal', () => {
  let orgId: string
  let songId: string
  let songAudioPath: string

  before(async () => {
    await cleanLocalSqlite()
    await installYtDlpMock()
    await setYtDlpMockMode('happy')
    const seeded = await signupAndCreateOrg({ emailPrefix: 'editsong' })
    orgId = seeded.orgId

    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )

    // Add one song via the UI so we have something to edit/delete
    const videoId = 'c1edit1234a'
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

    // Wait for step 4
    await $('button=Adicionar outra').waitForExist({
      timeout: 60_000,
      timeoutMsg: 'Song did not finish adding (step 4 never appeared)',
    })

    // Dismiss modal — press Escape or click close
    await browser.keys('Escape')

    // Resolve song ID for later assertions
    const supabase = makeAdminClient()
    const song = await findSongByYoutubeUrl(supabase, orgId, url, 15_000)
    if (!song) throw new Error(`Seeded song for ${url} did not appear in DB`)
    songId = song.id
    songAudioPath = path.join(appAudioDir(), `${songId}.m4a`)
  })

  // ─── Helper: open the "Mais ações" dropdown for the first SongCard ────────
  // The MoreHorizontal button has opacity-0 + pointer-events-none until hover.
  // We use JS execute to bypass the CSS pointer-events constraint.
  async function openActionsMenu() {
    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Mais ações"]')
      if (!btn) throw new Error('Mais ações button not found in DOM')
      btn.click()
    })
  }

  it('T1 — editar título: novo título persiste no banco', async () => {
    const supabase = makeAdminClient()
    const newTitle = `Título Editado E2E ${Date.now()}`

    // Open the dropdown
    await openActionsMenu()

    // Click "Editar" inside the dropdown menu.
    // button[role=menuitem] + text combined selectors are invalid in WebdriverIO;
    // use text-only selector — "Editar" is unique in the DOM when dropdown is open.
    const editItem = $('button=Editar')
    await editItem.waitForExist({ timeout: 5_000, timeoutMsg: '"Editar" menu item not found' })
    await editItem.click()

    // EditSongModal opens — title input auto-focused
    // Input is a ModalInput: no id, just a styled <input> inside the modal
    await $('input').waitForExist({ timeout: 5_000, timeoutMsg: 'EditSongModal did not render an input' })

    // Library has a search input (type="search") that appears first in DOM order.
    // EditSongModal's ModalInput has no type attr (defaults to text), so we
    // exclude type=search to pick the modal's title input as the first match.
    await setReactInputValue('input:not([type="search"])', newTitle)

    // Click "Salvar"
    const saveBtn = $('button=Salvar')
    await saveBtn.waitForExist({ timeout: 5_000 })
    await saveBtn.waitForEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // Wait for modal to close (Salvar button gone)
    await saveBtn.waitForExist({ timeout: 5_000, reverse: true })

    // Poll Supabase for updated title
    let updated = false
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('songs').select('title').eq('id', songId)
      if (data && data.length === 1 && (data[0] as { title: string }).title === newTitle) {
        updated = true; break
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!updated) throw new Error(`Song title did not update to "${newTitle}" within 15s`)
  })

  it('T2 — excluir música: row deletado do banco e arquivo removido do disco', async () => {
    const supabase = makeAdminClient()

    // Verify audio file exists before delete
    const statBefore = await fs.stat(songAudioPath).catch(() => null)
    expect(statBefore).not.toBeNull()

    // Open the dropdown again
    await openActionsMenu()

    // Click "Excluir da biblioteca" (shows in dropdown when NOT in playlist context).
    // Text-only selector — unique in the DOM when the dropdown is open.
    const deleteLibraryBtn = $('button=Excluir da biblioteca')
    await deleteLibraryBtn.waitForExist({ timeout: 5_000, timeoutMsg: '"Excluir da biblioteca" not found' })
    await deleteLibraryBtn.click()

    // Inline confirm appears — click the red "Excluir" button
    const confirmBtn = $('button=Excluir')
    await confirmBtn.waitForExist({ timeout: 5_000, timeoutMsg: 'Inline confirm Excluir button not found' })
    await confirmBtn.click()

    // Poll for ABSENCE of the song row
    let deleted = false
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase.from('songs').select('id').eq('id', songId)
      if (!data || data.length === 0) { deleted = true; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!deleted) throw new Error(`Song row ${songId} was not deleted within 15s`)

    // Verify audio file removed from disk
    await browser.waitUntil(
      async () => {
        const stat = await fs.stat(songAudioPath).catch(() => null)
        return stat === null
      },
      { timeout: 10_000, timeoutMsg: `Audio file ${songAudioPath} was not deleted` }
    )
  })
})
