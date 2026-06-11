// apps/desktop/e2e/helpers/app.ts
//
// App-lifecycle helpers. The WebDriver service handles launching/quitting
// the actual app process — these helpers cover ancillary state.

import fs from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localSqliteDbPath, screenshotsDir } from './env.js'
import { makeAdminClient } from './supabase.js'

/**
 * Removes the local SQLite cache used by the dev app on macOS. Safe to call
 * even if the file doesn't exist. No-op on non-darwin platforms (CI Linux
 * starts from a fresh container, so there's nothing to clean).
 *
 * NOTE: The WKWebView data directory (LocalStorage, cookies, etc.) is cleaned
 * in wdio.local.conf.ts's `beforeSession` hook — BEFORE the app process
 * starts — to avoid destabilizing the WKWebView IPC bridge by deleting live
 * data while the process is running. This function only cleans the SQLite DB
 * files (which use a stable fd; an unlink while open is safe on macOS).
 */
export async function cleanLocalSqlite(): Promise<void> {
  if (platform() !== 'darwin') return
  const baseDir = path.dirname(localSqliteDbPath())
  // Wipe SQLite (DB + WAL/SHM sidecars). The file is unlinked on disk but
  // the app's open fd remains valid — writes continue to the old inode.
  for (const f of ['leviticus.db', 'leviticus.db-wal', 'leviticus.db-shm']) {
    await rmIfExists(path.join(baseDir, f))
  }
}

async function rmIfExists(target: string, opts: { recursive?: boolean } = {}): Promise<void> {
  try {
    if (opts.recursive) await fs.rm(target, { recursive: true, force: true })
    else await fs.unlink(target)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
}

/** Saves a screenshot of the current window state. Used by afterTest hook on failure. */
export async function takeScreenshot(label: string): Promise<string> {
  await fs.mkdir(screenshotsDir(), { recursive: true })
  const safe = label.replace(/[^a-zA-Z0-9-_]/g, '_')
  const filename = `${Date.now()}-${safe}.png`
  const fullPath = `${screenshotsDir()}/${filename}`
  await browser.saveScreenshot(fullPath)
  return fullPath
}

/**
 * Sets the value of a React-controlled input so React's onChange handler fires.
 *
 * WebdriverIO's `setValue` only writes to the DOM .value property, but React
 * tracks input values via a "value tracker" attached to the element. To get
 * React's state to update, we must call the native setter (which bumps the
 * tracker) and dispatch a synthetic 'input' event.
 *
 * See https://github.com/facebook/react/issues/10135
 */
export async function setReactInputValue(cssSelector: string, value: string): Promise<void> {
  await browser.execute((selector: string, val: string) => {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
    if (!el) throw new Error(`setReactInputValue: element not found: ${selector}`)
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    setter?.call(el, val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, cssSelector, value)
}

/**
 * Replaces `window.confirm` in the running app to silently return `returnValue`,
 * so destructive actions that gate on `confirm()` proceed (or abort) without
 * showing a native dialog. WebDriver against wry can't reliably accept native
 * alerts, so we sidestep the dialog entirely.
 *
 * Reset is not necessary between tests — the app process restarts between
 * WebDriver sessions and gets a fresh `window`.
 */
export async function stubConfirm(returnValue: boolean): Promise<void> {
  await browser.execute((v: boolean) => {
    window.confirm = () => v
  }, returnValue)
}

/**
 * Confirma um `ConfirmModal` aberto. Vários fluxos destrutivos (revogar
 * convite, deletar papel, etc.) migraram de `window.confirm` para o
 * `ConfirmModal` — clicar o gatilho só abre o modal; a ação real dispara no
 * botão de confirmar dentro dele.
 *
 * Clica o botão de confirmar pelo `data-testid="confirm-modal-confirm"` —
 * estável, sem depender de texto (que colide com o botão-gatilho) nem de
 * navegação de DOM. Ver ConfirmModal.tsx.
 */
export async function confirmModalAction(): Promise<void> {
  const confirmBtn = $('[data-testid="confirm-modal-confirm"]')
  await confirmBtn.waitForExist({ timeout: 10_000, timeoutMsg: 'ConfirmModal não abriu' })
  await confirmBtn.waitForEnabled({ timeout: 5_000 })
  await confirmBtn.click()
}

/** Resolves the path Tauri's shell capability maps to for `yt-dlp` (and `ffmpeg`). */
export function appLocalBinDir(): string {
  if (platform() === 'darwin') {
    return path.join(homedir(), 'Library/Application Support/com.leviticus.app.dev/bin')
  }
  // Linux (CI) — Tauri uses XDG data dir
  return path.join(homedir(), '.local/share/com.leviticus.app.dev/bin')
}

/** Audio output dir — where the app saves downloaded songs. */
export function appAudioDir(): string {
  return path.join(path.dirname(appLocalBinDir()), 'audio')
}

/**
 * Copies the fake yt-dlp shell script to where the app expects the binary
 * and sets it executable. Run once in `before()` of any test that needs yt-dlp.
 *
 * The mock's behavior is then mode-switched at runtime via setYtDlpMockMode.
 */
// Versão esperada pelo sidecar `.version` que o ensure_yt_dlp valida no boot.
// PRECISA bater com YT_DLP_VERSION em src-tauri/src/yt_dlp.rs — senão o
// Rust apaga o mock e re-baixa o yt-dlp REAL do GitHub, e os testes E2E
// rodam contra o YouTube real (falha com fake video IDs).
const YT_DLP_VERSION_FOR_MOCK = '2026.03.17'

// Tamanho mínimo que ensure_yt_dlp aceita (MIN_BIN_SIZE no Rust). Fake script
// tem ~1KB, então padding com comentários shell completa o tamanho. O `:` no
// fim é um no-op safety pra garantir que o último comando não vaze.
const MIN_BIN_SIZE_BYTES = 1_100_000

export async function installYtDlpMock(): Promise<void> {
  const binDir = appLocalBinDir()
  await fs.mkdir(binDir, { recursive: true })
  const fixtureSrc = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/fake-yt-dlp.sh'
  )
  const dest = path.join(binDir, 'yt-dlp')

  // Lê o script real e pad pra passar pelo size check do ensure_yt_dlp.
  // Padding é um comentário gigante que o shell ignora — não afeta execução.
  const scriptContent = await fs.readFile(fixtureSrc, 'utf-8')
  const currentSize = Buffer.byteLength(scriptContent, 'utf-8')
  const paddingNeeded = Math.max(0, MIN_BIN_SIZE_BYTES - currentSize)
  // 80 chars de comentário + newline = 81 bytes por linha
  const paddingLine = '# ' + 'x'.repeat(78) + '\n'
  const paddingLines = Math.ceil(paddingNeeded / paddingLine.length)
  const padding = paddingLine.repeat(paddingLines)
  const padded = scriptContent + '\n# E2E mock padding (ignored by shell)\n' + padding

  await fs.writeFile(dest, padded, 'utf-8')
  await fs.chmod(dest, 0o755)

  // Sidecar .version exigido pelo ensure_yt_dlp. Sem ele, mesmo passando o
  // size check, o version_ok falha e o app re-baixa.
  await fs.writeFile(path.join(binDir, 'yt-dlp.version'), YT_DLP_VERSION_FOR_MOCK, 'utf-8')

  // Start in happy mode by default.
  await setYtDlpMockMode('happy')
}

/**
 * Remove o mock de yt-dlp do bin dir do app dev. Chamado no `onComplete` do
 * wdio.local.conf pra evitar contaminar a próxima sessão de uso REAL do app
 * dev — sem isso, baixar uma música no app dev usa o fake e gera arquivo
 * vazio. Idempotente (no-op se nada existir). Também limpa o /tmp/fake-yt-dlp.mode.
 */
export async function uninstallYtDlpMock(): Promise<void> {
  const binDir = appLocalBinDir()
  await rmIfExists(path.join(binDir, 'yt-dlp'))
  await rmIfExists(path.join(binDir, 'yt-dlp.version'))
  await rmIfExists('/tmp/fake-yt-dlp.mode')
}

/** Writes /tmp/fake-yt-dlp.mode — read by fake-yt-dlp.sh on each invocation. */
export async function setYtDlpMockMode(
  mode: 'happy' | 'fail-metadata' | 'fail-download'
): Promise<void> {
  await fs.writeFile('/tmp/fake-yt-dlp.mode', mode, 'utf-8')
}

/**
 * Full UI signup + create org. Encapsulates the proven flow from journey #1
 * so subsequent journeys can start "logged in with an empty Library" cheaply.
 * Returns IDs for SQL assertions.
 *
 * Pre-req: app is at `/login` (cleanLocalSqlite was called before app boot).
 */
export async function signupAndCreateOrg(opts: {
  name?: string
  emailPrefix?: string
  orgName?: string
} = {}): Promise<{ userId: string; orgId: string; email: string }> {
  const ts = Date.now()
  const email = `${opts.emailPrefix ?? 'addsong'}+${ts}@leviticus.test`
  const orgName = opts.orgName ?? `Org Add Song ${ts}`

  // Login screen renders
  await browser.waitUntil(
    async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
    { timeout: 30_000, timeoutMsg: 'Login screen did not load' }
  )
  await $('input[type=email]').waitForExist({ timeout: 30_000 })
  await $('button=Criar conta').click()
  await setReactInputValue('input#name', opts.name ?? 'Usuário Teste')
  await setReactInputValue('input#email', email)
  await setReactInputValue('input#password', 'senha-do-teste-e2e')
  const submit = $('button[type=submit]')
  await submit.waitForEnabled({ timeout: 5_000 })
  await submit.click()

  // Org screen
  await browser.waitUntil(
    async () => /\/org$/.test(await browser.getUrl()),
    { timeout: 15_000, timeoutMsg: 'Did not redirect to /org' }
  )
  await $('button=Criar organização').click()
  await setReactInputValue('input[placeholder="Nome da organização"]', orgName)
  const create = $('button=Criar')
  await create.waitForEnabled({ timeout: 5_000 })
  await create.click()

  // Wait for the org row to materialize in Supabase
  const supabase = makeAdminClient()
  const deadline = Date.now() + 30_000
  let org: { id: string; owner_id: string } | null = null
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('organizations')
      .select('id, owner_id')
      .eq('name', orgName)
    if (data && data.length > 0) { org = data[0] as { id: string; owner_id: string }; break }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!org) throw new Error(`Org "${orgName}" not in DB after 30s`)

  // Aguarda o boot completar: o app navega pra /library e o splash some apenas
  // após auth + syncOrg terminarem. Sem este wait, specs que chamam este helper
  // e logo em seguida buscam botões na página encontram elementos em estado de
  // loading (CrossFade opacity:0) e não conseguem interagir — causando flakiness
  // na suíte paralela mas não em isolado (onde o boot termina antes do timeout).
  await browser.waitUntil(
    async () => /\/library$/.test(await browser.getUrl()),
    { timeout: 60_000, timeoutMsg: 'Did not navigate to /library after org creation' }
  )
  await browser.waitUntil(
    async () => !(await browser.$('#boot-splash').isExisting()),
    { timeout: 60_000, timeoutMsg: 'Boot splash did not disappear — syncOrg may have failed' }
  )

  return { userId: org.owner_id, orgId: org.id, email }
}

/**
 * Navega pra tela de detalhe de um culto e garante que ela carregou COM o
 * boot inteiro concluído.
 *
 * Dois problemas que esta função resolve (issue #100):
 *
 * 1. `PlaylistDetail` redireciona pra /services quando a playlist ainda não
 *    está no SQLite local — comum logo após criar a playlist via admin,
 *    antes do syncOrg do boot a commitar. Esperar um tempo fixo era flaky;
 *    consultar o SQLite via `plugin:sql|select` também não serve (a conexão
 *    é compartilhada, o SELECT enxerga rows dentro da transação ainda não
 *    commitada do syncOrg). Solução: cada `browser.url` é um boot novo que
 *    roda o syncOrg até o commit — re-navega até o detalhe ficar de pé.
 *
 * 2. O `#boot-splash` só some quando auth + syncOrg completam (App.tsx
 *    dispara `leviticus-ready` depois disso). Esperar o splash sumir garante
 *    que TODO o dado sincronizado (songs, ministérios) já está disponível —
 *    sem isso, um modal aberto logo após pode listar dados vazios.
 */
export async function gotoPlaylistDetail(playlistId: string): Promise<void> {
  const detailPath = `tauri://localhost/services/${playlistId}`
  const deadline = Date.now() + 150_000
  while (Date.now() < deadline) {
    await browser.url(detailPath)
    // Espera o boot terminar de verdade: o splash some só após syncOrg.
    await browser.waitUntil(
      async () => !(await $('#boot-splash').isExisting()),
      { timeout: 60_000, timeoutMsg: 'Splash de boot não sumiu — syncOrg não completou' },
    )
    // Boot concluído: ou PlaylistDetail carregou (botão "Adicionar seção"),
    // ou redirecionou pra lista de cultos. waitForExist curto pra tolerar o
    // load() async do PlaylistDetail logo após o splash sumir.
    try {
      await $('button*=Adicionar seção').waitForExist({ timeout: 10_000 })
      return
    } catch {
      // Redirecionou → playlist ainda não commitada. O syncOrg deste boot
      // já a puxou; a próxima tentativa acha. Folga e re-tenta.
      await new Promise((r) => setTimeout(r, 1_500))
    }
  }
  throw new Error(`PlaylistDetail de ${playlistId} nunca carregou (playlist não sincronizou)`)
}
