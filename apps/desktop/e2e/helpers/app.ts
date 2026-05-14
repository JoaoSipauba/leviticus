// apps/desktop/e2e/helpers/app.ts
//
// App-lifecycle helpers. The WebDriver service handles launching/quitting
// the actual app process — these helpers cover ancillary state.

import fs from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localSqliteDbPath, screenshotsDir } from './env.js'

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
export async function installYtDlpMock(): Promise<void> {
  const binDir = appLocalBinDir()
  await fs.mkdir(binDir, { recursive: true })
  const fixtureSrc = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/fake-yt-dlp.sh'
  )
  const dest = path.join(binDir, 'yt-dlp')
  await fs.copyFile(fixtureSrc, dest)
  await fs.chmod(dest, 0o755)
  // Start in happy mode by default.
  await setYtDlpMockMode('happy')
}

/** Writes /tmp/fake-yt-dlp.mode — read by fake-yt-dlp.sh on each invocation. */
export async function setYtDlpMockMode(
  mode: 'happy' | 'fail-metadata' | 'fail-download'
): Promise<void> {
  await fs.writeFile('/tmp/fake-yt-dlp.mode', mode, 'utf-8')
}
