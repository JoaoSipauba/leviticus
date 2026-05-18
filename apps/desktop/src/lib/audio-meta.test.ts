import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { findSongFileMock, dbExecuteMock, supabaseEqMock, supabaseUpdateMock, supabaseFromMock } = vi.hoisted(() => ({
  findSongFileMock: vi.fn(),
  dbExecuteMock: vi.fn().mockResolvedValue(undefined),
  supabaseEqMock: vi.fn().mockResolvedValue({ error: null }),
  supabaseUpdateMock: vi.fn(),
  supabaseFromMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `file://${p}`,
}))

vi.mock('./ytdlp.js', () => ({
  findSongFile: findSongFileMock,
}))

vi.mock('./db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ execute: dbExecuteMock }),
}))

vi.mock('./supabase.js', () => {
  supabaseUpdateMock.mockImplementation(() => ({ eq: supabaseEqMock }))
  supabaseFromMock.mockImplementation(() => ({ update: supabaseUpdateMock }))
  return { supabase: { from: supabaseFromMock } }
})

import { backfillDurationFromFile } from './audio-meta.js'

// Stub HTMLMediaElement em jsdom — sobrescreve o constructor do Audio.
function setupAudioStub(opts: { duration?: number; succeeds: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Audio = class {
    src = ''
    preload = ''
    muted = false
    duration = opts.duration ?? 0
    addEventListener(ev: string, cb: (...args: unknown[]) => void) {
      queueMicrotask(() => {
        const target = opts.succeeds ? 'loadedmetadata' : 'error'
        if (ev === target) cb()
      })
    }
    load() {}
  }
}

describe('backfillDurationFromFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findSongFileMock.mockResolvedValue('/local/song.mp3')
    setupAudioStub({ duration: 240, succeeds: true })
  })

  it('lê duração via HTMLMediaElement, atualiza SQLite + Supabase, retorna valor', async () => {
    const result = await backfillDurationFromFile('song-1')
    expect(result).toBe(240)
    expect(dbExecuteMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE songs SET duration_seconds'),
      [240, 'song-1'],
    )
    expect(supabaseFromMock).toHaveBeenCalledWith('songs')
    expect(supabaseUpdateMock).toHaveBeenCalledWith({ duration_seconds: 240 })
    expect(supabaseEqMock).toHaveBeenCalledWith('id', 'song-1')
  })

  it('retorna null e não atualiza quando arquivo local não existe', async () => {
    findSongFileMock.mockResolvedValueOnce(null)
    const result = await backfillDurationFromFile('song-x')
    expect(result).toBeNull()
    expect(dbExecuteMock).not.toHaveBeenCalled()
    expect(supabaseFromMock).not.toHaveBeenCalled()
  })

  it('retorna null e não atualiza quando HTMLMediaElement falha (error event)', async () => {
    setupAudioStub({ succeeds: false })
    const result = await backfillDurationFromFile('song-broken')
    expect(result).toBeNull()
    expect(dbExecuteMock).not.toHaveBeenCalled()
  })

  it('retorna null quando duração é NaN (arquivo corrompido)', async () => {
    setupAudioStub({ duration: NaN, succeeds: true })
    const result = await backfillDurationFromFile('song-nan')
    expect(result).toBeNull()
  })
})

describe('readDurationFromBlob', () => {
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL
  let createCalls: Blob[]
  let revokeCalls: string[]

  beforeEach(() => {
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    createCalls = []
    revokeCalls = []
    URL.createObjectURL = vi.fn((b: Blob) => {
      createCalls.push(b)
      return `blob:fake#${createCalls.length}`
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn((url: string) => { revokeCalls.push(url) })
    setupAudioStub({ duration: 263, succeeds: true })
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('cria objectURL do Blob, lê duração, revoga o URL no fim', async () => {
    const { readDurationFromBlob } = await import('./audio-meta.js')
    const blob = new Blob([new Uint8Array(1024)], { type: 'audio/mp3' })
    const result = await readDurationFromBlob(blob)

    expect(result).toBe(263)
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toBe(blob)
    expect(revokeCalls).toHaveLength(1)
    expect(revokeCalls[0]).toBe('blob:fake#1')
  })

  it('revoga objectURL mesmo se leitura falhar', async () => {
    setupAudioStub({ succeeds: false })
    const { readDurationFromBlob } = await import('./audio-meta.js')
    const blob = new Blob([new Uint8Array(1)], { type: 'audio/mp3' })
    const result = await readDurationFromBlob(blob)

    expect(result).toBeNull()
    expect(revokeCalls).toHaveLength(1) // URL liberado mesmo em erro
  })
})

describe('backfillMissingDurations (boot-time)', () => {
  let dbSelectMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    dbSelectMock = vi.fn()
    const dbModule = await import('./db.js')
    vi.mocked(dbModule.getDb).mockResolvedValue({
      select: dbSelectMock,
      execute: dbExecuteMock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    findSongFileMock.mockResolvedValue('/local/song.mp3')
    setupAudioStub({ duration: 200, succeeds: true })
  })

  it('retorna 0 quando não há músicas com null duration', async () => {
    dbSelectMock.mockResolvedValueOnce([])
    const { backfillMissingDurations } = await import('./audio-meta.js')
    const result = await backfillMissingDurations('org-1')
    expect(result).toEqual({ filled: 0, total: 0 })
  })

  it('processa N músicas em paralelo (concurrency 3); retorna filled/total', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => ({ id: `song-${i}` }))
    dbSelectMock.mockResolvedValueOnce(ids)
    const { backfillMissingDurations } = await import('./audio-meta.js')
    const result = await backfillMissingDurations('org-1')

    expect(result.total).toBe(5)
    expect(result.filled).toBe(5) // todas com arquivo mockado e duração válida
  })

  it('reconcileAllDurations corrige valores divergentes (>5%), preserva os corretos', async () => {
    // 3 músicas: a) DB=120 file=240 (2x errado), b) DB=200 file=205 (ok ~2%), c) DB=null file=180
    dbSelectMock.mockResolvedValueOnce([
      { id: 'a', duration_seconds: 120 },
      { id: 'b', duration_seconds: 200 },
      { id: 'c', duration_seconds: null },
    ])
    findSongFileMock.mockReset()
    findSongFileMock
      .mockResolvedValueOnce('/a.mp3')
      .mockResolvedValueOnce('/b.mp3')
      .mockResolvedValueOnce('/c.mp3')

    // Audio stub variável por instância (Audio cria 2 listeners — increment
    // por listener vaza index; aqui contamos no constructor).
    let instanceIdx = 0
    const durations = [240, 205, 180]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).Audio = class {
      src = ''
      preload = ''
      muted = false
      duration: number
      constructor() {
        this.duration = durations[instanceIdx++] ?? 0
      }
      addEventListener(ev: string, cb: () => void) {
        queueMicrotask(() => { if (ev === 'loadedmetadata') cb() })
      }
      load() {}
    }

    const { reconcileAllDurations } = await import('./audio-meta.js')
    const result = await reconcileAllDurations('org-1')

    // a (2× errado) e c (null) são atualizadas; b (~2% diff) preservada
    expect(result.updated).toBe(2)
    expect(result.total).toBe(3)
  })

  it('conta apenas as que conseguem preencher (filled <= total)', async () => {
    dbSelectMock.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    // Primeira: sucesso. Segunda: arquivo não encontrado. Terceira: sucesso.
    findSongFileMock.mockReset()
    findSongFileMock
      .mockResolvedValueOnce('/local/a.mp3')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('/local/c.mp3')
    setupAudioStub({ duration: 100, succeeds: true })

    const { backfillMissingDurations } = await import('./audio-meta.js')
    const result = await backfillMissingDurations('org-1')

    expect(result.total).toBe(3)
    expect(result.filled).toBe(2)
  })
})
