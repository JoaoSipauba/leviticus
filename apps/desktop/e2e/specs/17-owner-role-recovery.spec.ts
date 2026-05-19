// apps/desktop/e2e/specs/17-owner-role-recovery.spec.ts
//
// Issue #85 — auto-recovery do papel "Dono".
//
// Sintoma original: aba Organização → Papéis mostrava 0 papéis em orgs reais.
// Causa: SQLite local sem o papel "Dono" (trigger não rodou, sync perdeu, ou
// SQLite corrompido).
//
// Fix: novo RPC ensure_owner_role(p_org_id) idempotente + chamada na load()
// do OrgRoles quando SQLite local retorna 0 roles.
//
// Esse spec simula a condição corrupta deletando o papel "Dono" no Supabase
// (forçando o estado vazio que o user encontrou) e valida que ao abrir a
// aba Papéis, o RPC reconstrói e a UI exibe.

import { browser, $, expect } from '@wdio/globals'
import { cleanLocalSqlite, signupAndCreateOrg } from '../helpers/app.js'
import { makeAdminClient } from '../helpers/supabase.js'

describe('Journey #17 — Auto-recovery do papel Dono (#85)', () => {
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'owner-recovery-17' })
    orgId = seeded.orgId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('papel Dono existe após criar org (trigger seed_owner_role)', async () => {
    const supabase = makeAdminClient()
    const { data, error } = await supabase
      .from('roles').select('id, name').eq('org_id', orgId).eq('name', 'Dono')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('auto-recovery: se Dono some, ensure_owner_role recria + UI exibe', async () => {
    const supabase = makeAdminClient()

    // 1. Simula corrupção: deleta papel Dono do Supabase
    const { error: delErr } = await supabase
      .from('roles').delete().eq('org_id', orgId).eq('name', 'Dono')
    expect(delErr).toBeNull()

    // Confirma deletado
    const { data: afterDel } = await supabase
      .from('roles').select('id').eq('org_id', orgId).eq('name', 'Dono')
    expect(afterDel).toHaveLength(0)

    // 2. Navega pra aba Papéis — o load() detecta SQLite vazio (já que sync
    //    reativo pega o DELETE) e dispara ensure_owner_role RPC.
    await browser.url('tauri://localhost/manage?tab=roles')

    // 3. Aguarda o papel "Dono" reaparecer na lista (resultado do RPC + re-sync)
    const donoButton = $('button*=Dono')
    await donoButton.waitForExist({
      timeout: 30_000,
      timeoutMsg: 'Papel "Dono" não foi recriado pelo ensure_owner_role',
    })

    // 4. Confirma no Supabase que o RPC realmente criou
    const { data: afterRpc } = await supabase
      .from('roles').select('id').eq('org_id', orgId).eq('name', 'Dono')
    expect(afterRpc).toHaveLength(1)

    // 5. Confirma que o owner está atribuído ao papel
    const { data: orgRows } = await supabase
      .from('organizations').select('owner_id').eq('id', orgId).single()
    const ownerId = (orgRows as { owner_id: string }).owner_id
    const { data: assignments } = await supabase
      .from('user_role_assignments').select('id')
      .eq('user_id', ownerId).eq('org_id', orgId).eq('role_id', afterRpc![0]!.id)
    expect(assignments?.length).toBeGreaterThanOrEqual(1)
  })
})
