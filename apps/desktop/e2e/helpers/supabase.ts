// apps/desktop/e2e/helpers/supabase.ts
//
// Admin Supabase client for the e2e harness. Uses the service-role key, so
// it bypasses RLS — only the test runner has access to this key. The desktop
// app never sees it.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseUrl, supabaseServiceRoleKey } from './env.js'

let _client: SupabaseClient | null = null

export function makeAdminClient(): SupabaseClient {
  if (_client) return _client
  _client = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

/**
 * Creates an auth.users row with the given email, password-confirmed. Bypasses
 * the email-verification step. Only the e2e harness should call this — the
 * service-role key is required.
 */
export async function createTestUser(
  admin: SupabaseClient,
  opts: { email?: string; password?: string } = {}
): Promise<{ id: string; email: string }> {
  const email = opts.email ?? `seeded+${Date.now()}@leviticus.test`
  const password = opts.password ?? 'senha-do-teste-e2e'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? 'no user returned'}`)
  }
  return { id: data.user.id, email }
}

/**
 * Creates an `organizations` row owned by `ownerId` and inserts the matching
 * `organization_members` row. The `seed_owner_role` trigger fires on the
 * organizations insert, creating the Dono role and assignment.
 */
export async function createOrgWithOwner(
  admin: SupabaseClient,
  ownerId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from('organizations')
    .insert({ name, owner_id: ownerId })
    .select('id, name')
    .single()
  if (error || !data) {
    throw new Error(`createOrgWithOwner failed: ${error?.message ?? 'no row'}`)
  }
  const { error: memberError } = await admin
    .from('organization_members')
    .insert({ user_id: ownerId, org_id: data.id })
  if (memberError) {
    throw new Error(`createOrgWithOwner member insert failed: ${memberError.message}`)
  }
  return data as { id: string; name: string }
}

/**
 * Inserts a row into `org_invite_codes` directly (bypassing the `create_invite_code`
 * RPC because the RPC needs auth.uid(), which service-role calls don't have).
 * The code is uppercased to match the RPC's behavior so consumers can paste in
 * any case and still hit the unique index.
 */
export async function createInviteCode(
  admin: SupabaseClient,
  args: {
    orgId: string
    createdBy: string
    code: string
    label?: string | null
    expiresAt?: string | null
  }
): Promise<void> {
  const { error } = await admin.from('org_invite_codes').insert({
    org_id: args.orgId,
    code: args.code.toUpperCase(),
    created_by: args.createdBy,
    label: args.label ?? null,
    expires_at: args.expiresAt ?? null,
    is_active: true,
  })
  if (error) throw new Error(`createInviteCode failed: ${error.message}`)
}

/** Polls until a song row with this org+youtube_url appears or the deadline hits. */
export async function findSongByYoutubeUrl(
  admin: SupabaseClient,
  orgId: string,
  youtubeUrl: string,
  timeoutMs = 15_000
): Promise<{ id: string; title: string; artist: string; duration_seconds: number; song_type: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data } = await admin
      .from('songs')
      .select('id, title, artist, duration_seconds, song_type')
      .eq('org_id', orgId)
      .eq('youtube_url', youtubeUrl)
    if (data && data.length === 1) {
      const row = data[0] as {
        id: string; title: string; artist: string; duration_seconds: number; song_type: string
      }
      return row
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}
