import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'

// ── hoisted refs ─────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const signOutFn = vi.fn()
  const fromMock = vi.fn()
  return { signOutFn, fromMock }
})

// ── module mocks ──────────────────────────────────────────────────────────────
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: mocks.fromMock,
  },
}))

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock('../lib/playlist.js', () => ({
  formatPlaylistTimeRange: vi.fn(() => '18:00 – 20:00'),
  formatTime: vi.fn(() => '18:00'),
}))

vi.mock('../store/auth.js', () => ({
  useAuthStore: vi.fn(() => ({ signOut: mocks.signOutFn })),
}))

vi.mock('./brand/Logo.js', () => ({
  Logo: () => <div data-testid="logo" />,
}))

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children, className }: {
    to: string
    children: React.ReactNode
    className?: ((arg: { isActive: boolean }) => string) | string
    [key: string]: unknown
  }) => {
    const isActive = to === '/library'
    const cls = typeof className === 'function' ? className({ isActive }) : className
    return <a href={to} className={cls}>{children}</a>
  },
  useNavigate: () => vi.fn(),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('1.2.3'),
}))

import { Sidebar } from './Sidebar.js'

// ── helpers ───────────────────────────────────────────────────────────────────
function setupSupabaseMock(orgName = 'Igreja Teste') {
  mocks.fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { name: orgName }, error: null }),
      }),
    }),
  })
}

beforeEach(() => {
  localStorage.setItem('leviticus_org_id', 'org-1')
  setupSupabaseMock()
  mockIPC((cmd) => {
    if (cmd === 'plugin:sql|select') return []
    return null
  })
})

afterEach(() => {
  clearMocks()
  localStorage.clear()
  vi.clearAllMocks()
})

// ── tests ─────────────────────────────────────────────────────────────────────
describe('Sidebar', () => {
  it('renderiza os links de navegação principais', async () => {
    render(<Sidebar />)

    expect(screen.getByText('Biblioteca')).toBeInTheDocument()
    expect(screen.getByText('Ministérios')).toBeInTheDocument()
    expect(screen.getByText('Cultos')).toBeInTheDocument()
    expect(screen.getByText('Organização')).toBeInTheDocument()
  })

  it('os links apontam para as rotas corretas', () => {
    render(<Sidebar />)

    expect(screen.getByText('Biblioteca').closest('a')).toHaveAttribute('href', '/library')
    expect(screen.getByText('Ministérios').closest('a')).toHaveAttribute('href', '/ministries')
    expect(screen.getByText('Cultos').closest('a')).toHaveAttribute('href', '/services')
    expect(screen.getByText('Organização').closest('a')).toHaveAttribute('href', '/manage')
  })

  it('mostra o nome da org vindo do supabase', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('Igreja Teste')).toBeInTheDocument()
    })
  })

  it('não mostra nome de org quando supabase retorna null', async () => {
    mocks.fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })

    render(<Sidebar />)

    // Wait for async to settle then check orgName is absent
    await waitFor(() => {
      expect(mocks.fromMock).toHaveBeenCalledWith('organizations')
    })
    expect(screen.queryByText('Igreja Teste')).not.toBeInTheDocument()
  })

  it('botão Sair abre modal de escolha; clicar "Sair da conta" chama signOut', async () => {
    render(<Sidebar />)

    // Issue #33: clicar "Sair" agora abre modal de escolha em vez de
    // chamar signOut direto.
    const logoutBtn = screen.getByRole('button', { name: /sair/i })
    await userEvent.click(logoutBtn)

    // Modal aberto — clica em "Sair da conta"
    const signOutInModal = await screen.findByRole('button', { name: /Sair da conta/i })
    await userEvent.click(signOutInModal)

    expect(mocks.signOutFn).toHaveBeenCalledOnce()
  })

  it('exibe versão do app após carregamento', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('v1.2.3')).toBeInTheDocument()
    })
  })

  it('exibe banner "Ao vivo" quando há culto em andamento', async () => {
    const { getDb } = await import('../lib/db.js')
    const now = Date.now()
    const liveCulto = {
      id: 'p1',
      name: 'Culto Domingo',
      scheduled_at: new Date(now - 30 * 60 * 1000).toISOString(),   // started 30min ago
      scheduled_end: new Date(now + 30 * 60 * 1000).toISOString(),  // ends in 30min
      org_id: 'org-1',
    }
    ;(getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      select: vi.fn().mockResolvedValue([liveCulto]),
    })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText(/ao vivo/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Culto Domingo')).toBeInTheDocument()
  })

  it('exibe banner "Em breve" quando culto começa em menos de 1h', async () => {
    const { getDb } = await import('../lib/db.js')
    const now = Date.now()
    const soonCulto = {
      id: 'p2',
      name: 'Culto Quarta',
      scheduled_at: new Date(now + 20 * 60 * 1000).toISOString(),   // starts in 20min
      scheduled_end: new Date(now + 80 * 60 * 1000).toISOString(),
      org_id: 'org-1',
    }
    ;(getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      select: vi.fn().mockResolvedValue([soonCulto]),
    })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText(/em breve/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Culto Quarta')).toBeInTheDocument()
  })

  it('não exibe banner quando não há cultos ativos ou próximos', async () => {
    const { getDb } = await import('../lib/db.js')
    ;(getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      select: vi.fn().mockResolvedValue([]),
    })

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('Igreja Teste')).toBeInTheDocument()
    })

    expect(screen.queryByText(/ao vivo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/em breve/i)).not.toBeInTheDocument()
  })
})
