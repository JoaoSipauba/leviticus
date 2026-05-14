// apps/desktop/e2e/specs/13-transfer-ownership.spec.ts
//
// Journey E — Transfer ownership.
// Covers the full UI flow: danger-zone trigger → member picker (step 1) →
// confirm (step 2) → RPC fires → SQL verifies the Dono role swap.
//
// User A is the logged-in owner (via signupAndCreateOrg). User B is seeded
// entirely via admin client — no UI signup needed.
//
// TransferOwnershipModal reads candidates from local SQLite
// (organization_members WHERE org_id = ? AND user_id <> me). We trigger
// a navigation to /library before opening the modal so syncOrg pulls
// user B's membership into the local DB.

import { browser, $, expect } from '@wdio/globals'
import { cleanLocalSqlite, signupAndCreateOrg } from '../helpers/app.js'
import { makeAdminClient, createTestUser } from '../helpers/supabase.js'

describe('Journey E — Transfer ownership', () => {
  let orgId: string
  let userAId: string
  let userBId: string
  let userBEmail: string

  before(async () => {
    await cleanLocalSqlite()
    const admin = makeAdminClient()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'transfer-owner' })
    orgId = seeded.orgId
    userAId = seeded.userId

    // Seed user B via admin (no UI signup)
    const userB = await createTestUser(admin, {
      email: `transfer-target+${Date.now()}@leviticus.test`,
    })
    userBId = userB.id
    userBEmail = userB.email

    // Add user B to the org so the modal's candidate list includes them
    const { error: memberErr } = await admin
      .from('organization_members')
      .insert({ user_id: userBId, org_id: orgId })
    if (memberErr) throw new Error(`Failed to add user B to org: ${memberErr.message}`)

    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library after org creation' }
    )

    // Navigate to /library (re-mount triggers syncOrg) so user B's membership
    // is pulled into the local SQLite before the modal tries to list candidates.
    await browser.url('tauri://localhost/library')
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 15_000 }
    )
  })

  it('transfere propriedade para outro membro; SQL reflete a troca do papel Dono', async () => {
    const admin = makeAdminClient()

    // Navigate to the danger zone tab
    await browser.url('tauri://localhost/manage?tab=danger')

    // Trigger the transfer modal
    const transferirBtn = $('button*=Transferir…')
    await transferirBtn.waitForExist({ timeout: 15_000, timeoutMsg: '"Transferir…" button not found' })
    await transferirBtn.click()

    // Modal opens. Candidate list is loaded from SQLite + user_profiles.
    // User B appears as a button containing their email text.
    const userBBtn = $(`button*=${userBEmail}`)
    await userBBtn.waitForExist({ timeout: 15_000, timeoutMsg: `User B (${userBEmail}) not found in picker` })
    await userBBtn.click()

    // "Continuar" is enabled after a pick
    const continuarBtn = $('button=Continuar')
    await continuarBtn.waitForEnabled({ timeout: 5_000 })
    await continuarBtn.click()

    // Step 2: confirm
    const confirmarBtn = $('button=Transferir')
    await confirmarBtn.waitForExist({ timeout: 5_000, timeoutMsg: '"Transferir" confirm button not found' })
    await confirmarBtn.click()

    // Poll for ownership change
    let success = false
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const { data: org } = await admin
        .from('organizations').select('owner_id').eq('id', orgId).single()
      if (org && (org as { owner_id: string }).owner_id === userBId) { success = true; break }
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!success) throw new Error('Ownership did not transfer to user B within 20s')

    // Verify Dono role swap
    const { data: donoRole } = await admin
      .from('roles').select('id').eq('org_id', orgId).eq('name', 'Dono').single()
    expect(donoRole).toBeTruthy()
    const donoRoleId = (donoRole as { id: string }).id

    // User A no longer has Dono
    const { data: aDono } = await admin
      .from('user_role_assignments')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role_id', donoRoleId)
      .eq('user_id', userAId)
    expect((aDono ?? []).length).toBe(0)

    // User B now has Dono
    const { data: bDono } = await admin
      .from('user_role_assignments')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role_id', donoRoleId)
      .eq('user_id', userBId)
    expect((bDono ?? []).length).toBe(1)
  })
})
