import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── jsdom polyfills ──────────────────────────────────────────────────────
// jsdom does not implement ResizeObserver or MutationObserver fully; stub them.
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── hoisted stable refs ──────────────────────────────────────────────────
const refs = vi.hoisted(() => ({
  online: true as boolean,
}))

// ─── module mocks ─────────────────────────────────────────────────────────

vi.mock('../lib/useOnlineStatus.js', () => ({
  useOnlineStatus: () => refs.online,
}))

// Mock heavy sub-components so Layout renders in isolation
vi.mock('./Sidebar.js', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}))
vi.mock('./PlayerMini.js', () => ({
  PlayerMini: () => <div data-testid="player-mini" />,
}))
vi.mock('./AddSongModal.js', () => ({
  AddSongModal: () => <div data-testid="add-song-modal" />,
}))
vi.mock('./EditSongModal.js', () => ({
  EditSongModal: () => <div data-testid="edit-song-modal" />,
}))

// ─── import component after mocks ─────────────────────────────────────────

import { Layout } from './Layout.js'

// ─── tests ────────────────────────────────────────────────────────────────

describe('Layout', () => {
  beforeEach(() => {
    refs.online = true
    vi.clearAllMocks()
  })

  it('renderiza children dentro do main', () => {
    render(
      <Layout>
        <p data-testid="child">Conteúdo</p>
      </Layout>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renderiza Sidebar, PlayerMini, AddSongModal e EditSongModal', () => {
    render(<Layout><span /></Layout>)
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('player-mini')).toBeInTheDocument()
    expect(screen.getByTestId('add-song-modal')).toBeInTheDocument()
    expect(screen.getByTestId('edit-song-modal')).toBeInTheDocument()
  })

  it('online: NÃO exibe indicador "Offline"', () => {
    refs.online = true
    render(<Layout><span /></Layout>)
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })

  it('offline: exibe indicador "Offline"', () => {
    refs.online = false
    render(<Layout><span /></Layout>)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('múltiplos children são renderizados corretamente', () => {
    render(
      <Layout>
        <p data-testid="c1">Um</p>
        <p data-testid="c2">Dois</p>
      </Layout>
    )
    expect(screen.getByTestId('c1')).toBeInTheDocument()
    expect(screen.getByTestId('c2')).toBeInTheDocument()
  })
})
