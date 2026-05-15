// apps/desktop/e2e/specs/07-org-danger-zone.spec.ts
//
// Journey #8 from CLAUDE.md § Testing strategy — Danger zone.
// Single test: delete an organization via the type-to-confirm modal.
// Exercises:
//   - delete_organization RPC (SECURITY DEFINER, owner-only)
//   - Cascade DELETE on all related rows (roles, members, songs, etc.)
//   - Type-to-confirm UX (button disabled until exact name typed)
//   - Post-delete redirect to /org
//
// We test delete (not transfer) because it's irreversible and exercises the
// cascade most fully. Transfer ownership would be a future journey.

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
} from '../helpers/app.js'
import { makeAdminClient } from '../helpers/supabase.js'

describe('Journey #8 — Danger zone (delete org)', () => {
  let orgId: string
  let orgName: string

  before(async () => {
    await cleanLocalSqlite()
    orgName = `Org pra Deletar ${Date.now()}`
    const seeded = await signupAndCreateOrg({ orgName })
    orgId = seeded.orgId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('owner deletes the org via type-to-confirm; cascade removes related rows', async () => {
    const supabase = makeAdminClient()

    // Navigate to the danger zone
    await browser.url('tauri://localhost/manage?tab=danger')

    // Click the red "Deletar…" trigger (note the trailing ellipsis)
    const triggerBtn = $('button=Deletar…')
    await triggerBtn.waitForExist({ timeout: 15_000 })
    await triggerBtn.click()

    // Modal opens with a type-to-confirm input.
    const confirmInput = $('input[placeholder="Nome da organização"]')
    await confirmInput.waitForExist({ timeout: 5_000 })

    // Submit button starts disabled. Type exact org name to enable it.
    const submitBtn = $('button=Deletar')
    expect(await submitBtn.isEnabled()).toBe(false)

    await setReactInputValue('input[placeholder="Nome da organização"]', orgName)
    await submitBtn.waitForEnabled({ timeout: 5_000, timeoutMsg: 'Delete button did not enable after typing org name' })
    await submitBtn.click()

    // Wait for redirect to /org (the modal navigates after delete RPC succeeds)
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'Did not redirect to /org after delete' }
    )

    // SQL: org row should be GONE (poll for absence over 5s)
    const deadline = Date.now() + 5_000
    let stillThere = true
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', orgId)
      if (!data || data.length === 0) { stillThere = false; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (stillThere) throw new Error(`Org ${orgId} was not deleted from Supabase`)

    // Cascade verification: roles for this org should also be gone.
    const { data: rolesData } = await supabase
      .from('roles')
      .select('id')
      .eq('org_id', orgId)
    expect(rolesData ?? []).toHaveLength(0)
  })
})
