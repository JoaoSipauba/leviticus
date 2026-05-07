import { createClient } from '@supabase/supabase-js'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { env } from '../env.js'

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: tauriFetch as unknown as typeof globalThis.fetch,
  },
})
