// apps/desktop/e2e/specs/09-login-flows.spec.ts
//
// Journey A — Login flows.
// Covers the returning-user login path and its key error states.
// The harness normally only exercises signup — this spec fills the gap.
//
// Test ordering: error cases first (app stays at /login), successful login last
// (which redirects to /org and mutates session state).

import { browser, $, expect } from '@wdio/globals'
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'
import { makeAdminClient, createTestUser } from '../helpers/supabase.js'

describe('Journey A — Login flows', () => {
  let seededEmail: string

  before(async () => {
    await cleanLocalSqlite()
    const admin = makeAdminClient()
    const user = await createTestUser(admin, {
      email: `login-flow+${Date.now()}@leviticus.test`,
    })
    seededEmail = user.email
    // App boots at /login (no session in localStorage after cleanLocalSqlite)
    await browser.waitUntil(
      async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'Login screen did not load' }
    )
    await $('input[type=email]').waitForExist({ timeout: 30_000 })
  })

  it('T4 — nome vazio no signup: erro imediato, sem chamada à rede', async () => {
    // Switch to signup mode
    await $('button=Criar conta').click()

    // Fill valid email + password but leave name empty
    await setReactInputValue('input#email', `empty-name+${Date.now()}@leviticus.test`)
    await setReactInputValue('input#password', 'senha123')
    // input#name is left empty

    // Submit → handleSubmit checks !cleanName before calling Supabase
    await $('button[type=submit]').click()

    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 5_000, timeoutMsg: 'Expected error for empty name' })
    expect(await alert.getText()).toContain('Informe seu nome')
    expect(await browser.getUrl()).toMatch(/\/login/)
  })

  it('T3 — signup com e-mail já cadastrado: erro de duplicata', async () => {
    // Still in signup mode from T4. Fill all fields with the seeded user's email.
    await setReactInputValue('input#name', 'Usuário Existente')
    await setReactInputValue('input#email', seededEmail)
    await setReactInputValue('input#password', 'senha-do-teste-e2e')
    await $('button[type=submit]').click()

    // Supabase returns identities.length === 0 for existing confirmed users →
    // "Este e-mail já está cadastrado. Faça login."
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 10_000, timeoutMsg: 'Expected duplicate-email error' })
    expect(await alert.getText()).toContain('Este e-mail já está cadastrado')
    expect(await browser.getUrl()).toMatch(/\/login/)
  })

  it('T2 — senha incorreta: erro de autenticação amigável', async () => {
    // Switch back to login mode
    await $('button=Fazer login').click()

    await setReactInputValue('input#email', seededEmail)
    await setReactInputValue('input#password', 'senha-errada-999')
    await $('button[type=submit]').click()

    // friendlySignInError maps Supabase "Invalid login credentials" →
    // "E-mail ou senha incorretos."
    const alert = $('p[role=alert]')
    await alert.waitForExist({ timeout: 10_000, timeoutMsg: 'Expected wrong-password error' })
    expect(await alert.getText()).toContain('E-mail ou senha incorretos')
    expect(await browser.getUrl()).toMatch(/\/login/)
  })

  it('T1 — login com credenciais corretas: redireciona para /org', async () => {
    // Login mode active from T2. Fill correct credentials.
    await setReactInputValue('input#email', seededEmail)
    await setReactInputValue('input#password', 'senha-do-teste-e2e')
    await $('button[type=submit]').click()

    // No org assigned for this seeded user → lands on /org
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      { timeout: 15_000, timeoutMsg: 'Did not redirect to /org after successful login' }
    )
  })
})
