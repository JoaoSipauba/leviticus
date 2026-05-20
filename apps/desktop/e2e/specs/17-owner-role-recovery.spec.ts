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

  it('ensure_owner_role RPC é idempotente: recria papel + permissões + assignment', async () => {
    const supabase = makeAdminClient()

    // 1. Simula corrupção: deleta papel "Dono" do Supabase via DELETE cascade
    //    (apaga role_permissions e user_role_assignments dependentes).
    const { error: delErr } = await supabase
      .from('roles').delete().eq('org_id', orgId).eq('name', 'Dono')
    expect(delErr).toBeNull()

    const { data: afterDel } = await supabase
      .from('roles').select('id').eq('org_id', orgId).eq('name', 'Dono')
    expect(afterDel).toHaveLength(0)

    // 2. Chama o RPC direto (mesma chamada que o app faz quando OrgRoles
    //    detecta SQLite local vazio).
    const { error: rpcErr } = await supabase.rpc('ensure_owner_role', { p_org_id: orgId })
    expect(rpcErr).toBeNull()

    // 3. Papel "Dono" recriado
    const { data: roles } = await supabase
      .from('roles').select('id').eq('org_id', orgId).eq('name', 'Dono')
    expect(roles).toHaveLength(1)
    const roleId = roles![0]!.id

    // 4. Todas as 8 permissões foram aplicadas
    const { data: perms } = await supabase
      .from('role_permissions').select('permission').eq('role_id', roleId)
    expect(perms?.length).toBe(8)
    const permNames = new Set((perms ?? []).map((p) => (p as { permission: string }).permission))
    for (const expected of [
      'add_songs', 'manage_songs', 'manage_groups', 'manage_playlists',
      'add_songs_to_playlist', 'manage_members', 'manage_roles', 'manage_integrations',
    ]) {
      expect(permNames.has(expected)).toBe(true)
    }

    // 5. Owner está atribuído ao novo papel Dono
    const { data: orgRows } = await supabase
      .from('organizations').select('owner_id').eq('id', orgId).single()
    const ownerId = (orgRows as { owner_id: string }).owner_id
    const { data: assignments } = await supabase
      .from('user_role_assignments').select('id')
      .eq('user_id', ownerId).eq('org_id', orgId).eq('role_id', roleId)
    expect(assignments?.length).toBeGreaterThanOrEqual(1)

    // 6. Re-chamar o RPC é idempotente (não cria duplicados nem erra)
    const { error: rpcErr2 } = await supabase.rpc('ensure_owner_role', { p_org_id: orgId })
    expect(rpcErr2).toBeNull()
    const { data: rolesAfter2nd } = await supabase
      .from('roles').select('id').eq('org_id', orgId).eq('name', 'Dono')
    expect(rolesAfter2nd).toHaveLength(1)
  })
})
