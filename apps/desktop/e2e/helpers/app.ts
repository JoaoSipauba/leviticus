// apps/desktop/e2e/helpers/app.ts
//
// App-lifecycle helpers. The WebDriver service handles launching/quitting
// the actual app process — these helpers cover ancillary state.

import fs from 'node:fs/promises'
import { platform } from 'node:os'
import path from 'node:path'
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
