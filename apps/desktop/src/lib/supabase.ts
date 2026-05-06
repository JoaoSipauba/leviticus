import { createSupabaseClient } from '@leviticus/core'
import { env } from '../env.js'

export const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseAnonKey)
