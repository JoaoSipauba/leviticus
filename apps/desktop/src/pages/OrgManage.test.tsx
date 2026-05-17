import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---- mocks must be hoisted above imports ----

vi.mock('react-router-dom', () => {
  const actual = { useSearchParams: vi.fn() }
  return actual
})

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn(),
}))

vi.mock('../lib/permissions.js', () => ({
  hasPermission: vi.fn(),
}))

// Stub every sub-page so the container test stays isolated
vi.mock('./org/OrgInfo.js', () => ({ OrgInfo: () => <div>OrgInfo</div> }))
vi.mock('./org/OrgMembers.js', () => ({ OrgMembers: () => <div>OrgMembers</div> }))
vi.mock('./org/OrgInvites.js', () => ({ OrgInvites: () => <div>OrgInvites</div> }))
vi.mock('./org/OrgRoles.js', () => ({ OrgRoles: () => <div>OrgRoles</div> }))
vi.mock('./org/OrgIntegrations.js', () => ({ OrgIntegrations: () => <div>OrgIntegrations</div> }))
vi.mock('./org/OrgDanger.js', () => ({ OrgDanger: () => <div>OrgDanger</div> }))

import { useSearchParams } from 'react-router-dom'
import { getDb } from '../lib/db.js'
import { hasPermission } from '../lib/permissions.js'
import { OrgManage } from './OrgManage.js'

// ---- helpers ----

function makeDb(overrides?: Partial<{ name: string; memberCnt: number; inviteCnt: number; roleCnt: number }>) {
  const { name = 'Minha Igreja', memberCnt = 3, inviteCnt = 1, roleCnt = 2 } = overrides ?? {}
  return {
    select: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM orgs')) return Promise.resolve([{ name }])
      if (sql.includes('organization_members')) return Promise.resolve([{ cnt: memberCnt }])
      if (sql.includes('org_invite_codes')) return Promise.resolve([{ cnt: inviteCnt }])
      if (sql.includes('FROM roles')) return Promise.resolve([{ cnt: roleCnt }])
      return Promise.resolve([])
    }),
  }
}

function setupSearchParams(tab = 'members') {
  const setSearchParams = vi.fn()
  vi.mocked(useSearchParams).mockReturnValue([
    { get: (k: string) => (k === 'tab' ? tab : null) } as any,
    setSearchParams,
  ])
  return { setSearchParams }
}

describe('OrgManage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('leviticus_org_id', 'org-1')
    vi.mocked(getDb).mockResolvedValue(makeDb() as any)
    vi.mocked(hasPermission).mockResolvedValue(false)
  })

  // ------------------------------------------------------------------
  it('renderiza tabs visíveis para usuário sem permissões admin', async () => {
    setupSearchParams('members')

    render(<OrgManage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /informações/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /membros/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /integrações/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /configurações/i })).toBeInTheDocument()
    })

    // tabs restritas não devem aparecer
    expect(screen.queryByRole('button', { name: /convites/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /papéis/i })).not.toBeInTheDocument()
  })

  // ------------------------------------------------------------------
  it('renderiza tabs de admin quando usuário tem manage_members e manage_roles', async () => {
    setupSearchParams('members')
    vi.mocked(hasPermission).mockResolvedValue(true)

    render(<OrgManage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /convites/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /papéis/i })).toBeInTheDocument()
    })
  })

  // ------------------------------------------------------------------
  it('tab ativo segue o parâmetro de URL inicial', async () => {
    setupSearchParams('info')

    render(<OrgManage />)

    // OrgInfo stub must be visible, not OrgMembers
    await waitFor(() => {
      expect(screen.getByText('OrgInfo')).toBeInTheDocument()
    })
    expect(screen.queryByText('OrgMembers')).not.toBeInTheDocument()
  })

  // ------------------------------------------------------------------
  it('clicar em tab diferente troca o conteúdo e chama setSearchParams', async () => {
    const { setSearchParams } = setupSearchParams('members')
    const user = userEvent.setup()

    render(<OrgManage />)

    await waitFor(() => {
      expect(screen.getByText('OrgMembers')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /informações/i }))

    await waitFor(() => {
      expect(screen.getByText('OrgInfo')).toBeInTheDocument()
    })
    expect(setSearchParams).toHaveBeenCalledWith({ tab: 'info' }, { replace: true })
  })

  // ------------------------------------------------------------------
  it('exibe o nome da org no subtítulo após carregar', async () => {
    setupSearchParams('members')
    vi.mocked(getDb).mockResolvedValue(makeDb({ name: 'Igreja Esperança' }) as any)

    render(<OrgManage />)

    await waitFor(() => {
      expect(screen.getByText(/Igreja Esperança/)).toBeInTheDocument()
    })
  })

  // ------------------------------------------------------------------
  it('exibe contadores de membros, convites e papéis nos tabs', async () => {
    setupSearchParams('members')
    vi.mocked(hasPermission).mockResolvedValue(true)
    vi.mocked(getDb).mockResolvedValue(makeDb({ memberCnt: 5, inviteCnt: 2, roleCnt: 4 }) as any)

    render(<OrgManage />)

    await waitFor(() => {
      // each count badge is rendered inside the button — look for the raw number
      const buttons = screen.getAllByRole('button')
      const membrosBtn = buttons.find((b) => b.textContent?.includes('Membros'))
      expect(membrosBtn?.textContent).toContain('5')

      const convitesBtn = buttons.find((b) => b.textContent?.includes('Convites'))
      expect(convitesBtn?.textContent).toContain('2')

      const papeisBtn = buttons.find((b) => b.textContent?.includes('Papéis'))
      expect(papeisBtn?.textContent).toContain('4')
    })
  })
})
