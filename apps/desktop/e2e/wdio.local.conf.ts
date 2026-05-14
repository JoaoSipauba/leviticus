// apps/desktop/e2e/wdio.local.conf.ts
//
// macOS local override. Extends the base config but uses tauri-wd (community
// CLI binary) instead of tauri-driver. Install with:
//   cargo install tauri-wd --locked
//
// See https://danielraffel.me/2026/02/14/i-built-a-webdriver-for-wkwebview-tauri-apps-on-macos/

import { spawn, type ChildProcess } from 'node:child_process'
import { config as baseConfig } from './wdio.conf.js'
import { takeScreenshot } from './helpers/app.js'

let tauriWd: ChildProcess | null = null

export const config: WebdriverIO.Config = {
  ...baseConfig,

  beforeSession: () => {
    // tauri-wd is the macOS WebDriver substitute. Default port is 4444 — matches
    // the base config's port so we don't need to override.
    tauriWd = spawn('tauri-wd', [], {
      stdio: [null, process.stdout, process.stderr],
    })
  },

  afterSession: () => {
    tauriWd?.kill()
    tauriWd = null
  },

  // Re-define afterTest because object spread doesn't merge nested functions —
  // we want the same screenshot behavior here.
  afterTest: async (test, _ctx, result) => {
    if (result.error) {
      const filePath = await takeScreenshot(test.title)
      console.error(`Screenshot saved: ${filePath}`)
    }
  },
}
