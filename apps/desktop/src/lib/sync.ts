import { supabase } from './supabase.js'
import { getDb, getLastSync, setLastSync } from './db.js'

export async function syncOrg(orgId: string): Promise<void> {
  const db = await getDb()
  const since = (await getLastSync(orgId)) ?? '1970-01-01T00:00:00Z'

  // Listar colunas explicitamente (não usar '*'). Ver "Migrations checklist"
  // em CLAUDE.md — o contrato fica visível e colunas novas no Supabase não
  // chegam silenciosamente até a release de app que as suporta.
  const [
    songs, groups, playlists, songGroups, playlistSongs,
    org, members, roles, rolePerms, roleAssigns, invites, allRoles,
    cloudAccount,
  ] = await Promise.all([
    supabase.from('songs').select(
      'id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, song_type, cloud_file_id, cloud_file_size, cloud_file_hash, source, original_format, backup_status, created_at, updated_at'
    ).eq('org_id', orgId).gte('updated_at', since),
    supabase.from('groups').select('id, org_id, name, color_index, updated_at').eq('org_id', orgId).gte('updated_at', since),
    supabase.from('playlists').select('id, org_id, name, scheduled_at, scheduled_end, created_at, updated_at').eq('org_id', orgId).gte('updated_at', since),
    supabase.from('song_groups').select('song_id, group_id, songs!inner(org_id)').eq('songs.org_id', orgId),
    supabase.from('playlist_songs').select('playlist_id, section_id, song_id, position, group_id, section_label, playlists!inner(org_id)').eq('playlists.org_id', orgId),
    supabase.from('organizations').select('id, name, owner_id, city, timezone, created_at, updated_at').eq('id', orgId).single(),
    supabase.from('organization_members').select('user_id, org_id, joined_at').eq('org_id', orgId),
    supabase.from('roles').select('id, org_id, name, updated_at').eq('org_id', orgId).gte('updated_at', since),
    supabase.from('role_permissions').select('role_id, permission, roles!inner(org_id)').eq('roles.org_id', orgId),
    supabase.from('user_role_assignments').select('id, user_id, org_id, role_id, group_id').eq('org_id', orgId),
    supabase.from('org_invite_codes').select('id, org_id, code, label, created_by, expires_at, is_active').eq('org_id', orgId),
    supabase.from('roles').select('id').eq('org_id', orgId),
    supabase.from('cloud_storage_accounts_public').select(
      'org_id, provider, account_email, account_user_id, app_folder_id, connected_by, connected_at, last_quota_total, last_quota_used, last_quota_check_at, updated_at'
    ).eq('org_id', orgId).maybeSingle(),
  ])

  if (songs.error) throw new Error(`sync songs failed: ${songs.error.message}`)
  if (groups.error) throw new Error(`sync groups failed: ${groups.error.message}`)
  if (playlists.error) throw new Error(`sync playlists failed: ${playlists.error.message}`)
  if (songGroups.error) throw new Error(`sync song_groups failed: ${songGroups.error.message}`)
  if (playlistSongs.error) throw new Error(`sync playlist_songs failed: ${playlistSongs.error.message}`)
  if (org.error) throw new Error(`sync organization failed: ${org.error.message}`)
  if (members.error) throw new Error(`sync organization_members failed: ${members.error.message}`)
  if (roles.error) throw new Error(`sync roles failed: ${roles.error.message}`)
  if (rolePerms.error) throw new Error(`sync role_permissions failed: ${rolePerms.error.message}`)
  if (roleAssigns.error) throw new Error(`sync user_role_assignments failed: ${roleAssigns.error.message}`)
  if (invites.error) throw new Error(`sync org_invite_codes failed: ${invites.error.message}`)
  if (allRoles.error) throw new Error(`sync roles (full) failed: ${allRoles.error.message}`)
  if (cloudAccount.error) throw new Error(`sync cloud_storage_accounts failed: ${cloudAccount.error.message}`)

  for (const s of songs.data) {
    await db.execute(
      `INSERT OR REPLACE INTO songs
       (id, org_id, youtube_url, title, artist, thumbnail_url, duration_seconds, song_type,
        cloud_file_id, cloud_file_size, cloud_file_hash, source, original_format, backup_status,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.org_id, s.youtube_url, s.title, s.artist,
       s.thumbnail_url, s.duration_seconds, s.song_type ?? 'normal',
       s.cloud_file_id, s.cloud_file_size, s.cloud_file_hash,
       s.source ?? 'youtube', s.original_format, s.backup_status ?? 'pending',
       s.created_at, s.updated_at]
    )
  }

  for (const g of groups.data) {
    await db.execute(
      `INSERT OR REPLACE INTO groups (id, org_id, name, color_index, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [g.id, g.org_id, g.name, g.color_index ?? 0, g.updated_at]
    )
  }

  for (const p of playlists.data) {
    await db.execute(
      `INSERT OR REPLACE INTO playlists
       (id, org_id, name, scheduled_at, scheduled_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.org_id, p.name, p.scheduled_at, p.scheduled_end, p.created_at, p.updated_at]
    )
  }

  for (const sg of songGroups.data) {
    await db.execute(
      `INSERT OR REPLACE INTO song_groups (song_id, group_id) VALUES (?, ?)`,
      [sg.song_id, sg.group_id]
    )
  }

  // Junction (playlist_songs) é re-fetched inteira a cada sync porque não tem
  // updated_at — a forma de capturar removes é wipe + reinsert por playlist.
  // Limpa primeiro pra refletir deletes que aconteceram em outros devices.
  const playlistIds = Array.from(new Set(playlistSongs.data.map((p) => p.playlist_id)))
  for (const pid of playlistIds) {
    await db.execute(`DELETE FROM playlist_songs WHERE playlist_id = ?`, [pid])
  }
  for (const ps of playlistSongs.data) {
    await db.execute(
      `INSERT INTO playlist_songs
       (playlist_id, section_id, song_id, position, group_id, section_label)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ps.playlist_id, ps.section_id, ps.song_id, ps.position, ps.group_id, ps.section_label]
    )
  }

  // organizations (single row, INSERT OR REPLACE)
  if (org.data) {
    const o = org.data
    await db.execute(
      `INSERT OR REPLACE INTO orgs (id, name, owner_id, city, timezone, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [o.id, o.name, o.owner_id, o.city, o.timezone, o.updated_at]
    )
  }

  // organization_members — wipe + re-insert (no updated_at)
  await db.execute(`DELETE FROM organization_members WHERE org_id = ?`, [orgId])
  for (const m of members.data) {
    await db.execute(
      `INSERT OR REPLACE INTO organization_members (user_id, org_id, joined_at) VALUES (?, ?, ?)`,
      [m.user_id, m.org_id, m.joined_at]
    )
  }

  // roles — incremental
  for (const r of roles.data) {
    await db.execute(
      `INSERT OR REPLACE INTO roles (id, org_id, name, updated_at) VALUES (?, ?, ?, ?)`,
      [r.id, r.org_id, r.name, r.updated_at]
    )
  }

  // role_permissions — wipe + re-insert per role belonging to this org.
  // Use allRoles (full list, non-incremental) to scope the DELETE so that
  // permissions for deleted or unchanged roles are not left as orphans.
  const allRoleIds = allRoles.data.map((r) => r.id)
  if (allRoleIds.length > 0) {
    const placeholders = allRoleIds.map(() => '?').join(',')
    await db.execute(`DELETE FROM role_permissions WHERE role_id IN (${placeholders})`, allRoleIds)
  }
  for (const rp of rolePerms.data) {
    await db.execute(
      `INSERT OR REPLACE INTO role_permissions (role_id, permission) VALUES (?, ?)`,
      [rp.role_id, rp.permission]
    )
  }

  // user_role_assignments — wipe + re-insert (no updated_at)
  await db.execute(`DELETE FROM user_role_assignments WHERE org_id = ?`, [orgId])
  for (const a of roleAssigns.data) {
    await db.execute(
      `INSERT OR REPLACE INTO user_role_assignments (id, user_id, org_id, role_id, group_id) VALUES (?, ?, ?, ?, ?)`,
      [a.id, a.user_id, a.org_id, a.role_id, a.group_id]
    )
  }

  // org_invite_codes — wipe + re-insert (no updated_at on this table)
  await db.execute(`DELETE FROM org_invite_codes WHERE org_id = ?`, [orgId])
  for (const inv of invites.data) {
    await db.execute(
      `INSERT OR REPLACE INTO org_invite_codes (id, org_id, code, label, created_by, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [inv.id, inv.org_id, inv.code, inv.label, inv.created_by, inv.expires_at, inv.is_active ? 1 : 0]
    )
  }

  // cloud_storage_accounts — single row per org, sourced from public view (no tokens)
  if (cloudAccount.data) {
    const a = cloudAccount.data
    await db.execute(
      `INSERT OR REPLACE INTO cloud_storage_accounts
       (org_id, provider, account_email, account_user_id, app_folder_id,
        connected_by, connected_at, last_quota_total, last_quota_used, last_quota_check_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.org_id, a.provider, a.account_email, a.account_user_id, a.app_folder_id,
       a.connected_by, a.connected_at, a.last_quota_total, a.last_quota_used, a.last_quota_check_at, a.updated_at]
    )
  } else {
    // Conta desconectada — limpa cache local
    await db.execute(`DELETE FROM cloud_storage_accounts WHERE org_id = ?`, [orgId])
  }

  await setLastSync(orgId, new Date().toISOString())
}
