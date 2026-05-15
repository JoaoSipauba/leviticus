import type { Permission } from '@leviticus/core'
import { getDb } from './db.js'
import { supabase } from './supabase.js'

/**
 * Returns true if the current authenticated user has `perm` for `orgId`.
 * Queries the local SQLite cache (populated by syncOrg).
 *
 * v1 callers: only the OrgManage sub-tabs and the member ⋯ menu use this.
 * Permission enforcement on the rest of the app is a future follow-up.
 */
export async function hasPermission(perm: Permission, orgId: string): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false

  const db = await getDb()
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt
     FROM user_role_assignments a
     JOIN role_permissions rp ON rp.role_id = a.role_id
     WHERE a.user_id = ? AND a.org_id = ? AND rp.permission = ?`,
    [data.user.id, orgId, perm]
  )
  return (rows[0]?.cnt ?? 0) > 0
}

/**
 * Returns true if the current user is the org owner. Checked against the
 * `orgs` SQLite table (populated by syncOrg → organizations row).
 */
export async function isOwner(orgId: string): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false
  const db = await getDb()
  const rows = await db.select<{ owner_id: string }[]>(
    `SELECT owner_id FROM orgs WHERE id = ?`,
    [orgId]
  )
  return rows[0]?.owner_id === data.user.id
}
