import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePrefetchRoute } from './usePrefetchRoute.js'

// ---- mocks ----

const mockSelect = vi.fn()
const mockGetDb = vi.fn()

vi.mock('./db.js', () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}))

// localStorage stub
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// ---- helpers ----

function setupDb() {
  mockGetDb.mockResolvedValue({ select: mockSelect })
  mockSelect.mockResolvedValue([])
}

function setPrefetchOrgId(id = 'org-123') {
  localStorage.setItem('leviticus_org_id', id)
}

async function flush() {
  await new Promise(r => setTimeout(r, 0))
}

// ---- tests ----

describe('usePrefetchRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setupDb()
    setPrefetchOrgId()
  })

  it('chama a query da rota library na primeira vez', async () => {
    const { result } = renderHook(() => usePrefetchRoute())
    const { prefetch } = result.current

    await act(async () => {
      prefetch('library')
      await flush()
    })

    expect(mockGetDb).toHaveBeenCalledTimes(1)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockSelect.mock.calls[0][0]).toContain('songs')
  })

  it('chama a query da rota playlists na primeira vez', async () => {
    const { result } = renderHook(() => usePrefetchRoute())
    const { prefetch } = result.current

    await act(async () => {
      prefetch('playlists')
      await flush()
    })

    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockSelect.mock.calls[0][0]).toContain('playlists')
  })

  it('chama a query da rota groups na primeira vez', async () => {
    const { result } = renderHook(() => usePrefetchRoute())
    const { prefetch } = result.current

    await act(async () => {
      prefetch('groups')
      await flush()
    })

    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockSelect.mock.calls[0][0]).toContain('groups')
  })

  it('não duplica query se chamado 2x para a mesma rota', async () => {
    const { result } = renderHook(() => usePrefetchRoute())
    const { prefetch } = result.current

    await act(async () => {
      prefetch('library')
      prefetch('library')
      await flush()
    })

    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('silencia erros sem propagar', async () => {
    mockGetDb.mockRejectedValue(new Error('DB offline'))
    const { result } = renderHook(() => usePrefetchRoute())
    const { prefetch } = result.current

    let threw = false
    try {
      await act(async () => {
        prefetch('library')
        await flush()
      })
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
  })

  it('não faz query se orgId não estiver definido', async () => {
    localStorage.clear()
    const { result } = renderHook(() => usePrefetchRoute())
    const { prefetch } = result.current

    await act(async () => {
      prefetch('library')
      await flush()
    })

    expect(mockGetDb).not.toHaveBeenCalled()
  })

  it('ignora routeKey desconhecida sem lançar', async () => {
    const { result } = renderHook(() => usePrefetchRoute())
    const { prefetch } = result.current

    let threw = false
    try {
      await act(async () => {
        prefetch('unknown-route')
        await flush()
      })
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
    expect(mockGetDb).not.toHaveBeenCalled()
  })
})
