import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Link } from 'react-router-dom'

// ---- mocks must be hoisted above imports ----

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn(),
}))

const { permRef } = vi.hoisted(() => ({ permRef: { value: false } }))
vi.mock('../store/permissions.js', () => ({
  usePermission: () => permRef.value,
}))

// Stub every sub-page so the container test stays isolated
vi.mock('./org/OrgInfo.js', () => ({ OrgInfo: () => <div>OrgInfo</div> }))
vi.mock('./org/OrgMembers.js', () => ({ OrgMembers: () => <div>OrgMembers</div> }))
vi.mock('./org/OrgInvites.js', () => ({ OrgInvites: () => <div>OrgInvites</div> }))
vi.mock('./org/OrgRoles.js', () => ({ OrgRoles: () => <div>OrgRoles</div> }))
vi.mock('./org/OrgIntegrations.js', () => ({ OrgIntegrations: () => <div>OrgIntegrations</div> }))
vi.mock('./org/OrgDanger.js', () => ({ OrgDanger: () => <div>OrgDanger</div> }))

import { getDb } from '../lib/db.js'
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

// `tab` é derivado da URL — o teste usa um router real (MemoryRouter) em vez
// de mockar `useSearchParams`, pra exercitar a navegação de verdade.
function renderAt(tab = 'members') {
  return render(
    <MemoryRouter initialEntries={[`/manage?tab=${tab}`]}>
      <OrgManage />
    </MemoryRouter>
  )
}

describe('OrgManage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('leviticus_org_id', 'org-1')
    vi.mocked(getDb).mockResolvedValue(makeDb() as any)
    permRef.value = false
  })

  // ------------------------------------------------------------------
  it('renderiza tabs visíveis para usuário sem permissões admin', async () => {
    renderAt('members')

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
    permRef.value = true

    renderAt('members')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /convites/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /papéis/i })).toBeInTheDocument()
    })
  })

  // ------------------------------------------------------------------
  it('tab ativo segue o parâmetro de URL inicial', async () => {
    renderAt('info')

    // Todas as abas montam de uma vez; só a ativa fica visível, as outras
    // ficam `hidden`. Aba ativa = info → OrgInfo visível, OrgMembers oculto.
    await waitFor(() => {
      expect(screen.getByText('OrgInfo')).toBeVisible()
    })
    expect(screen.getByText('OrgMembers')).not.toBeVisible()
  })

  // ------------------------------------------------------------------
  it('clicar em tab diferente troca o conteúdo', async () => {
    const user = userEvent.setup()

    renderAt('members')

    await waitFor(() => {
      expect(screen.getByText('OrgMembers')).toBeVisible()
    })

    await user.click(screen.getByRole('button', { name: /informações/i }))

    // Trocar de aba alterna a visibilidade — OrgInfo aparece, OrgMembers
    // continua montado mas oculto.
    await waitFor(() => {
      expect(screen.getByText('OrgInfo')).toBeVisible()
    })
    expect(screen.getByText('OrgMembers')).not.toBeVisible()
  })

  // ------------------------------------------------------------------
  // Regressão #117: o botão "Convidar" em OrgMembers navega pra ?tab=invites.
  // OrgManage já está montado, então a aba só troca se o estado for derivado
  // da URL — antes ele era estado local fixado na montagem e ignorava a
  // navegação externa.
  it('reage a navegação externa que muda ?tab', async () => {
    permRef.value = true
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/manage?tab=members']}>
        <Link to="/manage?tab=invites">ir-para-convites</Link>
        <OrgManage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('OrgMembers')).toBeVisible()
    })
    expect(screen.getByText('OrgInvites')).not.toBeVisible()

    await user.click(screen.getByText('ir-para-convites'))

    await waitFor(() => {
      expect(screen.getByText('OrgInvites')).toBeVisible()
    })
    expect(screen.getByText('OrgMembers')).not.toBeVisible()
  })

  // ------------------------------------------------------------------
  it('exibe o nome da org no subtítulo após carregar', async () => {
    vi.mocked(getDb).mockResolvedValue(makeDb({ name: 'Igreja Esperança' }) as any)

    renderAt('members')

    await waitFor(() => {
      expect(screen.getByText(/Igreja Esperança/)).toBeInTheDocument()
    })
  })

  // ------------------------------------------------------------------
  it('exibe contadores de membros, convites e papéis nos tabs', async () => {
    permRef.value = true
    vi.mocked(getDb).mockResolvedValue(makeDb({ memberCnt: 5, inviteCnt: 2, roleCnt: 4 }) as any)

    renderAt('members')

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
