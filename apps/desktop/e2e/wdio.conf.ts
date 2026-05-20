// apps/desktop/e2e/wdio.conf.ts
//
// Default WebdriverIO config for the e2e harness. Targets Windows + macOS via
// @crabnebula/tauri-driver (fork oficial que suporta Tauri 2 e ambos OS).
// CI roda em Windows self-hosted; macOS local dev usa o mesmo arquivo.
//
// Issue #73: substituímos o tauri-driver crate oficial v0.1.4 (que só suporta
// Tauri v1, falha com hyper::IncompleteMessage ao spawnar Tauri 2 no Windows)
// pelo fork @crabnebula/tauri-driver instalável via npm.

import { spawn, type ChildProcess } from 'node:child_process'
import { platform } from 'node:os'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { appBinaryPath } from './helpers/env.js'
import { takeScreenshot } from './helpers/app.js'

const require = createRequire(import.meta.url)
let tauriDriver: ChildProcess | null = null
const isWindows = platform() === 'win32'

/**
 * Aguarda uma porta TCP aceitar conexão (driver pronto). Faz polling até
 * conectar ou estourar o timeout.
 */
function waitForPort(port: number, host: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ port, host })
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) {
          reject(new Error(`tauri-driver não abriu a porta ${port} em ${timeoutMs}ms`))
        } else {
          setTimeout(attempt, 150)
        }
      })
    }
    attempt()
  })
}

/**
 * Resolve o caminho absoluto do cli.js do @crabnebula/tauri-driver.
 *
 * Rodamos `node <cli.js>` direto em vez do shim `node_modules/.bin/tauri-driver`
 * (.cmd no Windows): com `shell: true`, o cmd.exe não acha um path relativo
 * com barras `/` e o spawn falha em silêncio — o driver nunca sobe e todas as
 * specs caem com "Unable to connect to 127.0.0.1:4444". `node <cli.js>` é
 * absoluto e dispensa shell, funcionando igual nos dois OS.
 */
function resolveTauriDriverCli(): string {
  const pkgJsonPath = require.resolve('@crabnebula/tauri-driver/package.json')
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
    bin: string | Record<string, string>
  }
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['tauri-driver']!
  return join(dirname(pkgJsonPath), binRel)
}

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

  beforeSession: async () => {
    // Linux: spawn tauri-driver no próprio process group (`detached: true`) pra
    // poder kill em cascata o WebKitWebDriver child via PID negativo. Sem isso,
    // o child continua segurando a porta e o próximo spec falha com
    // "can not listen to address: 127.0.0.1:4444".
    //
    // Windows: `detached: true` em spawn() não cria process group (Win não tem
    // esse conceito) — em vez disso, abriria uma nova janela do console. Usamos
    // taskkill /T /F no afterSession pra matar a árvore inteira.
    // Roda `node <cli.js>` direto — sem shell, sem shim .cmd (ver
    // resolveTauriDriverCli). Path absoluto funciona igual nos dois OS.
    tauriDriver = spawn(process.execPath, [resolveTauriDriverCli()], {
      stdio: [null, process.stdout, process.stderr],
      detached: !isWindows,
    })
    tauriDriver.on('error', (e) => {
      console.error('[tauri-driver] falhou ao iniciar:', e)
    })
    tauriDriver.on('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`[tauri-driver] saiu com código ${code}`)
    })
    // tauri-driver sobe o msedgedriver/WebKitWebDriver e só então abre a 4444.
    // Sem esperar, o wdio conecta cedo demais e falha com "Unable to connect
    // to 127.0.0.1:4444" — derrubando todas as specs.
    await waitForPort(4444, '127.0.0.1', 30_000)
  },

  afterSession: async () => {
    const proc = tauriDriver
    tauriDriver = null
    if (!proc?.pid) return

    if (isWindows) {
      // Windows: taskkill /T mata a árvore inteira (msedgedriver + app).
      // Caminho absoluto + sem shell — evita PATH-hijacking flagged pelo
      // Sonar S4036 (defesa em profundidade — Windows PATH é geralmente
      // seguro, mas absoluto é mais explícito sobre intenção).
      const taskkillPath = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\taskkill.exe`
      await new Promise<void>((resolve) => {
        const kill = spawn(taskkillPath, ['/F', '/T', '/PID', String(proc.pid)], {
          stdio: 'ignore',
        })
        kill.on('exit', () => resolve())
        setTimeout(resolve, 2000)
      })
      return
    }

    // Linux/macOS: PID negativo = process group inteiro
    try { process.kill(-proc.pid, 'SIGTERM') } catch { /* já morto */ }
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
