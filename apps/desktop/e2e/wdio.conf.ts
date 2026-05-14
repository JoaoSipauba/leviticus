// apps/desktop/e2e/wdio.conf.ts
//
// Default WebdriverIO config for the e2e harness. Targets Linux + tauri-driver
// (used in CI). macOS local development uses wdio.local.conf.ts which extends
// from this base and swaps the driver.

import { spawn, type ChildProcess } from 'node:child_process'
import { appBinaryPath } from './helpers/env.js'
import { takeScreenshot } from './helpers/app.js'

let tauriDriver: ChildProcess | null = null

export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  mochaOpts: {
    // Default Mocha test timeout is 2s, wdio overrides to 60s — but our
    // multi-step journey needs more headroom (app boot + 2 page transitions
    // + SQL assertions). 120s is comfortable; a real failure trips the
    // waitforTimeout (10s per step) first with a meaningful message.
    timeout: 120_000,
  },
  reporters: ['spec'],
  specs: ['./specs/**/*.spec.ts'],
  capabilities: [
    {
      browserName: 'wry',
      'tauri:options': { application: appBinaryPath() },
    } as WebdriverIO.Capabilities,
  ],

  // tauri-driver listens on port 4444 by default. WebdriverIO connects there.
  hostname: '127.0.0.1',
  port: 4444,
  // tauri-driver doesn't speak the W3C "/session" suffix — we use the default path.

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  // tsx loader so we can write specs/helpers in TypeScript directly.
  // In wdio v9, tsx is built-in — point to the local tsconfig.
  tsConfigPath: './tsconfig.json',

  beforeSession: () => {
    // Launch tauri-driver as a sub-process before the WebdriverIO session
    // connects. It manages WebKitGTKDriver internally on Linux.
    tauriDriver = spawn('tauri-driver', [], {
      stdio: [null, process.stdout, process.stderr],
    })
  },

  afterSession: () => {
    tauriDriver?.kill()
    tauriDriver = null
  },

  afterTest: async (test, _ctx, result) => {
    if (result.error) {
      const filePath = await takeScreenshot(test.title)
      console.error(`Screenshot saved: ${filePath}`)
    }
  },

  // Where wdio puts run logs (separate from screenshots).
  outputDir: './.wdio-logs',
}
