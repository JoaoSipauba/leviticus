import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectDriveCard } from './ConnectDriveCard.js'

describe('ConnectDriveCard', () => {
  it('mostra texto explicativo + botão Conectar', () => {
    render(<ConnectDriveCard onConnect={() => {}} canConnect />)
    expect(screen.getByText(/Drive ainda não configurado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Conectar Google Drive/i })).toBeInTheDocument()
  })

  it('chama onConnect quando clica no botão', async () => {
    const onConnect = vi.fn()
    render(<ConnectDriveCard onConnect={onConnect} canConnect />)
    await userEvent.click(screen.getByRole('button', { name: /Conectar Google Drive/i }))
    expect(onConnect).toHaveBeenCalled()
  })

  it('mostra botão desabilitado quando canConnect=false', () => {
    render(<ConnectDriveCard onConnect={() => {}} canConnect={false} />)
    const btn = screen.getByRole('button', { name: /Conectar Google Drive/i })
    expect(btn).toBeDisabled()
    expect(screen.getByText(/permissão pra gerenciar integrações/i)).toBeInTheDocument()
  })

  it('mostra estado de loading quando connecting=true', () => {
    render(<ConnectDriveCard onConnect={() => {}} canConnect connecting />)
    expect(screen.getByText(/Abrindo navegador/i)).toBeInTheDocument()
  })
})
