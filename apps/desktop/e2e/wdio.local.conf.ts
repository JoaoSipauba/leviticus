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

import fs from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { config as baseConfig } from './wdio.conf.js'
import { appBinaryPath } from './helpers/env.js'
import { takeScreenshot } from './helpers/app.js'

let tauriWd: ChildProcess | null = null

/**
 * Mata processos órfãos do app e do tauri-wd por nome.
 *
 * O tauri-wd lança o binário do app FORA do seu próprio process group, então
 * matar só o grupo do tauri-wd (`kill(-pid)`) deixa a janela do app viva — e
 * elas se acumulam a cada spec ao longo da suíte. `pkill` por nome é a rede
 * de segurança. Também cobre o caso de `afterSession` não rodar (falha ao
 * abrir a sessão, ou o processo do wdio ser interrompido). Idempotente.
 */
function killStrayProcesses(): void {
  // Padrões fixos (sem input externo). execFileSync — sem shell.
  for (const pattern of ['leviticus-desktop', 'tauri-wd']) {
    try {
      execFileSync('pkill', ['-9', '-f', pattern], { stdio: 'ignore' })
    } catch {
      /* exit != 0 = nenhum processo casou — ok */
    }
  }
}

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
    // Wipe the WKWebView data directory BEFORE starting the app so a stale
    // session from a prior run does not auto-login and so the WKWebView
    // process starts with a clean data root (deleting it while the process is
    // running can destabilize the IPC bridge and cause syncOrg to hang).
    const wkDir = path.join(homedir(), 'Library/WebKit/com.leviticus.app.dev')
    await fs.rm(wkDir, { recursive: true, force: true })

    // tauri-wd is the macOS WebDriver substitute. Default port is 4444 — matches
    // the base config's port so we don't need to override.
    // `detached: true` puts the child in its own process group so we can later
    // kill the whole tree, including any app process tauri-wd launches.
    tauriWd = spawn('tauri-wd', [], {
      stdio: [null, process.stdout, process.stderr],
      detached: true,
    })
    // Give tauri-wd a moment to bind the socket on 4444 before WebdriverIO
    // attempts to connect; otherwise the first session POST races and dies
    // with UND_ERR_SOCKET.
    await sleep(1500)
  },

  // Antes de tudo: varre processos órfãos de um run anterior interrompido,
  // pra a suíte não começar com janelas/portas presas.
  onPrepare: () => {
    killStrayProcesses()
  },

  afterSession: () => {
    if (tauriWd?.pid) {
      // Negative pid kills the whole process group (detached above).
      try { process.kill(-tauriWd.pid, 'SIGKILL') } catch { /* already dead */ }
    }
    tauriWd = null
    // O kill do grupo acima não alcança a janela do app (tauri-wd a lança
    // fora do grupo). Sem este pkill por nome, as janelas acumulam a cada
    // spec ao longo da suíte.
    killStrayProcesses()
  },

  // Rede de segurança final: garante que nada sobrou após a suíte inteira.
  onComplete: () => {
    killStrayProcesses()
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
