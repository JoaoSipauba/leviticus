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
//   - "Deletar" red button (right panel) → abre ConfirmModal

import { browser, $, expect } from '@wdio/globals'
import { cleanLocalSqlite, setReactInputValue, signupAndCreateOrg, confirmModalAction } from '../helpers/app.js'
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

    // Inline rename input (data-testid estável — o seletor genérico 'input'
    // é ambíguo e racy). Esperar montar antes de setar o valor.
    const renameInput = '[data-testid="role-rename-input"]'
    await $(renameInput).waitForExist({ timeout: 10_000, timeoutMsg: 'Rename input não montou' })
    const renamedTo = `Renamed T1 ${Date.now()}`
    await setReactInputValue(renameInput, renamedTo)

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
    await $(renameInput).waitForExist({ timeout: 10_000, timeoutMsg: 'Rename input não montou' })
    await setReactInputValue(renameInput, 'Dono')
    await salvarBtn.click()

    // OrgRoles renders error as plain <p> (no role="alert").
    // Wait for the text "Dono" to appear anywhere on the page.
    await browser.waitUntil(
      async () => {
        const body = await browser.execute(() => document.body.innerText)
        return (body as string).includes('"Dono" é reservado')
      },
      { timeout: 5_000, timeoutMsg: 'Expected "Dono é reservado" error on page' }
    )

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

    // Role is auto-selected. "Deletar" abre um ConfirmModal — confirmar nele.
    const deletarBtn = $('button*=Deletar')
    await deletarBtn.waitForExist({ timeout: 10_000 })
    await deletarBtn.click()
    await confirmModalAction()

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

    // Create role + assignment ALL via admin so both rows land in Supabase before
    // any sync runs. Avoids the createRoleViaUI multi-sync timing dance.
    const { data: roleRow, error: roleErr } = await supabase
      .from('roles')
      .insert({ org_id: orgId, name: roleName })
      .select('id').single()
    if (roleErr || !roleRow) throw new Error(`role insert failed: ${roleErr?.message}`)
    const roleId = (roleRow as { id: string }).id

    const { error: assignErr } = await supabase
      .from('user_role_assignments')
      .insert({ user_id: userId, org_id: orgId, role_id: roleId })
    if (assignErr) throw new Error(`user_role_assignments insert failed: ${assignErr.message}`)

    // Navigate to /library so reload boots there (App.tsx doesn't navigate
    // when session+org exist — it stays on current URL).
    await browser.url('tauri://localhost/library')
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 15_000 }
    )
    // Reload to retrigger App.tsx boot syncOrg → pulls role + assignment into SQLite
    await browser.execute(() => { window.location.reload() })
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'App did not boot to /library after reload' }
    )
    await new Promise((r) => setTimeout(r, 6_000))
    await browser.url('tauri://localhost/manage?tab=roles')

    // Role names in the left list are inside `<div>{r.name}</div>` (the row wrapper
    // is also a div with onClick — not a <button>). Exact-text selector targets
    // the innermost div uniquely; click bubbles up to the wrapper's onClick.
    const roleItem = $(`div=${roleName}`)
    await roleItem.waitForExist({ timeout: 15_000, timeoutMsg: `Role "${roleName}" not visible in list` })
    await roleItem.click()

    // Papel com membros: clicar "Deletar" mostra erro inline e NÃO abre o
    // ConfirmModal (guard em requestDeleteRole intercepta antes).
    const deletarBtn = $('button*=Deletar')
    await deletarBtn.waitForExist({ timeout: 10_000 })
    await deletarBtn.click()

    // OrgRoles renders error as plain <p> without role="alert".
    await browser.waitUntil(
      async () => {
        const body = await browser.execute(() => document.body.innerText)
        return (body as string).includes('ainda tem membros')
      },
      { timeout: 5_000, timeoutMsg: 'Expected "ainda tem membros" error on page' }
    )

    // Role row still exists
    const { data } = await supabase.from('roles').select('id').eq('id', roleId)
    expect((data ?? []).length).toBe(1)
  })
})
