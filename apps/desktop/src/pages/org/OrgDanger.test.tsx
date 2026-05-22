import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([{ name: 'Igreja Teste' }]),
  }),
}))

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}))

const { ownerRef } = vi.hoisted(() => ({ ownerRef: { value: true } }))
vi.mock('../../store/permissions.js', () => ({
  usePermissionsStore: (selector: (s: { isOwner: boolean }) => unknown) =>
    selector({ isOwner: ownerRef.value }),
}))

vi.mock('../../components/org/TransferOwnershipModal.js', () => ({
  TransferOwnershipModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="transfer-modal" /> : null,
}))

vi.mock('../../components/org/DeleteOrgModal.js', () => ({
  DeleteOrgModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="delete-modal" /> : null,
}))

vi.mock('../../components/org/RemoveMemberModal.js', () => ({
  RemoveMemberModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="leave-modal" /> : null,
}))

import { OrgDanger } from './OrgDanger.js'

function renderDanger(orgId = 'org-1') {
  return render(
    <MemoryRouter>
      <OrgDanger orgId={orgId} />
    </MemoryRouter>
  )
}

describe('OrgDanger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ownerRef.value = true
  })

  it('renderiza seções "Transferir propriedade" e "Deletar organização" para o dono', async () => {
    renderDanger()
    await waitFor(() => {
      expect(screen.getByText('Transferir propriedade')).toBeInTheDocument()
      expect(screen.getByText('Deletar organização')).toBeInTheDocument()
    })
  })

  it('clicar Transferir abre TransferOwnershipModal', async () => {
    renderDanger()
    await waitFor(() => screen.getByRole('button', { name: /Transferir/i }))

    await userEvent.click(screen.getByRole('button', { name: /Transferir/i }))

    expect(screen.getByTestId('transfer-modal')).toBeInTheDocument()
  })

  it('clicar Deletar abre DeleteOrgModal', async () => {
    renderDanger()
    await waitFor(() => screen.getByRole('button', { name: /Deletar/i }))

    await userEvent.click(screen.getByRole('button', { name: /Deletar/i }))

    expect(screen.getByTestId('delete-modal')).toBeInTheDocument()
  })

  it('não exibe botão Sair nem seções de owner quando não é dono', async () => {
    ownerRef.value = false

    renderDanger()
    await waitFor(() => screen.getByText('Sair da organização'))

    expect(screen.queryByText('Transferir propriedade')).not.toBeInTheDocument()
    expect(screen.queryByText('Deletar organização')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Sair$/ })).toBeInTheDocument()
  })

  it('clicar Sair abre RemoveMemberModal para não-dono', async () => {
    ownerRef.value = false

    renderDanger()
    await waitFor(() => screen.getByRole('button', { name: /^Sair$/ }))

    await userEvent.click(screen.getByRole('button', { name: /^Sair$/ }))

    expect(screen.getByTestId('leave-modal')).toBeInTheDocument()
  })
})
