// apps/desktop/e2e/wdio.local.conf.ts
//
// macOS local override. Extends the base config but uses tauri-wd (community
// CLI binary) instead of tauri-driver. Install with:
//   cargo install tauri-webdriver-automation --locked
//   (the installed binary is named `tauri-wd`)
//
// The app must also embed `tauri-plugin-webdriver-automation` in debug builds
// (see apps/desktop/src-tauri/src/lib.rs).
//
// See https://danielraffel.me/2026/02/14/i-built-a-webdriver-for-wkwebview-tauri-apps-on-macos/

import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { config as baseConfig } from './wdio.conf.js'
import { appBinaryPath } from './helpers/env.js'
import { takeScreenshot } from './helpers/app.js'

let tauriWd: ChildProcess | null = null

export const config: WebdriverIO.Config = {
  ...baseConfig,

  // tauri-wd expects the binary path under `tauri:options.binary` (vs
  // `application` used by the official tauri-driver). Override here.
  capabilities: [
    {
      browserName: 'wry',
      'tauri:options': { binary: appBinaryPath() },
    } as WebdriverIO.Capabilities,
  ],

  beforeSession: async () => {
    // tauri-wd is the macOS WebDriver substitute. Default port is 4444 — matches
    // the base config's port so we don't need to override.
    tauriWd = spawn('tauri-wd', [], {
      stdio: [null, process.stdout, process.stderr],
    })
    // Give tauri-wd a moment to bind the socket on 4444 before WebdriverIO
    // attempts to connect; otherwise the first session POST races and dies
    // with UND_ERR_SOCKET.
    await sleep(1500)
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
