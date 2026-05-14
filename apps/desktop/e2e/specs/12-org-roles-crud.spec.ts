// apps/desktop/e2e/specs/12-org-roles-crud.spec.ts
//
// Journey D — Org Roles full CRUD.
// Journey #7 covered create + toggle permissions. This spec covers:
//   T1 — rename role + reserved-name guard ("Dono" is blocked)
//   T2 — delete role without members (succeeds)
//   T3 — delete role WITH members → blocked with friendly error
//
// Selectors confirmed against OrgRoles.tsx:
//   - "Novo papel" button (left panel)
//   - inline rename input (autofocus, right panel)
//   - "salvar" blue text button (right panel, lowercase per source)
//   - "Renomear" button (right panel)
//   - "Deletar" red button (right panel)
//   - window.confirm is used for delete → stubConfirm required

import { browser, $, expect } from '@wdio/globals'
import { cleanLocalSqlite, setReactInputValue, signupAndCreateOrg, stubConfirm } from '../helpers/app.js'
import { makeAdminClient } from '../helpers/supabase.js'

describe('Journey D — Org Roles CRUD', () => {
  let orgId: string
  let userId: string

  before(async () => {
    await cleanLocalSqlite()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'orgroles-d' })
    orgId = seeded.orgId
    userId = seeded.userId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  // ─── Helper: create a role via UI and return its Supabase id ──────────────
  async function createRoleViaUI(name: string): Promise<string> {
    const supabase = makeAdminClient()

    await browser.url('tauri://localhost/manage?tab=roles')
    const novoBtn = $('button*=Novo papel')
    await novoBtn.waitForExist({ timeout: 15_000 })
    await novoBtn.click()

    await setReactInputValue('input[placeholder="Nome do papel"]', name)
    const criarBtn = $('button=Criar')
    await criarBtn.waitForEnabled({ timeout: 5_000 })
    await criarBtn.click()

    // Poll Supabase for the new role
    let roleId: string | null = null
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('roles').select('id').eq('org_id', orgId).eq('name', name)
      if (data && data.length === 1) { roleId = (data[0] as { id: string }).id; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!roleId) throw new Error(`Role "${name}" did not appear in DB within 15s`)
    return roleId
  }

  it('T1 — renomear papel: novo nome persiste; guard bloqueia "Dono"', async () => {
    const supabase = makeAdminClient()
    const roleName = `Test Role T1 ${Date.now()}`
    const roleId = await createRoleViaUI(roleName)

    // After createRole, the role is auto-selected. Click "Renomear".
    const renomearBtn = $('button*=Renomear')
    await renomearBtn.waitForExist({ timeout: 10_000 })
    await renomearBtn.click()

    // Inline rename input appears (autofocus). It is the only active input.
    const renamedTo = `Renamed T1 ${Date.now()}`
    await setReactInputValue('input', renamedTo)

    // Click "salvar" (lowercase blue text button next to the input)
    const salvarBtn = $('button=salvar')
    await salvarBtn.waitForExist({ timeout: 5_000 })
    await salvarBtn.click()

    // Poll SQL for updated name
    let renamed = false
    let deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('roles').select('name').eq('id', roleId)
      if (data && data.length === 1 && (data[0] as { name: string }).name === renamedTo) {
        renamed = true; break
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!renamed) throw new Error(`Role was not renamed to "${renamedTo}" within 15s`)

    // ─── Reserved-name guard: try renaming to "Dono" ─────────────────────
    await renomearBtn.click()
    await setReactInputValue('input', 'Dono')
    await salvarBtn.click()

    // setError('"Dono" é reservado.') shows as <p role="alert"> in the panel
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 5_000, timeoutMsg: 'Expected "Dono é reservado" error' })
    expect(await alert.getText()).toContain('Dono')

    // Role name unchanged
    const { data: row } = await supabase.from('roles').select('name').eq('id', roleId).single()
    expect((row as { name: string } | null)?.name).toBe(renamedTo)

    // Press Escape to exit rename mode
    await browser.keys('Escape')
  })

  it('T2 — deletar papel sem membros: row removido do banco', async () => {
    const supabase = makeAdminClient()
    const roleName = `Test Role T2 ${Date.now()}`
    const roleId = await createRoleViaUI(roleName)

    // Role is auto-selected. Stub confirm before clicking Deletar.
    await stubConfirm(true)

    const deletarBtn = $('button*=Deletar')
    await deletarBtn.waitForExist({ timeout: 10_000 })
    await deletarBtn.click()

    // Poll for ABSENCE
    let deleted = false
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const { data } = await supabase.from('roles').select('id').eq('id', roleId)
      if (!data || data.length === 0) { deleted = true; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!deleted) throw new Error(`Role ${roleId} was not deleted within 15s`)

    // Cascade: role_permissions also gone
    const { data: perms } = await supabase.from('role_permissions').select('id').eq('role_id', roleId)
    expect((perms ?? []).length).toBe(0)
  })

  it('T3 — deletar papel com membros: guard bloqueia, row permanece', async () => {
    const supabase = makeAdminClient()
    const roleName = `Test Role T3 ${Date.now()}`
    const roleId = await createRoleViaUI(roleName)

    // Assign role to owner via admin (bypasses RLS)
    const { error: assignErr } = await supabase
      .from('user_role_assignments')
      .insert({ user_id: userId, org_id: orgId, role_id: roleId })
    if (assignErr) throw new Error(`user_role_assignments insert failed: ${assignErr.message}`)

    // Force re-mount of OrgRoles so memberCount reloads from SQLite via syncOrg
    await browser.url('tauri://localhost/library')
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 15_000 }
    )
    await browser.url('tauri://localhost/manage?tab=roles')

    // Find and select the T3 role in the left list
    const roleItem = $(`span*=${roleName}`)
    await roleItem.waitForExist({ timeout: 15_000, timeoutMsg: `Role "${roleName}" not visible in list` })
    await roleItem.click()

    // Stub confirm and attempt delete
    await stubConfirm(true)
    const deletarBtn = $('button*=Deletar')
    await deletarBtn.waitForExist({ timeout: 10_000 })
    await deletarBtn.click()

    // Expect error: "Esse papel ainda tem membros"
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 5_000, timeoutMsg: 'Expected "ainda tem membros" error' })
    expect(await alert.getText()).toContain('ainda tem membros')

    // Role row still exists
    const { data } = await supabase.from('roles').select('id').eq('id', roleId)
    expect((data ?? []).length).toBe(1)
  })
})
