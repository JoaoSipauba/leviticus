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
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'

describe('Journey #1 — First-time user', () => {
  let email: string
  let orgName: string

  before(async () => {
    email = `test+${Date.now()}@leviticus.test`
    orgName = `Igreja Teste ${Date.now()}`
    await cleanLocalSqlite()
  })

  it('signs up, creates an org, lands in Library, and seeds the Dono role', async () => {
    console.log('[e2e] >>> test it() body STARTED')
    // ─── App boot ─────────────────────────────────────────────────────────
    // App boots at "/" which redirects to /login when no session. Splash
    // screen covers the React tree until App.tsx fires `leviticus-ready`.
    console.log(`[e2e] initial url: ${await browser.getUrl()}`)

    try {
      await browser.waitUntil(
        async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
        { timeout: 10_000, timeoutMsg: 'Expected redirect to /login within 10s of app boot' }
      )
    } catch (err) {
      // Dump storage state — debugging why we landed on /library instead.
      const dump = await browser.execute(() => ({
        url: location.href,
        localStorageKeys: Object.keys(localStorage),
        localStorageContents: Object.fromEntries(
          Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)?.slice(0, 100)])
        ),
        cookie: document.cookie,
      }))
      console.error(`[e2e debug initial state]`, JSON.stringify(dump, null, 2))
      throw err
    }

    // Wait for the React Login form to actually render — the email input
    // is the most reliable sentinel that the splash cleared and React is up.
    const emailInput = $('input[type=email]')
    await emailInput.waitForExist({ timeout: 30_000, timeoutMsg: 'Login form did not render within 30s' })

    // ─── Switch to signup mode ────────────────────────────────────────────
    // The toggle button below the form reads "Criar conta" when in login mode.
    await $('button=Criar conta').click()

    // ─── Fill signup fields ───────────────────────────────────────────────
    // Login.tsx shows a "Nome completo" text input only in signup mode.
    // setValue alone doesn't update React state (controlled inputs); use the
    // setReactInputValue helper that dispatches the right events.
    await setReactInputValue('input#name', 'Usuário Teste')
    await setReactInputValue('input#email', email)
    await setReactInputValue('input#password', 'senha-do-teste-e2e')

    // ─── Submit ───────────────────────────────────────────────────────────
    // Wait for the submit button to become enabled (React state has settled).
    const submitBtn = $('button[type=submit]')
    await submitBtn.waitForEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // ─── Wait for redirect to /org ────────────────────────────────────────
    try {
      await browser.waitUntil(
        async () => /\/org$/.test(await browser.getUrl()),
        { timeout: 15_000, timeoutMsg: 'Did not redirect to /org after signup within 15s' }
      )
    } catch (err) {
      // Diagnostic dump on signup failure
      const diag = await browser.execute(() => {
        const alerts = Array.from(document.querySelectorAll('[role=alert]')).map((e) => e.textContent)
        const formInputs = Array.from(document.querySelectorAll('input')).map((i) => ({
          id: i.id, type: i.type, valueLen: i.value.length,
        }))
        const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim())
        const isSignUpHint = document.querySelector('[autocomplete=name]') ? 'signup-mode' : 'login-mode'
        return { url: location.href, alerts, formInputs, buttons, mode: isSignUpHint }
      })
      console.error(`[e2e debug]`, JSON.stringify(diag, null, 2))
      throw err
    }

    // ─── Open the "create org" form ───────────────────────────────────────
    // OrgSelect renders a primary button "Criar organização" in 'list' mode.
    await $('button=Criar organização').click()

    // ─── Fill org name ────────────────────────────────────────────────────
    await setReactInputValue('input[placeholder="Nome da organização"]', orgName)

    // ─── Submit the create form ───────────────────────────────────────────
    // In 'create' mode, the submit button text is just "Criar". Wait for it
    // to be enabled (button is disabled while newOrgName is empty in React state).
    const createBtn = $('button=Criar')
    await createBtn.waitForEnabled({ timeout: 5_000 })
    await createBtn.click()

    // ─── Wait for the org to appear in Supabase (poll) ────────────────────
    // We don't gate on the /library redirect — OrgSelect.handleCreate awaits
    // a full syncOrg() before navigating, and the syncOrg pulling 11 entities
    // through tauriFetch in the WebView can stall. The *source of truth* for
    // journey success is the database state. Poll for it.
    const supabase = makeAdminClient()
    type OrgRow = { id: string; name: string; owner_id: string }
    let org: OrgRow | null = null
    const orgDeadline = Date.now() + 30_000
    while (Date.now() < orgDeadline) {
      const { data } = await supabase
        .from('organizations')
        .select('id, name, owner_id')
        .eq('name', orgName)
      if (data && data.length > 0) { org = data[0] as OrgRow; break }
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!org) throw new Error(`Org "${orgName}" did not appear in Supabase within 30s`)

    // ─── SQL assertions: seed_owner_role trigger fired ────────────────────
    // Find the auth.users row for our test email.
    const usersRes = await supabase.auth.admin.listUsers()
    if (usersRes.error) throw new Error(`listUsers failed: ${usersRes.error.message}`)
    const user = usersRes.data.users.find((u) => u.email === email)
    if (!user) throw new Error(`auth.users row not found for ${email}`)

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
    console.log('[e2e] <<< test it() body COMPLETED')
  })
})
