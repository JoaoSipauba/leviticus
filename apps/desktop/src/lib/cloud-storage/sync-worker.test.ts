import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./pending-queue.js', () => ({
  listPendingBackupSongs: vi.fn().mockResolvedValue([]),
  countPendingBackup: vi.fn().mockResolvedValue(0),
}))
vi.mock('./upload-song.js', () => ({
  uploadSongToDrive: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./status.js', () => ({
  setBackupStatus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../ytdlp.js', () => ({
  findSongFile: vi.fn().mockResolvedValue('/local/audio.mp3'),
}))

import {
  startSyncWorker, stopSyncWorker,
  startInitialSync, getInitialSyncProgress, subscribeInitialSyncProgress,
  _runPassForTest, _resetRetryStateForTest, isTransientError, isInvalidGrantError,
} from './sync-worker.js'
import { listPendingBackupSongs } from './pending-queue.js'
import { uploadSongToDrive } from './upload-song.js'
import { setBackupStatus } from './status.js'
import { useIntegrationsStore } from '../../store/integrations.js'

// Edge function propaga o erro pela ProviderError e o client transforma em
// `Error & {code: 'invalid_grant'}`. Helper pra simular esse shape nos testes.
function invalidGrantError(): Error {
  const e = new Error('[google_drive] invalid_grant: Refresh failed: {"error":"invalid_grant"}') as Error & { code: string }
  e.code = 'invalid_grant'
  return e
}

// Helper pra simular offline/online. jsdom default é true.
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('sync-worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setOnline(true)
  })

  afterEach(() => {
    stopSyncWorker()
    vi.useRealTimers()
    setOnline(true) // restaura pra próximos testes
  })

  it('startSyncWorker dispara primeira execução imediatamente', async () => {
    vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
      { id: 's1', title: 'A', artist: 'X', backup_status: 'pending', original_format: 'mp3', cloud_file_id: null },
    ])
    startSyncWorker('org-1', { status: 'connected' })
    // Tick microtasks pra completar
    await vi.runOnlyPendingTimersAsync()
    expect(listPendingBackupSongs).toHaveBeenCalledWith('org-1')
    expect(uploadSongToDrive).toHaveBeenCalledWith(expect.objectContaining({
      songId: 's1',
    }))
  })

  it('NÃO sobe quando Drive desconectado', async () => {
    vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
      { id: 's1', title: 'A', artist: 'X', backup_status: 'pending', original_format: 'mp3', cloud_file_id: null },
    ])
    startSyncWorker('org-1', { status: 'disconnected' })
    await vi.runOnlyPendingTimersAsync()
    expect(uploadSongToDrive).not.toHaveBeenCalled()
  })

  describe('backoff exponencial (issue #45)', () => {
    beforeEach(() => {
      _resetRetryStateForTest()
      vi.useRealTimers()
    })

    afterEach(() => {
      // Restaura implementação default do uploadSongToDrive — mockRejectedValue
      // (sem "Once") sobrevive a clearAllMocks. Sem restore, próximos describes
      // herdam o "rejeitar tudo".
      vi.mocked(uploadSongToDrive).mockReset().mockResolvedValue(undefined)
    })

    it('isTransientError: 429, 5xx, network errors são transient', () => {
      expect(isTransientError(new Error('429 Too Many Requests'))).toBe(true)
      expect(isTransientError(new Error('HTTP 503 Service Unavailable'))).toBe(true)
      expect(isTransientError(new Error('network timeout'))).toBe(true)
      expect(isTransientError(new Error('ECONNRESET'))).toBe(true)
      expect(isTransientError(new Error('fetch failed'))).toBe(true)
    })

    it('isTransientError: 4xx (exceto 429) são permanent', () => {
      expect(isTransientError(new Error('403 Forbidden'))).toBe(false)
      expect(isTransientError(new Error('404 Not Found'))).toBe(false)
      expect(isTransientError(new Error('413 Payload Too Large'))).toBe(false)
      expect(isTransientError(new Error('400 Bad Request'))).toBe(false)
    })

    it('após falha transient, song fica em backoff e é pulada no próximo pass', async () => {
      const songs = [{ id: 's1', title: 'A', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null }]
      vi.mocked(listPendingBackupSongs).mockResolvedValue(songs)
      vi.mocked(uploadSongToDrive).mockRejectedValueOnce(new Error('429 Rate limit'))

      // Pass 1 — falha com 429, song entra em backoff
      await _runPassForTest('org-1', 'connected')
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)

      // Pass 2 — imediato — deve pular a song por causa do backoff
      await _runPassForTest('org-1', 'connected')
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1) // não cresceu
    })

    it('falha permanent NÃO entra em retry (entra em estado terminal)', async () => {
      const songs = [{ id: 's1', title: 'A', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null }]
      vi.mocked(listPendingBackupSongs).mockResolvedValue(songs)
      vi.mocked(uploadSongToDrive).mockRejectedValue(new Error('403 Forbidden'))

      await _runPassForTest('org-1', 'connected')
      await _runPassForTest('org-1', 'connected')
      await _runPassForTest('org-1', 'connected')

      // Permanent: só tentou uma vez (subsequentes foram puladas)
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)
    })

    it('sucesso limpa o retry state da song', async () => {
      const songs = [{ id: 's1', title: 'A', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null }]
      vi.mocked(listPendingBackupSongs).mockResolvedValue(songs)
      vi.mocked(uploadSongToDrive)
        .mockRejectedValueOnce(new Error('429'))
        .mockResolvedValueOnce(undefined)

      await _runPassForTest('org-1', 'connected')
      // Limpa backoff manualmente pra simular tempo passando
      _resetRetryStateForTest()
      await _runPassForTest('org-1', 'connected')

      expect(uploadSongToDrive).toHaveBeenCalledTimes(2)
    })
  })

  describe('dedup entre devices (issue #47)', () => {
    beforeEach(() => {
      _resetRetryStateForTest()
      vi.useRealTimers()
    })

    it('runPass: skip upload quando song já tem cloud_file_id (outro device subiu)', async () => {
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
        { id: 's1', title: 'A', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: 'drive-file-from-A' },
      ])
      await _runPassForTest('org-1', 'connected')
      expect(uploadSongToDrive).not.toHaveBeenCalled()
      // Reconcilia estado local pra 'uploaded'
      expect(setBackupStatus).toHaveBeenCalledWith('s1', 'uploaded')
    })

    it('runPass: sobe normalmente quando cloud_file_id é null (nenhum device subiu ainda)', async () => {
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
        { id: 's2', title: 'B', artist: 'Y', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null },
      ])
      await _runPassForTest('org-1', 'connected')
      expect(uploadSongToDrive).toHaveBeenCalledWith(expect.objectContaining({ songId: 's2' }))
      expect(setBackupStatus).not.toHaveBeenCalled()
    })

    it('startInitialSync: skip songs com cloud_file_id; sobe apenas as órfãs locais', async () => {
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
        { id: 'a', title: 'A', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: 'remote-a' },
        { id: 'b', title: 'B', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null },
        { id: 'c', title: 'C', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: 'remote-c' },
      ])
      await startInitialSync('org-1')
      // Só 'b' faz upload — 'a' e 'c' são reconciliados
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)
      expect(uploadSongToDrive).toHaveBeenCalledWith(expect.objectContaining({ songId: 'b' }))
      expect(setBackupStatus).toHaveBeenCalledWith('a', 'uploaded')
      expect(setBackupStatus).toHaveBeenCalledWith('c', 'uploaded')
    })
  })

  it('offline: runPass pula sem chamar listPendingBackupSongs nem uploadSongToDrive (issue #46)', async () => {
    setOnline(false)
    vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
      { id: 's1', title: 'A', artist: 'X', backup_status: 'pending', original_format: 'mp3', cloud_file_id: null },
    ])
    startSyncWorker('org-1', { status: 'connected' })
    await vi.runOnlyPendingTimersAsync()
    expect(listPendingBackupSongs).not.toHaveBeenCalled()
    expect(uploadSongToDrive).not.toHaveBeenCalled()
  })

  it('stopSyncWorker para de re-rodar', async () => {
    startSyncWorker('org-1', { status: 'connected' })
    await vi.runOnlyPendingTimersAsync()
    stopSyncWorker()
    vi.mocked(listPendingBackupSongs).mockClear()
    // Avança 10 min sem permitir microtasks → não deve rodar
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(listPendingBackupSongs).not.toHaveBeenCalled()
  })

  describe('initial sync', () => {
    beforeEach(() => {
      // Real timers neste describe (initial sync usa awaits puros, não setInterval)
      vi.useRealTimers()
    })

    it('startInitialSync sobe TODAS as músicas pendentes em paralelo (até 3 concorrentes)', async () => {
      const songs = Array.from({ length: 7 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null,
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)

      await startInitialSync('org-1')

      expect(uploadSongToDrive).toHaveBeenCalledTimes(7)
      const ids = vi.mocked(uploadSongToDrive).mock.calls.map((c) => c[0].songId).sort()
      expect(ids).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6'])
    })

    it('reporta progresso via subscribe (uploaded incrementa a cada música)', async () => {
      const songs = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null,
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)

      const updates: Array<{ total: number; uploaded: number; inProgress: boolean }> = []
      const unsub = subscribeInitialSyncProgress((s) => updates.push({
        total: s.total, uploaded: s.uploaded, inProgress: s.inProgress,
      }))

      await startInitialSync('org-1')
      unsub()

      // Primeiro update sinaliza inProgress=true (set síncrono antes do await).
      expect(updates[0]).toMatchObject({ inProgress: true })
      // Em algum momento total chega a 3 (depois do list+findSongFile).
      expect(updates.some((u) => u.total === 3 && u.inProgress)).toBe(true)
      // Final: uploaded=3, inProgress=false.
      const last = updates[updates.length - 1]
      expect(last).toMatchObject({ uploaded: 3, inProgress: false })
    })

    it('quando upload falha, incrementa failed mas continua o resto', async () => {
      const songs = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null,
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)
      vi.mocked(uploadSongToDrive)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined)

      await startInitialSync('org-1')

      const final = getInitialSyncProgress()
      expect(final.uploaded).toBe(2)
      expect(final.failed).toBe(1)
      expect(final.inProgress).toBe(false)
    })

    it('chamadas concorrentes são idempotentes (segunda chamada vira no-op)', async () => {
      const songs = [{ id: 's0', title: 'T', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null }]
      vi.mocked(listPendingBackupSongs).mockResolvedValue(songs)

      const p1 = startInitialSync('org-1')
      const p2 = startInitialSync('org-1')
      await Promise.all([p1, p2])

      // Deve ter subido a música só uma vez (a segunda chamada virou no-op)
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)
    })

    it('offline: startInitialSync aborta cedo sem chamar uploadSongToDrive (issue #46)', async () => {
      setOnline(false)
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
        { id: 's0', title: 'T', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null },
      ])
      await startInitialSync('org-1')
      expect(uploadSongToDrive).not.toHaveBeenCalled()
      // Estado deve ficar limpo (não trava em inProgress)
      expect(getInitialSyncProgress().inProgress).toBe(false)
    })

    it('pula músicas sem arquivo local (esses sobem por outro device)', async () => {
      const songs = [
        { id: 's0', title: 'T0', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null },
        { id: 's1', title: 'T1', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null },
      ]
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)
      const { findSongFile } = await import('../ytdlp.js')
      vi.mocked(findSongFile)
        .mockResolvedValueOnce('/local/s0.mp3')
        .mockResolvedValueOnce(null)

      await startInitialSync('org-1')

      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)
      expect(uploadSongToDrive).toHaveBeenCalledWith(expect.objectContaining({ songId: 's0' }))
    })
  })

  describe('invalid_grant: token expirado/revogado', () => {
    beforeEach(() => {
      _resetRetryStateForTest()
      vi.useRealTimers()
      // Reset store status entre testes — Zustand é singleton; sem reset,
      // o teste anterior pode ter deixado em 'token_expired'.
      useIntegrationsStore.getState().setStatus('connected')
    })

    afterEach(() => {
      vi.mocked(uploadSongToDrive).mockReset().mockResolvedValue(undefined)
    })

    it('isInvalidGrantError detecta pelo código e pela mensagem', () => {
      expect(isInvalidGrantError(invalidGrantError())).toBe(true)
      expect(isInvalidGrantError(new Error('invalid_grant'))).toBe(true)
      expect(isInvalidGrantError(new Error('429 Rate limit'))).toBe(false)
      expect(isInvalidGrantError(null)).toBe(false)
      expect(isInvalidGrantError(undefined)).toBe(false)
    })

    it('runPass: invalid_grant aborta o pass e marca status token_expired (sem Sentry)', async () => {
      const songs = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null,
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)
      vi.mocked(uploadSongToDrive).mockRejectedValue(invalidGrantError())

      await _runPassForTest('org-1', 'connected')

      // Tentou só a primeira música — abortou ao detectar invalid_grant.
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)
      expect(useIntegrationsStore.getState().status).toBe('token_expired')
    })

    it('runPass: invalid_grant NÃO marca a song como permanent (preserva retry após reconectar)', async () => {
      const songs = [{ id: 's1', title: 'A', artist: 'X', backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null }]
      vi.mocked(listPendingBackupSongs).mockResolvedValue(songs)
      vi.mocked(uploadSongToDrive)
        .mockRejectedValueOnce(invalidGrantError())
        .mockResolvedValueOnce(undefined)

      // Pass 1 — invalid_grant aborta.
      await _runPassForTest('org-1', 'connected')
      expect(uploadSongToDrive).toHaveBeenCalledTimes(1)

      // Pass 2 — usuário reconectou; a song deve voltar a ser tentada
      // (não ficou em backoff/permanent).
      await _runPassForTest('org-1', 'connected')
      expect(uploadSongToDrive).toHaveBeenCalledTimes(2)
    })

    it('startInitialSync: invalid_grant aborta todos os workers e marca status token_expired', async () => {
      const songs = Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`, title: `T${i}`, artist: 'X',
        backup_status: 'pending' as const, original_format: 'mp3', cloud_file_id: null,
      }))
      vi.mocked(listPendingBackupSongs).mockResolvedValueOnce(songs)
      vi.mocked(uploadSongToDrive).mockRejectedValue(invalidGrantError())

      await startInitialSync('org-1')

      expect(useIntegrationsStore.getState().status).toBe('token_expired')
      // Workers param ao detectar o flag — não chega a tentar todas as 10.
      // Concorrência = 3, então no pior caso 3 tentaram antes do flag pegar.
      expect(vi.mocked(uploadSongToDrive).mock.calls.length).toBeLessThanOrEqual(3)
      // E o estado de progresso não fica preso em inProgress=true.
      expect(getInitialSyncProgress().inProgress).toBe(false)
    })
  })
})
