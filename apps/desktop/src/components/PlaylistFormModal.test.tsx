import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlaylistFormModal } from './PlaylistFormModal.js'
import type { Playlist } from '@leviticus/core'

// ─── hoisted mock variables ───────────────────────────────────────────────

const { rpcMock } = vi.hoisted(() => {
  const rpcMock = vi.fn()
  return { rpcMock }
})

// ─── module mocks ─────────────────────────────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: rpcMock },
}))

vi.mock('../lib/sync.js', () => ({
  syncOrg: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: vi.fn(() => true),
}))

// ─── helpers ──────────────────────────────────────────────────────────────

const ORG_ID = 'org-abc'
const NEW_PLAYLIST_ID = 'pl-new-123'

// A future date so "no past date" validation never fires
const FUTURE_DATE = (() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const EDITING_PLAYLIST: Playlist = {
  id: 'pl-edit-456',
  org_id: ORG_ID,
  name: 'Culto Existente',
  scheduled_at: `${FUTURE_DATE}T09:00:00.000Z`,
  scheduled_end: `${FUTURE_DATE}T11:00:00.000Z`,
  created_by: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

type RenderOptions = {
  open?: boolean
  editing?: Playlist | null
}

function renderModal({ open = true, editing = null }: RenderOptions = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <PlaylistFormModal
      open={open}
      onClose={onClose}
      onSaved={onSaved}
      editing={editing}
    />,
  )
  return { onClose, onSaved }
}

beforeEach(() => {
  localStorage.setItem('leviticus_org_id', ORG_ID)
})

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// ─── tests ────────────────────────────────────────────────────────────────

describe('PlaylistFormModal', () => {
  it('não renderiza quando open=false', () => {
    renderModal({ open: false })
    expect(screen.queryByRole('button', { name: /criar|salvar/i })).not.toBeInTheDocument()
  })

  it('modo criar: submit válido chama create_playlist e executa onSaved + onClose', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, id: NEW_PLAYLIST_ID }, error: null })
    const { onSaved, onClose } = renderModal()

    const nameInput = screen.getByPlaceholderText(/domingo manhã/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Culto de Domingo')

    const dateInput = screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, FUTURE_DATE)

    await userEvent.click(screen.getByRole('button', { name: /^Criar$/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        'create_playlist',
        expect.objectContaining({
          p_org_id: ORG_ID,
          p_name: 'Culto de Domingo',
        }),
      )
      expect(onSaved).toHaveBeenCalledWith(NEW_PLAYLIST_ID)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('modo criar: exibe título "Novo culto" e botão "Criar"', () => {
    renderModal()
    expect(screen.getByText('Novo culto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Criar$/i })).toBeInTheDocument()
  })

  it('modo editar: inicializa form com valores de editing, exibe "Editar culto" e botão "Salvar"', () => {
    renderModal({ editing: EDITING_PLAYLIST })
    expect(screen.getByText('Editar culto')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Culto Existente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Salvar$/i })).toBeInTheDocument()
  })

  it('modo editar: submit chama update_playlist com p_id correto → onSaved(editing.id) → onClose', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    const { onSaved, onClose } = renderModal({ editing: EDITING_PLAYLIST })

    const nameInput = screen.getByDisplayValue('Culto Existente')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Culto Editado')

    await userEvent.click(screen.getByRole('button', { name: /^Salvar$/i }))

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        'update_playlist',
        expect.objectContaining({
          p_id: EDITING_PLAYLIST.id,
          p_name: 'Culto Editado',
        }),
      )
      expect(onSaved).toHaveBeenCalledWith(EDITING_PLAYLIST.id)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('erro do rpc (campo error preenchido) mostra mensagem inline e NÃO chama onSaved/onClose', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const { onSaved, onClose } = renderModal()

    const nameInput = screen.getByPlaceholderText(/domingo manhã/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Culto Qualquer')

    await userEvent.click(screen.getByRole('button', { name: /^Criar$/i }))

    await waitFor(() => {
      expect(screen.getByText(/não foi possível criar/i)).toBeInTheDocument()
      expect(onSaved).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('erro do rpc (data.ok=false) mostra mensagem inline e NÃO chama onSaved/onClose', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false }, error: null })
    const { onSaved, onClose } = renderModal({ editing: EDITING_PLAYLIST })

    await userEvent.click(screen.getByRole('button', { name: /^Salvar$/i }))

    await waitFor(() => {
      expect(screen.getByText(/não foi possível salvar/i)).toBeInTheDocument()
      expect(onSaved).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('submit com nome vazio mostra validação inline e NÃO chama rpc', async () => {
    const { onSaved, onClose } = renderModal()

    const nameInput = screen.getByPlaceholderText(/domingo manhã/i)
    await userEvent.clear(nameInput)

    await userEvent.click(screen.getByRole('button', { name: /^Criar$/i }))

    expect(screen.getByText(/dê um nome ao culto/i)).toBeInTheDocument()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicar Cancelar chama onClose sem chamar supabase', async () => {
    const { onClose } = renderModal()
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  // ─── Issue #91: política unificada de fechamento ────────────────────────

  it('apertar Escape fecha o modal (chama onClose)', async () => {
    const { onClose } = renderModal()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('clique no backdrop: NÃO fecha com form preenchido, fecha com form vazio', async () => {
    const { onClose } = renderModal()
    // O backdrop é o overlay fixed inset-0 — ancestor mais externo do modal.
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    expect(backdrop).toBeTruthy()

    // Form preenchido → clique-fora não descarta.
    const nameInput = screen.getByPlaceholderText(/domingo manhã/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Culto com nome')
    await userEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()

    // Form vazio (nome limpo) → clique-fora descarta.
    await userEvent.clear(nameInput)
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })
})
