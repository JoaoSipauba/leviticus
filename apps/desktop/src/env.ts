function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value as string
}

export const env = {
  supabaseUrl: requireEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('VITE_SUPABASE_ANON_KEY'),
}
