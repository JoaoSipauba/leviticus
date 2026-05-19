import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── polyfill Blob.arrayBuffer for jsdom ──────────────────────────────────
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

// ─── hoisted refs ──────────────────────────────────────────────────────────

const refs = vi.hoisted(() => ({
  song: null as null | {
    id: string; org_id: string; title: string; artist: string
    youtube_url: string; thumbnail_url: null | string; duration_seconds: number
    added_by: string; song_type: string
  },
  online: true as boolean,
}))

const { rpcMock, syncOrgMock, bumpLibraryMock, uiStoreState } = vi.hoisted(() => {
  const rpcMock = vi.fn()
  const syncOrgMock = vi.fn().mockResolvedValue(undefined)
  const bumpLibraryMock = vi.fn()
  // Mantém referência estável entre renders pra não disparar useEffect infinito.
  // tests mutam .songToEdit antes do render via beforeEach.
  const uiStoreState = {
    songToEdit: null as any,
    songToEditGroups: ['group-1'] as string[],
    closeEditSong: vi.fn(),
    bumpLibrary: bumpLibraryMock,
  }
  return { rpcMock, syncOrgMock, bumpLibraryMock, uiStoreState }
})

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../store/ui.js', () => ({
  useUIStore: () => uiStoreState,
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: rpcMock,
  },
}))

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([{ id: 'group-1', name: 'Ministério' }]),
  }),
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => refs.online,
}))

// tauri plugin stubs (needed so transitive imports don't block module resolution)
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))

// ─── import component after mocks ─────────────────────────────────────────

import { EditSongModal } from './EditSongModal.js'

// ─── test data ─────────────────────────────────────────────────────────────

const baseSong = {
  id: 'song-1',
  org_id: 'org-1',
  title: 'Original',
  artist: 'Artist',
  youtube_url: 'https://youtube.com/watch?v=abc',
  thumbnail_url: null,
  duration_seconds: 180,
  added_by: 'user-1',
  song_type: 'normal',
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('EditSongModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.song = null
    refs.online = true
    uiStoreState.songToEdit = null
    uiStoreState.songToEditGroups = ['group-1']
    localStorage.setItem('leviticus_org_id', 'org-1')
    rpcMock.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('não renderiza quando songToEdit é null', () => {
    uiStoreState.songToEdit = null
    render(<EditSongModal />)
    expect(screen.queryByText('Editar música')).not.toBeInTheDocument()
  })

  it('inicializa inputs com os campos da música (title, artist, song_type)', () => {
    uiStoreState.songToEdit = { ...baseSong }
    render(<EditSongModal />)

    expect(screen.getByText('Editar música')).toBeInTheDocument()

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(inputs.find((i) => i.value === 'Original')).toBeTruthy()
    expect(inputs.find((i) => i.value === 'Artist')).toBeTruthy()

    // song_type = 'normal' → Normal button should be rendered
    expect(screen.getByRole('button', { name: /Normal/i })).toBeInTheDocument()
  })

  it('offline desabilita o botão Salvar com title "Sem conexão" e NÃO chama supabase.rpc', () => {
    uiStoreState.songToEdit = { ...baseSong }
    refs.online = false

    render(<EditSongModal />)
    expect(screen.getByText('Editar música')).toBeInTheDocument()

    const saveBtn = screen.getByRole('button', { name: /Salvar/i })
    expect(saveBtn).toBeDisabled()
    expect(saveBtn).toHaveAttribute('title', 'Sem conexão')

    // Tentar clicar num botão desabilitado: jsdom ignora o evento (browser behavior)
    fireEvent.click(saveBtn)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('clicar Salvar com título vazio mostra erro "O título não pode estar vazio." e NÃO chama supabase.rpc', async () => {
    uiStoreState.songToEdit = { ...baseSong }
    refs.online = true

    render(<EditSongModal />)
    expect(screen.getByText('Editar música')).toBeInTheDocument()

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    const titleInput = inputs.find((i) => i.value === 'Original')!
    await userEvent.clear(titleInput)

    await userEvent.click(screen.getByRole('button', { name: /Salvar/i }))

    expect(screen.getByText('O título não pode estar vazio.')).toBeInTheDocument()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('fluxo feliz: edita title, clica Salvar → supabase.rpc("update_song") + syncOrg + bumpLibrary chamados', async () => {
    uiStoreState.songToEdit = { ...baseSong }
    refs.online = true

    render(<EditSongModal />)
    expect(screen.getByText('Editar música')).toBeInTheDocument()

    // Wait for groups to load (useEffect async getDb call)
    await waitFor(() => {
      expect(screen.getByText('Ministério')).toBeInTheDocument()
    })

    // Edit the title
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    const titleInput = inputs.find((i) => i.value === 'Original')!
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Novo Título')

    await userEvent.click(screen.getByRole('button', { name: /Salvar/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('update_song', expect.objectContaining({
        p_song_id: 'song-1',
        p_org_id: 'org-1',
        p_title: 'Novo Título',
        p_artist: 'Artist',
        p_song_type: 'normal',
        p_group_ids: ['group-1'],
      }))
    })

    await waitFor(() => {
      expect(syncOrgMock).toHaveBeenCalledWith('org-1')
      expect(bumpLibraryMock).toHaveBeenCalled()
    })

    // Modal starts closing (class animate-modal-out applied)
    await waitFor(() => {
      expect(document.querySelector('.animate-modal-out')).toBeTruthy()
    })
  })

  it('erro do rpc mostra "Algo deu errado. Tente novamente." e NÃO chama bumpLibrary', async () => {
    uiStoreState.songToEdit = { ...baseSong }
    refs.online = true
    rpcMock.mockResolvedValue({ error: { code: 'XXXX', message: 'db error' } })

    render(<EditSongModal />)
    expect(screen.getByText('Editar música')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Salvar/i }))

    await waitFor(() => {
      expect(screen.getByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
    })

    expect(syncOrgMock).not.toHaveBeenCalled()
    expect(bumpLibraryMock).not.toHaveBeenCalled()
  })
})
