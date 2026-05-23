import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  esbuild: {
    // Transforma JSX pra React automatic runtime (compatível com React 18)
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    globals: true,
    environmentMatchGlobs: [
      // componentes React rodam com jsdom
      ['app/admin/components/**/*.test.tsx', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
  },
})
