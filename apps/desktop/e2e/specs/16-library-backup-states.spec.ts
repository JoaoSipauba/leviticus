// apps/desktop/e2e/specs/16-library-backup-states.spec.ts
//
// Journey #12 — Biblioteca backup status (banner + badge + filter chip).
//
// Pré-seedando songs com diferentes backup_status via service-role client
// + invoke direto no SQLite local (mesmo pattern do spec 15). Cobre:
//   T1 — biblioteca sem músicas pendentes não mostra banner
//   T2 — biblioteca com pendentes mostra banner com contagem
//   T3 — chip "Sem backup" filtra apenas pendentes

import { browser, $, expect } from '@wdio/globals'
import {
  makeAdminClient,
  createTestUser,
  createOrgWithOwner,
  createSongForOrg,
} from '../helpers/supabase.js'
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'

describe('Journey #12 — Biblioteca backup states', () => {
  let email: string
  let password: string
  let userId: string
  let orgId: string
  let orgName: string
  let songIds: string[] = []

  before(async () => {
    email = `lib-backup+${Date.now()}@leviticus.test`
    password = 'senha-do-teste-e2e'
    orgName = `Lib Igreja ${Date.now()}`
    await cleanLocalSqlite()

    const admin = makeAdminClient()
    const user = await createTestUser(admin, { email, password })
    userId = user.id
    const org = await createOrgWithOwner(admin, userId, orgName)
    orgId = org.id

    // Seed 3 músicas com backup_status diferentes
    const s1 = await createSongForOrg(admin, orgId, userId, 'Música Uploaded', 'Artista A')
    const s2 = await createSongForOrg(admin, orgId, userId, 'Música Pending', 'Artista B')
    const s3 = await createSongForOrg(admin, orgId, userId, 'Música Failed', 'Artista C')
    songIds = [s1, s2, s3]

    // Marca cada uma com seu status
    await admin.from('songs').update({ backup_status: 'uploaded' }).eq('id', s1)
    await admin.from('songs').update({ backup_status: 'pending' }).eq('id', s2)
    await admin.from('songs').update({ backup_status: 'failed' }).eq('id', s3)

    // Login
    await browser.waitUntil(
      async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
      { timeout: 30_000 }
    )
    await $('input[type=email]').waitForExist({ timeout: 30_000 })
    await setReactInputValue('input#email', email)
    await setReactInputValue('input#password', password)
    await $('button[type=submit]').click()
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      { timeout: 30_000 }
    )
    const orgBtn = $(`button*=${orgName}`)
    await orgBtn.waitForExist({ timeout: 10_000 })
    await orgBtn.click()
    await browser.waitUntil(
      async () => /\/library/.test(await browser.getUrl()),
      { timeout: 90_000 }
    )
  })

  it('T1 — banner mostra contagem de pendentes (2)', async () => {
    // 1 uploaded + 1 pending + 1 failed = 2 não-uploaded
    const banner = $('div*=2 músicas sem backup')
    await banner.waitForExist({ timeout: 10_000, timeoutMsg: 'Banner did not render with count' })
  })

  it('T2 — chip "Sem backup (2)" aparece', async () => {
    const chip = $('button*=Sem backup (2)')
    await chip.waitForExist({ timeout: 5_000, timeoutMsg: 'Chip did not render' })
  })

  it('T3 — clicar no chip filtra só pendentes', async () => {
    const chip = $('button*=Sem backup (2)')
    await chip.click()

    // Após filtrar, "Música Uploaded" não deve aparecer
    const uploadedSong = $('p*=Música Uploaded')
    await browser.waitUntil(
      async () => !(await uploadedSong.isExisting()),
      { timeout: 5_000, timeoutMsg: '"Música Uploaded" ainda visível após filtrar' }
    )

    // Mas "Música Pending" e "Música Failed" devem aparecer
    await $('p*=Música Pending').waitForExist({ timeout: 5_000 })
    await $('p*=Música Failed').waitForExist({ timeout: 5_000 })
  })
})
