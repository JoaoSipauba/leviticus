function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value as string
}

function optionalEnv(key: string): string | undefined {
  const value = import.meta.env[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export const env = {
  supabaseUrl: requireEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('VITE_SUPABASE_ANON_KEY'),
  // Sentry DSN — opcional. Sem DSN, observabilidade vira no-op (não
  // quebra dev local). Em prod fica obrigatório via secret do CI.
  sentryDsn: optionalEnv('VITE_SENTRY_DSN'),
  // import.meta.env.MODE: 'development' em dev, 'production' em build.
  mode: (import.meta.env.MODE as string) || 'development',
}
