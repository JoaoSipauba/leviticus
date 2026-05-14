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
