import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useModalDismiss } from './useModalDismiss.js'

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
}

describe('useModalDismiss', () => {
  it('Esc fecha o modal', () => {
    const onClose = vi.fn()
    renderHook(() => useModalDismiss({ onClose, canDismissOutside: true }))
    pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc NÃO fecha durante operação (busy)', () => {
    const onClose = vi.fn()
    renderHook(() => useModalDismiss({ onClose, canDismissOutside: true, busy: true }))
    pressEscape()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc fecha mesmo com formulário preenchido (canDismissOutside=false)', () => {
    const onClose = vi.fn()
    renderHook(() => useModalDismiss({ onClose, canDismissOutside: false }))
    pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clique-fora fecha quando canDismissOutside=true', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useModalDismiss({ onClose, canDismissOutside: true }))
    result.current.onBackdropClick()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clique-fora NÃO fecha quando há dados (canDismissOutside=false)', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useModalDismiss({ onClose, canDismissOutside: false }))
    result.current.onBackdropClick()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clique-fora NÃO fecha durante operação (busy)', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useModalDismiss({ onClose, canDismissOutside: true, busy: true }))
    result.current.onBackdropClick()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc NÃO fecha quando enabled=false (modal fechado)', () => {
    const onClose = vi.fn()
    renderHook(() => useModalDismiss({ onClose, canDismissOutside: true, enabled: false }))
    pressEscape()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clique-fora NÃO fecha quando enabled=false', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useModalDismiss({ onClose, canDismissOutside: true, enabled: false }))
    result.current.onBackdropClick()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('volta a fechar quando enabled passa de false pra true', () => {
    const onClose = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) => useModalDismiss({ onClose, canDismissOutside: true, enabled }),
      { initialProps: { enabled: false } },
    )
    pressEscape()
    expect(onClose).not.toHaveBeenCalled()
    rerender({ enabled: true })
    pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('remove o listener de keydown no unmount', () => {
    const onClose = vi.fn()
    const { unmount } = renderHook(() => useModalDismiss({ onClose, canDismissOutside: true }))
    unmount()
    pressEscape()
    expect(onClose).not.toHaveBeenCalled()
  })
})
