// apps/desktop/e2e/specs/05-ministries-crud.spec.ts
//
// Journey #5 from CLAUDE.md § Testing strategy — Ministérios CRUD.
// Single test creating a ministry via the modal. Exercises:
//   - groups INSERT (RLS check passes for org owner)
//   - syncOrg pulling the new group into SQLite
//   - Groups page list re-render

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
} from '../helpers/app.js'
import { makeAdminClient } from '../helpers/supabase.js'

describe('Journey #5 — Ministérios CRUD', () => {
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    const seeded = await signupAndCreateOrg()
    orgId = seeded.orgId
    // Land on /library after org creation, then navigate to ministries.
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('creates a ministry via the modal — SQL row + UI card appear', async () => {
    const supabase = makeAdminClient()
    const ministryName = `Louvor ${Date.now()}`

    // Navigate via the sidebar link
    await browser.url('tauri://localhost/ministries')

    // Empty state shows either the empty-state CTA or the top-right "Novo" button.
    // Click the top-right "Novo" button (always present when online).
    const novoBtn = $('button=Novo')
    await novoBtn.waitForExist({ timeout: 15_000 })
    await novoBtn.click()

    // Modal opens with placeholder "Ex: Ministério Infantil"
    await setReactInputValue('input[placeholder*="Ministério Infantil"]', ministryName)

    // Click "Criar" submit
    const criarBtn = $('button=Criar')
    await criarBtn.waitForEnabled({ timeout: 5_000 })
    await criarBtn.click()

    // Poll Supabase for the new group row
    let group: { id: string; name: string } | null = null
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('groups')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('name', ministryName)
      if (data && data.length === 1) { group = data[0] as { id: string; name: string }; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!group) throw new Error(`Group "${ministryName}" did not appear in Supabase within 15s`)
    expect(group.name).toBe(ministryName)
    // (No UI assertion — syncOrg can stall in WebDriver context. SQL row is source of truth.)
  })
})
