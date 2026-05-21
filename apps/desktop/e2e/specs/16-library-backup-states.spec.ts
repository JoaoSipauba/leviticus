// apps/desktop/e2e/specs/16-library-backup-states.spec.ts
//
// Journey #12 — Biblioteca backup status (banner + filter chip).
//
// Seed: 3 músicas com backup_status uploaded/pending/failed, sem conta de
// cloud (Drive desconectado). Cobre a integração "songs seedadas → Library
// liga contagem/status no banner + chip + filtro":
//   T1 — banner "Sem backup configurado" (Drive desconectado + locais)
//   T2 — chip "Sem backup (1)" — conta só backup_status='failed'
//   T3 — clicar no chip filtra a biblioteca pras músicas com falha
//
// Os ramos do LibraryBackupBanner (incl. "N aguardando upload" com Drive
// conectado) têm cobertura unitária em LibraryBackupBanner.test.tsx; os
// estados de Drive conectado em E2E ficam na spec 15.

import { browser, $ } from '@wdio/globals'
import {
  makeAdminClient,
  createTestUser,
  createOrgWithOwner,
  createSongForOrg,
  E2E_FIXTURE_PASSWORD,
} from '../helpers/supabase.js'
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'

describe('Journey #12 — Biblioteca backup states', () => {
  let orgName: string

  before(async () => {
    const email = `lib-backup+${Date.now()}@leviticus.test`
    orgName = `Lib Igreja ${Date.now()}`
    await cleanLocalSqlite()

    const admin = makeAdminClient()
    const user = await createTestUser(admin, { email, password: E2E_FIXTURE_PASSWORD })
    const org = await createOrgWithOwner(admin, user.id, orgName)

    // Seed 3 músicas, uma de cada backup_status.
    const s1 = await createSongForOrg(admin, org.id, user.id, 'Música Uploaded', 'Artista A')
    const s2 = await createSongForOrg(admin, org.id, user.id, 'Música Pending', 'Artista B')
    const s3 = await createSongForOrg(admin, org.id, user.id, 'Música Failed', 'Artista C')
    await admin.from('songs').update({ backup_status: 'uploaded' }).eq('id', s1)
    await admin.from('songs').update({ backup_status: 'pending' }).eq('id', s2)
    await admin.from('songs').update({ backup_status: 'failed' }).eq('id', s3)

    // Login + seleção de org → Biblioteca.
    await browser.waitUntil(
      async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
      { timeout: 30_000 },
    )
    await $('input[type=email]').waitForExist({ timeout: 30_000 })
    await setReactInputValue('input#email', email)
    await setReactInputValue('input#password', E2E_FIXTURE_PASSWORD)
    await $('button[type=submit]').click()
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      { timeout: 30_000 },
    )
    const orgBtn = $(`button*=${orgName}`)
    await orgBtn.waitForExist({ timeout: 10_000 })
    await orgBtn.click()
    await browser.waitUntil(
      async () => /\/library/.test(await browser.getUrl()),
      { timeout: 90_000 },
    )
  })

  it('T1 — banner "Sem backup configurado" aparece (Drive desconectado)', async () => {
    // Sem conta de cloud seedada, o status resolve pra 'disconnected'. Com
    // músicas que não estão no Drive, o banner informativo aparece.
    const banner = $('div*=Sem backup configurado')
    await banner.waitForExist({
      timeout: 15_000,
      timeoutMsg: 'Banner "Sem backup configurado" não renderizou',
    })
  })

  it('T2 — chip "Sem backup (1)" aparece', async () => {
    // failedCount conta só backup_status='failed' (1 música). O chip some
    // quando a contagem é 0, então a presença já confirma a contagem.
    const chip = $('button*=Sem backup (1)')
    await chip.waitForExist({
      timeout: 10_000,
      timeoutMsg: 'Chip "Sem backup (1)" não renderizou',
    })
  })

  it('T3 — clicar no chip filtra só as músicas com falha', async () => {
    const chip = $('button*=Sem backup (1)')
    await chip.click()

    // Filtrado: só "Música Failed" aparece; uploaded e pending somem.
    await $('p*=Música Failed').waitForExist({ timeout: 5_000 })
    for (const hidden of ['Música Uploaded', 'Música Pending']) {
      const el = $(`p*=${hidden}`)
      await browser.waitUntil(
        async () => !(await el.isExisting()),
        { timeout: 5_000, timeoutMsg: `"${hidden}" ainda visível após filtrar` },
      )
    }
  })
})
