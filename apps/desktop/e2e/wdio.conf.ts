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
    // multi-step journeys need more headroom. Journey #6 in particular waits
    // up to 90s for OrgSelect.syncOrg to complete before the /library redirect.
    // 180s gives ample room for all journeys while still catching true hangs.
    timeout: 180_000,
  },
  reporters: ['spec'],
  specs: ['./specs/**/*.spec.ts'],
  capabilities: [
    {
      browserName: 'wry',
      // tauri-driver oficial v2.0.6 lê `application` (PathBuf).
      // (wdio.local.conf.ts usa `binary` porque o tauri-wd community macOS
      //  divergiu da nomenclatura — não confundir.)
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

  // tauri-wd only exposes a single port (4444) and can only drive one app
  // instance at a time. Force serial execution so spec files don't race for
  // the WebDriver socket.
  maxInstances: 1,

  // tsx loader so we can write specs/helpers in TypeScript directly.
  // In wdio v9, tsx is built-in — point to the local tsconfig.
  tsConfigPath: './tsconfig.json',

  beforeSession: () => {
    // Launch tauri-driver como process group próprio (`detached: true`) pra
    // garantir que dá pra kill em cascata o WebKitWebDriver child no fim.
    // Sem isso, tauri-driver.kill() só mata o processo pai e o WebKitWebDriver
    // continua segurando porta 4445 — próximo spec falha com
    // "can not listen to address: 127.0.0.1:4444" (mesma causa raiz do issue
    // de port leak que resolvemos pro tauri-wd no commit bcd20ef3).
    tauriDriver = spawn('tauri-driver', [], {
      stdio: [null, process.stdout, process.stderr],
      detached: true,
    })
  },

  afterSession: async () => {
    const proc = tauriDriver
    tauriDriver = null
    if (!proc?.pid) return
    try {
      // Negativo = process group inteiro (tauri-driver + WebKitWebDriver filho).
      process.kill(-proc.pid, 'SIGTERM')
    } catch { /* já morto */ }
    // Espera até 1s pelo exit limpo; depois SIGKILL pra garantir.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { process.kill(-proc.pid!, 'SIGKILL') } catch { /* já morto */ }
        resolve()
      }, 1000)
      proc.once('exit', () => { clearTimeout(timer); resolve() })
    })
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
