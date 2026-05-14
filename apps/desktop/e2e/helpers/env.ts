// apps/desktop/e2e/helpers/env.ts
//
// Resolves environment variables and paths used by the e2e harness.
// Reads from process.env so callers (CI workflow, local shell) can override.

import { homedir, platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Path to the Tauri debug build (after `tauri build --debug`). */
export function appBinaryPath(): string {
  const target = path.resolve(__dirname, '../../src-tauri/target/debug')
  if (platform() === 'darwin') {
    // macOS bundles produce a .app — the executable inside is what WebDriver launches.
    return path.join(
      target,
      'bundle/macos/Leviticus Dev.app/Contents/MacOS/Leviticus Dev'
    )
  }
  // Linux: the bare binary lives in the target/debug root.
  // Name matches `name` in apps/desktop/src-tauri/Cargo.toml.
  return path.join(target, 'leviticus-desktop')
}

/** Path to the local SQLite file used by the dev app on macOS. */
export function localSqliteDbPath(): string {
  return path.join(
    homedir(),
    'Library/Application Support/com.leviticus.app.dev/leviticus.db'
  )
}

/** Supabase URL — defaults to the local supabase start endpoint. */
export function supabaseUrl(): string {
  return process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
}

/** Service-role key (required for admin SQL assertions). */
export function supabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY required for e2e tests. ' +
        'Set it via the local shell or capture from `supabase status -o json`.'
    )
  }
  return key
}

/** Directory where WebdriverIO writes screenshots on failure. */
export function screenshotsDir(): string {
  return path.resolve(__dirname, '../screenshots')
}
