import { describe, it, expect, vi, beforeEach } from 'vitest'

const show = vi.fn().mockResolvedValue(undefined)
const unminimize = vi.fn().mockResolvedValue(undefined)
const setFocus = vi.fn().mockResolvedValue(undefined)

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ show, unminimize, setFocus }),
}))

import { markRelaunchForFocus, focusIfRelaunched } from './post-relaunch-focus.js'

const FLAG = 'leviticus_relaunch_focus_pending'

describe('post-relaunch-focus', () => {
  beforeEach(() => {
    localStorage.clear()
    show.mockClear()
    unminimize.mockClear()
    setFocus.mockClear()
  })

  it('markRelaunchForFocus seta a flag em localStorage', () => {
    markRelaunchForFocus()
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('focusIfRelaunched é no-op quando a flag não está setada', async () => {
    await focusIfRelaunched()
    expect(setFocus).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
    expect(unminimize).not.toHaveBeenCalled()
  })

  it('focusIfRelaunched consome a flag e foca a janela', async () => {
    markRelaunchForFocus()
    await focusIfRelaunched()
    expect(localStorage.getItem(FLAG)).toBeNull()
    expect(show).toHaveBeenCalledOnce()
    expect(unminimize).toHaveBeenCalledOnce()
    expect(setFocus).toHaveBeenCalledOnce()
  })

  it('focusIfRelaunched não foca duas vezes em boots subsequentes', async () => {
    markRelaunchForFocus()
    await focusIfRelaunched()
    await focusIfRelaunched()
    expect(setFocus).toHaveBeenCalledOnce()
  })

  it('focusIfRelaunched não lança se setFocus falhar', async () => {
    markRelaunchForFocus()
    setFocus.mockRejectedValueOnce(new Error('window destroyed'))
    await expect(focusIfRelaunched()).resolves.toBeUndefined()
  })
})
