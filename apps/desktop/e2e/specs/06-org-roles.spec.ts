// apps/desktop/e2e/specs/06-org-roles.spec.ts
//
// Journey #7 from CLAUDE.md § Testing strategy — Org papéis (roles).
// Creates a new role and toggles a permission on it. Exercises:
//   - roles INSERT (RLS check: requires manage_roles)
//   - role_permissions INSERT via the toggle (auto-save debounced 400ms)

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
} from '../helpers/app.js'
import { makeAdminClient } from '../helpers/supabase.js'

describe('Journey #7 — Org papéis', () => {
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

  it('creates a custom role and toggles a permission — SQL confirms both writes', async () => {
    const supabase = makeAdminClient()
    const roleName = `Líder E2E ${Date.now()}`

    // Navigate to the Papéis sub-tab
    await browser.url('tauri://localhost/manage?tab=roles')
    const novoBtn = $('button*=Novo papel')
    await novoBtn.waitForExist({ timeout: 15_000 })
    await novoBtn.click()

    // Inline create form opens with placeholder "Nome do papel"
    await setReactInputValue('input[placeholder="Nome do papel"]', roleName)
    const criarBtn = $('button=Criar')
    await criarBtn.waitForEnabled({ timeout: 5_000 })
    await criarBtn.click()

    // Poll Supabase for the new role row
    let role: { id: string; name: string } | null = null
    let deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('roles')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('name', roleName)
      if (data && data.length === 1) { role = data[0] as { id: string; name: string }; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!role) throw new Error(`Role "${roleName}" did not appear in Supabase within 15s`)
    expect(role.name).toBe(roleName)

    // After createRole(), the new role is auto-selected. The detail panel
    // renders permission toggles — all initially false (aria-pressed=false).
    // `$('button[aria-pressed=false]')` matches the FIRST in DOM order, which
    // is 'add_songs' per OrgRoles.PERM_GROUPS' first group ('Músicas').
    const firstToggle = $('button[aria-pressed=false]')
    await firstToggle.waitForExist({ timeout: 10_000, timeoutMsg: 'No un-pressed permission toggle found' })
    await firstToggle.click()

    // Saves are debounced 400ms; poll SQL for the role_permissions row.
    let permRow: { permission: string } | null = null
    deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('role_permissions')
        .select('permission')
        .eq('role_id', role.id)
      if (data && data.length === 1) { permRow = data[0] as { permission: string }; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!permRow) throw new Error(`role_permissions row for ${roleName} did not appear within 10s`)
    // First toggle = 'add_songs' per OrgRoles.PERM_GROUPS order.
    expect(permRow.permission).toBe('add_songs')
  })
})
