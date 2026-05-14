// apps/desktop/e2e/specs/01-first-time-user.spec.ts
//
// Critical journey #1: signup → create first org → seed_owner_role trigger → empty Library.
//
// Selector notes (verified against Login.tsx / OrgSelect.tsx):
//   - Login mode toggle link: text "Criar conta" (not "Cadastrar")
//   - Signup submit button:   text "Criar conta" (type=submit)
//   - Signup has a "Nome completo" name field (required by Login.tsx)
//   - OrgSelect "create" trigger button: text "Criar organização"
//   - OrgSelect create-mode submit:      text "Criar"
//   - OrgSelect org-name input:          placeholder "Nome da organização"

import { makeAdminClient } from '../helpers/supabase.js'
import { cleanLocalSqlite } from '../helpers/app.js'

describe('Journey #1 — First-time user', () => {
  let email: string
  let orgName: string

  before(async () => {
    email = `test+${Date.now()}@leviticus.test`
    orgName = `Igreja Teste ${Date.now()}`
    await cleanLocalSqlite()
  })

  it('signs up, creates an org, lands in Library, and seeds the Dono role', async () => {
    // ─── Login screen renders ─────────────────────────────────────────────
    await expect(browser).toHaveUrl(/\/login$/)

    // ─── Switch to signup mode ────────────────────────────────────────────
    // The toggle button below the form reads "Criar conta" when in login mode.
    await $('button=Criar conta').click()

    // ─── Fill signup fields ───────────────────────────────────────────────
    // Login.tsx shows a "Nome completo" text input only in signup mode.
    await $('input[type=text]').setValue('Usuário Teste')
    await $('input[type=email]').setValue(email)
    await $('input[type=password]').setValue('senha-do-teste-e2e')

    // ─── Submit ───────────────────────────────────────────────────────────
    // In signup mode, the submit button reads "Criar conta".
    await $('button[type=submit]').click()

    // ─── Wait for redirect to /org ────────────────────────────────────────
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      {
        timeout: 15_000,
        timeoutMsg: 'Did not redirect to /org after signup within 15s',
      }
    )

    // ─── Open the "create org" form ───────────────────────────────────────
    // OrgSelect renders a primary button "Criar organização" in 'list' mode.
    await $('button=Criar organização').click()

    // ─── Fill org name ────────────────────────────────────────────────────
    await $('input[placeholder="Nome da organização"]').setValue(orgName)

    // ─── Submit the create form ───────────────────────────────────────────
    // In 'create' mode, the submit button text is just "Criar".
    await $('button=Criar').click()

    // ─── Wait for redirect to /library ────────────────────────────────────
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      {
        timeout: 15_000,
        timeoutMsg: 'Did not redirect to /library after creating org within 15s',
      }
    )

    // ─── UI assertion: library screen is shown ────────────────────────────
    // We only assert the screen exists; the SQL assertions below verify correctness.
    await expect($('h2,h1')).toBeExisting()

    // ─── SQL assertions: seed_owner_role trigger fired ────────────────────
    const supabase = makeAdminClient()

    // Find the auth.users row for our test email.
    const usersRes = await supabase.auth.admin.listUsers()
    if (usersRes.error) throw new Error(`listUsers failed: ${usersRes.error.message}`)
    const user = usersRes.data.users.find((u) => u.email === email)
    if (!user) throw new Error(`auth.users row not found for ${email}`)

    // Find the org row by name (we generated a unique name).
    const orgsRes = await supabase
      .from('organizations')
      .select('id, name, owner_id')
      .eq('name', orgName)
    if (orgsRes.error) throw new Error(`organizations select failed: ${orgsRes.error.message}`)
    expect(orgsRes.data ?? []).toHaveLength(1)
    const org = orgsRes.data![0]
    expect(org.owner_id).toBe(user.id)

    // Verify the seeded "Dono" role exists for this org.
    const rolesRes = await supabase
      .from('roles')
      .select('id, name')
      .eq('org_id', org.id)
      .eq('name', 'Dono')
    if (rolesRes.error) throw new Error(`roles select failed: ${rolesRes.error.message}`)
    expect(rolesRes.data ?? []).toHaveLength(1)
    const donoRoleId = rolesRes.data![0].id

    // Verify the assignment connecting our user → Dono role for this org.
    const assignmentsRes = await supabase
      .from('user_role_assignments')
      .select('user_id, org_id, role_id, group_id')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .is('group_id', null)
    if (assignmentsRes.error) {
      throw new Error(`user_role_assignments select failed: ${assignmentsRes.error.message}`)
    }
    expect(assignmentsRes.data ?? []).toHaveLength(1)
    expect(assignmentsRes.data![0].role_id).toBe(donoRoleId)

    // Verify Dono has all 7 permissions.
    const permsRes = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role_id', donoRoleId)
    if (permsRes.error) throw new Error(`role_permissions select failed: ${permsRes.error.message}`)
    const perms = (permsRes.data ?? []).map((p) => p.permission).sort()
    expect(perms).toEqual([
      'add_songs',
      'add_songs_to_playlist',
      'manage_groups',
      'manage_members',
      'manage_playlists',
      'manage_roles',
      'manage_songs',
    ])
  })
})
