import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  LibraryFilters,
  applyFilters,
  loadFilters,
  saveFilters,
  hasActiveFilters,
  EMPTY_FILTERS,
  type LibraryFilterState,
} from './LibraryFilters.js'

const ORG = 'org-test'

describe('LibraryFilters — persistência', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loadFilters retorna EMPTY_FILTERS quando não há nada salvo', () => {
    expect(loadFilters(ORG)).toEqual(EMPTY_FILTERS)
  })

  it('saveFilters + loadFilters round-trip preservando campos relevantes', () => {
    const state: LibraryFilterState = {
      groupId: 'grp-1',
      songType: 'playback',
      duration: 'medium',
      recent: '7d',
      backupPending: true, // não persiste (intencional)
    }
    saveFilters(ORG, state)
    const loaded = loadFilters(ORG)
    expect(loaded.groupId).toBe('grp-1')
    expect(loaded.songType).toBe('playback')
    expect(loaded.duration).toBe('medium')
    expect(loaded.recent).toBe('7d')
    // backupPending não persiste (depende de failedCount transitório)
    expect(loaded.backupPending).toBe(false)
  })

  it('loadFilters tolera JSON corrompido (cai pra EMPTY)', () => {
    localStorage.setItem('leviticus_lib_filters_' + ORG, '{garbage')
    expect(loadFilters(ORG)).toEqual(EMPTY_FILTERS)
  })

  it('saveFilters/loadFilters com orgId vazio são no-op', () => {
    saveFilters('', { ...EMPTY_FILTERS, groupId: 'x' })
    expect(loadFilters('')).toEqual(EMPTY_FILTERS)
  })
})

describe('hasActiveFilters', () => {
  it('false em EMPTY_FILTERS', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })

  it('true quando qualquer campo está setado', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, groupId: 'g' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, songType: 'vs' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, duration: 'short' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, recent: '30d' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, backupPending: true })).toBe(true)
  })
})

describe('applyFilters', () => {
  const now = Date.now()
  const songs = [
    { id: 'a', song_type: 'normal' as const, duration_seconds: 180, created_at: new Date(now - 3 * 86400000).toISOString(), backup_status: 'uploaded' },
    { id: 'b', song_type: 'playback' as const, duration_seconds: 300, created_at: new Date(now - 10 * 86400000).toISOString(), backup_status: 'failed' },
    { id: 'c', song_type: 'instrumental' as const, duration_seconds: 420, created_at: new Date(now - 60 * 86400000).toISOString(), backup_status: 'pending' },
  ]
  const songGroupMap = new Map<string, string[]>([
    ['a', ['grp-1', 'grp-2']],
    ['b', ['grp-1']],
    ['c', []],
  ])

  it('sem filtros, retorna todas', () => {
    expect(applyFilters(songs, songGroupMap, EMPTY_FILTERS).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('filtra por groupId — só músicas com aquele grupo', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, groupId: 'grp-2' })
    expect(out.map((s) => s.id)).toEqual(['a'])
  })

  it('filtra por songType exato', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, songType: 'playback' })
    expect(out.map((s) => s.id)).toEqual(['b'])
  })

  it('filtra por duração curta (<4min)', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, duration: 'short' })
    expect(out.map((s) => s.id)).toEqual(['a'])
  })

  it('filtra por duração média (4-6min)', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, duration: 'medium' })
    expect(out.map((s) => s.id)).toEqual(['b'])
  })

  it('filtra por duração longa (>6min)', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, duration: 'long' })
    expect(out.map((s) => s.id)).toEqual(['c'])
  })

  it('filtra por recente 7d — só músicas dos últimos 7 dias', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, recent: '7d' })
    expect(out.map((s) => s.id)).toEqual(['a'])
  })

  it('filtra por recente 30d', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, recent: '30d' })
    expect(out.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('filtra por backupPending — só backup_status=failed', () => {
    const out = applyFilters(songs, songGroupMap, { ...EMPTY_FILTERS, backupPending: true })
    expect(out.map((s) => s.id)).toEqual(['b'])
  })

  it('múltiplos filtros são intersecção (AND)', () => {
    const out = applyFilters(songs, songGroupMap, {
      ...EMPTY_FILTERS,
      groupId: 'grp-1',
      songType: 'playback',
    })
    expect(out.map((s) => s.id)).toEqual(['b'])
  })

  it('preserva o tipo concreto da song (genérico)', () => {
    const richSongs = songs.map((s) => ({ ...s, title: `Music ${s.id}` }))
    const out = applyFilters(richSongs, songGroupMap, EMPTY_FILTERS)
    // Type check via property access — title só existe no tipo rico
    expect(out[0].title).toBe('Music a')
  })
})

describe('LibraryFilters — UI', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function setup(overrides: Partial<{ state: LibraryFilterState; failedBackupCount: number }> = {}) {
    const onChange = vi.fn()
    const state = overrides.state ?? EMPTY_FILTERS
    const failedBackupCount = overrides.failedBackupCount ?? 0
    render(
      <LibraryFilters
        state={state}
        onChange={onChange}
        groups={[
          { id: 'grp-1', name: 'Adoração' },
          { id: 'grp-2', name: 'Louvor' },
        ]}
        failedBackupCount={failedBackupCount}
      />,
    )
    return { onChange }
  }

  it('renderiza chip Ministério quando há grupos', () => {
    setup()
    expect(screen.getByText('Ministério')).toBeInTheDocument()
  })

  it('não renderiza chip Ministério quando não há grupos', () => {
    const onChange = vi.fn()
    render(
      <LibraryFilters
        state={EMPTY_FILTERS}
        onChange={onChange}
        groups={[]}
        failedBackupCount={0}
      />,
    )
    expect(screen.queryByText('Ministério')).not.toBeInTheDocument()
  })

  it('renderiza chips Tipo, Duração, Recente sempre', () => {
    setup()
    expect(screen.getByText('Tipo')).toBeInTheDocument()
    expect(screen.getByText('Duração')).toBeInTheDocument()
    expect(screen.getByText('Adicionada recentemente')).toBeInTheDocument()
  })

  it('chip Sem backup só aparece quando há failedCount > 0', () => {
    setup({ failedBackupCount: 0 })
    expect(screen.queryByText(/Sem backup/)).not.toBeInTheDocument()
  })

  it('chip Sem backup renderiza com contagem quando há failed', () => {
    setup({ failedBackupCount: 3 })
    expect(screen.getByText(/Sem backup \(3\)/)).toBeInTheDocument()
  })

  it('botão Limpar filtros só aparece quando há filtro ativo', () => {
    setup()
    expect(screen.queryByTestId('clear-filters')).not.toBeInTheDocument()
  })

  it('Limpar filtros aparece e chama onChange com EMPTY_FILTERS', async () => {
    const { onChange } = setup({ state: { ...EMPTY_FILTERS, songType: 'normal' } })
    const clearBtn = screen.getByTestId('clear-filters')
    expect(clearBtn).toBeInTheDocument()
    await userEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS)
  })

  it('clicar no chip Tipo abre dropdown com opções localizadas', async () => {
    setup()
    await userEvent.click(screen.getByText('Tipo'))
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText('Playback')).toBeInTheDocument()
    expect(screen.getByText('Instrumental')).toBeInTheDocument()
    expect(screen.getByText('VS')).toBeInTheDocument()
  })

  it('selecionar opção do dropdown chama onChange com o valor', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByText('Tipo'))
    await userEvent.click(screen.getByText('Playback'))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, songType: 'playback' })
  })
})
