import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
