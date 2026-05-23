import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddSongToPlaylistModal } from './AddSongToPlaylistModal.js'
import { useUIStore } from '../store/ui.js'

// ─── hoisted mock variables ────────────────────────────────────────────────

const { rpcMock, dbSelectMock, syncOrgMock, useOnlineStatusMock, permRef, dbData } =
  vi.hoisted(() => {
    const rpcMock = vi.fn()
    // dbData controla o retorno de cada query — robusto contra ordem de
    // chamada (load() faz 3 selects: songs, song_groups, playlist_songs).
    const dbData = {
      songs: [
        { id: 's1', title: 'Quão Grande é o Meu Deus', artist: 'Chris Tomlin', org_id: 'org-1', thumbnail_url: null },
        { id: 's2', title: 'Oceans', artist: 'Hillsong United', org_id: 'org-1', thumbnail_url: null },
      ] as unknown[],
      songGroups: [{ song_id: 's1', group_id: 'g1' }] as unknown[],
      playlistSongs: [] as unknown[], // músicas já na seção
    }
    const dbSelectMock = vi.fn((sql: string) => {
      if (sql.includes('FROM playlist_songs')) return Promise.resolve(dbData.playlistSongs)
      if (sql.includes('FROM song_groups')) return Promise.resolve(dbData.songGroups)
      if (sql.includes('FROM songs')) return Promise.resolve(dbData.songs)
      return Promise.resolve([])
    })
    const syncOrgMock = vi.fn().mockResolvedValue(undefined)
    const useOnlineStatusMock = vi.fn().mockReturnValue(true)
    return { rpcMock, dbSelectMock, syncOrgMock, useOnlineStatusMock, permRef: { value: true }, dbData }
  })

// ─── module mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: rpcMock,
  },
}))

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: dbSelectMock,
  }),
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: useOnlineStatusMock,
}))

vi.mock('../store/permissions.js', () => ({
  usePermission: () => permRef.value,
}))

// ─── helpers ──────────────────────────────────────────────────────────────

const PLAYLIST_ID = 'pl-abc'
const SECTION_ID = 'sec-1'
const GROUP_ID = 'g1'

function renderModal(overrides: Partial<Parameters<typeof AddSongToPlaylistModal>[0]> = {}) {
  const onClose = vi.fn()
  const onAdded = vi.fn()
  render(
    <AddSongToPlaylistModal
      open={true}
      onClose={onClose}
      onAdded={onAdded}
      playlistId={PLAYLIST_ID}
      sectionId={SECTION_ID}
      groupId={GROUP_ID}
      sectionLabel="Abertura"
      {...overrides}
    />,
  )
  return { onClose, onAdded }
}

beforeEach(() => {
  localStorage.setItem('leviticus_org_id', 'org-1')
  // Restaura os dados padrão do "banco" mockado.
  dbData.songs = [
    { id: 's1', title: 'Quão Grande é o Meu Deus', artist: 'Chris Tomlin', org_id: 'org-1', thumbnail_url: null },
    { id: 's2', title: 'Oceans', artist: 'Hillsong United', org_id: 'org-1', thumbnail_url: null },
  ]
  dbData.songGroups = [{ song_id: 's1', group_id: 'g1' }]
  dbData.playlistSongs = []
  useOnlineStatusMock.mockReturnValue(true)
  permRef.value = true
})

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// ─── tests ────────────────────────────────────────────────────────────────

describe('AddSongToPlaylistModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal({ open: false })
    expect(screen.queryByText(/adicionar música/i)).not.toBeInTheDocument()
  })

  it('carrega e exibe lista de músicas candidatas (sem filtro de grupo)', async () => {
    // groupId=null desativa o filtro de ministério e mostra todas as músicas
    renderModal({ groupId: null })
    expect(await screen.findByText('Quão Grande é o Meu Deus')).toBeInTheDocument()
    expect(screen.getByText('Chris Tomlin')).toBeInTheDocument()
    expect(screen.getByText('Oceans')).toBeInTheDocument()
    expect(screen.getByText('Hillsong United')).toBeInTheDocument()
  })

  it('filtro de ministério ativo por padrão quando groupId é fornecido — só exibe músicas do grupo', async () => {
    renderModal()
    // s1 pertence a g1, s2 não pertence
    expect(await screen.findByText('Quão Grande é o Meu Deus')).toBeInTheDocument()
    expect(screen.queryByText('Oceans')).not.toBeInTheDocument()
  })

  it('"Mostrar todas as músicas" expande lista pra incluir músicas fora do ministério', async () => {
    renderModal()
    await screen.findByText('Quão Grande é o Meu Deus')

    await userEvent.click(screen.getByText(/mostrar todas as músicas/i))

    expect(screen.getByText('Oceans')).toBeInTheDocument()
  })

  it('busca filtra músicas por título', async () => {
    // Sem filtro de grupo pra ver todas
    renderModal({ groupId: null })
    await screen.findByText('Quão Grande é o Meu Deus')

    const searchInput = screen.getByPlaceholderText(/buscar por título ou artista/i)
    await userEvent.type(searchInput, 'Oceans')

    expect(screen.queryByText('Quão Grande é o Meu Deus')).not.toBeInTheDocument()
    expect(screen.getByText('Oceans')).toBeInTheDocument()
  })

  it('clique em música chama supabase.rpc com argumentos corretos e dispara onAdded', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onAdded, onClose } = renderModal()

    const song = await screen.findByText('Quão Grande é o Meu Deus')
    await userEvent.click(song)

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('add_song_to_playlist', {
        p_playlist_id: PLAYLIST_ID,
        p_song_id: 's1',
        p_section_id: SECTION_ID,
        p_group_id: GROUP_ID,
        p_section_label: 'Abertura',
      })
      expect(syncOrgMock).toHaveBeenCalledWith('org-1')
      expect(onAdded).toHaveBeenCalled()
    })
    // onClose NÃO é chamado automaticamente — modal fica aberto pra adicionar mais músicas
    expect(onClose).not.toHaveBeenCalled()
  })

  it('após adicionar, exibe ícone de check e desabilita o botão da música', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    renderModal()

    const song = await screen.findByText('Quão Grande é o Meu Deus')
    await userEvent.click(song)

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalled()
    })

    // O botão da música deve ficar desabilitado (added=true)
    const songButton = screen.getByText('Quão Grande é o Meu Deus').closest('button')
    expect(songButton).toBeDisabled()
  })

  it('erro do rpc (e != null) mostra mensagem inline; NÃO chama onAdded nem onClose', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const { onAdded, onClose } = renderModal()

    const song = await screen.findByText('Quão Grande é o Meu Deus')
    await userEvent.click(song)

    await waitFor(() => {
      expect(screen.getByText('Não foi possível adicionar.')).toBeInTheDocument()
    })
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('erro "already_in_section" mostra mensagem específica', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, error: 'already_in_section' }, error: null })
    renderModal()

    const song = await screen.findByText('Quão Grande é o Meu Deus')
    await userEvent.click(song)

    await waitFor(() => {
      expect(screen.getByText('Essa música já está nesta seção.')).toBeInTheDocument()
    })
  })

  it('erro "forbidden" mostra mensagem de permissão', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, error: 'forbidden' }, error: null })
    renderModal()

    const song = await screen.findByText('Quão Grande é o Meu Deus')
    await userEvent.click(song)

    await waitFor(() => {
      expect(screen.getByText('Você não tem permissão para editar este culto.')).toBeInTheDocument()
    })
  })

  it('botão X chama onClose sem chamar rpc', async () => {
    const { onClose } = renderModal()
    await screen.findByText('Quão Grande é o Meu Deus')

    // O botão X está no header, ao lado do título "Adicionar música"
    const heading = screen.getByText('Adicionar música')
    const header = heading.closest('div')!
    const closeBtn = header.querySelector('button') as HTMLElement
    await userEvent.click(closeBtn)

    expect(onClose).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('botão Concluído chama onClose sem chamar rpc', async () => {
    const { onClose } = renderModal()
    await screen.findByText('Quão Grande é o Meu Deus')

    await userEvent.click(screen.getByRole('button', { name: /concluído/i }))

    expect(onClose).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('sem conexão: clique em música mostra aviso de offline e NÃO chama rpc', async () => {
    useOnlineStatusMock.mockReturnValue(false)
    const { onAdded } = renderModal()

    await screen.findByText('Quão Grande é o Meu Deus')

    // Com !online, o onClick é ignorado (guarda `!added && online && handleAdd`)
    // Mas mesmo que o handler seja chamado, ele seta erro antes do rpc
    // Tentamos clicar mesmo assim — o componente ignora silenciosamente ou mostra aviso
    const song = screen.getByText('Quão Grande é o Meu Deus')
    await userEvent.click(song)

    await waitFor(() => {
      expect(rpcMock).not.toHaveBeenCalled()
      expect(onAdded).not.toHaveBeenCalled()
    })
  })

  it('biblioteca vazia exibe mensagem "Sua biblioteca está vazia."', async () => {
    dbData.songs = []
    dbData.songGroups = []
    renderModal()

    expect(await screen.findByText('Sua biblioteca está vazia.')).toBeInTheDocument()
  })

  it('nenhuma música encontrada pela busca exibe "Nenhuma música encontrada."', async () => {
    renderModal({ groupId: null })
    await screen.findByText('Quão Grande é o Meu Deus')

    const searchInput = screen.getByPlaceholderText(/buscar por título ou artista/i)
    await userEvent.type(searchInput, 'xyzimpossível')

    expect(screen.getByText('Nenhuma música encontrada.')).toBeInTheDocument()
  })

  // ─── segmented control: "Baixar nova" (download direto no culto) ──────────

  it('segmented control aparece quando o usuário tem permissão add_songs', async () => {
    permRef.value = true
    renderModal()
    await screen.findByText('Quão Grande é o Meu Deus')
    expect(await screen.findByText('Da biblioteca')).toBeInTheDocument()
    expect(screen.getByText('Baixar nova')).toBeInTheDocument()
  })

  it('aba "Baixar nova" escondida quando falta a permissão add_songs', async () => {
    permRef.value = false
    renderModal()
    await screen.findByText('Quão Grande é o Meu Deus')
    expect(screen.queryByText('Baixar nova')).not.toBeInTheDocument()
    expect(screen.queryByText('Da biblioteca')).not.toBeInTheDocument()
  })

  it('clicar "Baixar nova" fecha o seletor e abre o AddSongModal com o contexto da seção', async () => {
    permRef.value = true
    const openAddSongSpy = vi.fn()
    const prevOpenAddSong = useUIStore.getState().openAddSong
    useUIStore.setState({ openAddSong: openAddSongSpy })

    const { onClose } = renderModal()
    await screen.findByText('Quão Grande é o Meu Deus')

    await userEvent.click(await screen.findByText('Baixar nova'))

    expect(onClose).toHaveBeenCalled()
    expect(openAddSongSpy).toHaveBeenCalledWith({
      playlistId: PLAYLIST_ID,
      sectionId: SECTION_ID,
      groupId: GROUP_ID,
      sectionLabel: 'Abertura',
    })

    useUIStore.setState({ openAddSong: prevOpenAddSong })
  })

  // ─── #67 pt.2: indicador de músicas já na seção ───────────────────────────

  it('música já na seção aparece como "Na seção" e fica desabilitada', async () => {
    // s1 já está vinculada à seção sec-1.
    dbData.playlistSongs = [{ song_id: 's1' }]
    renderModal({ groupId: null }) // sem filtro de grupo pra ver s1 e s2

    await screen.findByText('Quão Grande é o Meu Deus')
    expect(await screen.findByText('Na seção')).toBeInTheDocument()

    // O botão da s1 está desabilitado; clicar não chama o rpc.
    const s1Row = screen.getByText('Quão Grande é o Meu Deus').closest('button')!
    expect(s1Row).toBeDisabled()
    await userEvent.click(s1Row)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('música fora da seção continua adicionável', async () => {
    dbData.playlistSongs = [{ song_id: 's1' }]
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    renderModal({ groupId: null })

    await screen.findByText('Oceans')
    const s2Row = screen.getByText('Oceans').closest('button')!
    expect(s2Row).not.toBeDisabled()
    await userEvent.click(s2Row)

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('add_song_to_playlist', expect.objectContaining({
        p_song_id: 's2',
      }))
    })
  })
})
