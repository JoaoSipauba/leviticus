import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── hoisted refs ────────────────────────────────────────────────────────────

const { fromMock, updateMock, eqMock, syncOrgMock, canEditRef } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
  const fromMock = vi.fn().mockReturnValue({ update: updateMock })
  const syncOrgMock = vi.fn().mockResolvedValue(undefined)
  const canEditRef = { value: true }
  return { fromMock, updateMock, eqMock, syncOrgMock, canEditRef }
})

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: fromMock },
}))

vi.mock('../../lib/db.js', () => {
  const selectMock = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('FROM orgs')) return Promise.resolve([{ name: 'Igreja Teste', city: 'São Paulo', timezone: 'America/Sao_Paulo' }])
    if (sql.includes('organization_members')) return Promise.resolve([{ cnt: 5 }])
    if (sql.includes('groups')) return Promise.resolve([{ cnt: 3 }])
    if (sql.includes('playlists')) return Promise.resolve([{ cnt: 12 }])
    return Promise.resolve([])
  })
  return { getDb: vi.fn().mockResolvedValue({ select: selectMock }) }
})

vi.mock('../../lib/sync.js', () => ({
  syncOrg: syncOrgMock,
}))

vi.mock('../../store/permissions.js', () => ({
  usePermission: () => canEditRef.value,
}))

vi.mock('../../store/toasts.js', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

// tauri plugin stubs
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))
vi.mock('@tauri-apps/api/path', () => ({ appLocalDataDir: vi.fn().mockResolvedValue('/data/') }))

// ─── import component after mocks ────────────────────────────────────────────

import { OrgInfo } from './OrgInfo.js'
import { toastSuccess, toastError } from '../../store/toasts.js'

// ─── tests ───────────────────────────────────────────────────────────────────

describe('OrgInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canEditRef.value = true
    eqMock.mockResolvedValue({ error: null })
  })

  it('carrega e exibe nome, cidade e estatísticas da org', async () => {
    render(<OrgInfo orgId="org-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Igreja Teste').length).toBeGreaterThan(0)
    })

    const nameInput = screen.getByDisplayValue('Igreja Teste')
    expect(nameInput).toBeInTheDocument()
    expect(screen.getByDisplayValue('São Paulo')).toBeInTheDocument()

    // stat cards
    expect(screen.getByText('5')).toBeInTheDocument()   // membros
    expect(screen.getByText('3')).toBeInTheDocument()   // ministérios
    expect(screen.getByText('12')).toBeInTheDocument()  // cultos
  })

  it('editar nome e clicar Salvar dispara update no supabase e sincroniza', async () => {
    render(<OrgInfo orgId="org-1" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Igreja Teste')).toBeInTheDocument()
    })

    const nameInput = screen.getByDisplayValue('Igreja Teste')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Nova Igreja')

    await userEvent.click(screen.getByRole('button', { name: /Salvar/i }))

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith('organizations')
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nova Igreja' }))
      expect(eqMock).toHaveBeenCalledWith('id', 'org-1')
      expect(syncOrgMock).toHaveBeenCalledWith('org-1')
      expect(toastSuccess).toHaveBeenCalledWith('Informações salvas')
    })
  })

  it('erro do save mostra mensagem inline e não chama syncOrg', async () => {
    eqMock.mockResolvedValue({ error: { message: 'db error' } })

    render(<OrgInfo orgId="org-1" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Igreja Teste')).toBeInTheDocument()
    })

    const nameInput = screen.getByDisplayValue('Igreja Teste')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Erro Org')

    await userEvent.click(screen.getByRole('button', { name: /Salvar/i }))

    await waitFor(() => {
      expect(screen.getByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
    })

    expect(syncOrgMock).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })

  it('sem permissão: inputs ficam disabled e botão Salvar não aparece', async () => {
    canEditRef.value = false

    render(<OrgInfo orgId="org-1" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Igreja Teste')).toBeInTheDocument()
    })

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    inputs.forEach((input) => expect(input).toBeDisabled())

    expect(screen.queryByRole('button', { name: /Salvar/i })).not.toBeInTheDocument()
  })

  it('nome vazio mostra erro "Nome obrigatório." e não chama supabase', async () => {
    render(<OrgInfo orgId="org-1" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Igreja Teste')).toBeInTheDocument()
    })

    const nameInput = screen.getByDisplayValue('Igreja Teste')
    await userEvent.clear(nameInput)

    await userEvent.click(screen.getByRole('button', { name: /Salvar/i }))

    await waitFor(() => {
      expect(screen.getByText('Nome obrigatório.')).toBeInTheDocument()
    })

    expect(fromMock).not.toHaveBeenCalled()
    expect(syncOrgMock).not.toHaveBeenCalled()
  })

  it('Cancelar restaura o form para os valores originais', async () => {
    render(<OrgInfo orgId="org-1" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Igreja Teste')).toBeInTheDocument()
    })

    const nameInput = screen.getByDisplayValue('Igreja Teste')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Mudado')

    expect(screen.getByDisplayValue('Mudado')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Cancelar/i }))

    expect(screen.getByDisplayValue('Igreja Teste')).toBeInTheDocument()
  })
})
