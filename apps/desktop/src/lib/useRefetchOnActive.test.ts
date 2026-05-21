import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRefetchOnActive } from './useRefetchOnActive.js'
import { useUIStore } from '../store/ui.js'

describe('useRefetchOnActive', () => {
  it('não chama refetch na primeira renderização', () => {
    const refetch = vi.fn()
    renderHook(({ active }) => useRefetchOnActive(active, refetch), {
      initialProps: { active: true },
    })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('chama refetch quando active passa de false pra true', () => {
    const refetch = vi.fn()
    const { rerender } = renderHook(
      ({ active }) => useRefetchOnActive(active, refetch),
      { initialProps: { active: false } },
    )
    expect(refetch).not.toHaveBeenCalled()
    rerender({ active: true })
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('não chama refetch quando active passa de true pra false', () => {
    const refetch = vi.fn()
    const { rerender } = renderHook(
      ({ active }) => useRefetchOnActive(active, refetch),
      { initialProps: { active: true } },
    )
    rerender({ active: false })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('chama a versão mais recente de refetch', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ active, refetch }) => useRefetchOnActive(active, refetch),
      { initialProps: { active: false, refetch: first } },
    )
    rerender({ active: true, refetch: second })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('revalida quando o sync reativo ticka (librarySeed) e a aba está ativa', () => {
    const refetch = vi.fn()
    renderHook(() => useRefetchOnActive(true, refetch))
    expect(refetch).not.toHaveBeenCalled()
    act(() => useUIStore.getState().bumpLibrary())
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('NÃO revalida num tick de sync se a aba está inativa', () => {
    const refetch = vi.fn()
    renderHook(() => useRefetchOnActive(false, refetch))
    act(() => useUIStore.getState().bumpLibrary())
    expect(refetch).not.toHaveBeenCalled()
  })
})
