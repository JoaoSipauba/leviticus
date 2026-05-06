import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type { SupabaseClient }

export function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

export function createSupabaseServiceClient(
  url: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
