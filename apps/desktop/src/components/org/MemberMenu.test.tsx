import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemberMenu } from './MemberMenu'

function makeAnchor(): HTMLElement {
  const el = document.createElement('button')
  // getBoundingClientRect returns zeros in jsdom — good enough for positioning
  el.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 100, width: 100, height: 30, x: 0, y: 0, toJSON: () => ({}) })
  document.body.appendChild(el)
  return el
}

describe('MemberMenu', () => {
  let anchor: HTMLElement
  let onAction: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    anchor = makeAnchor()
    onAction = vi.fn()
    onClose = vi.fn()
  })

  afterEach(() => {
    anchor.remove()
  })

  it('renderiza itens do variant admin-on-member', () => {
    render(<MemberMenu variant="admin-on-member" anchor={anchor} onAction={onAction} onClose={onClose} />)
    expect(screen.getByText('Alterar papel…')).toBeInTheDocument()
    expect(screen.getByText('Gerenciar ministérios…')).toBeInTheDocument()
    expect(screen.getByText('Copiar e-mail')).toBeInTheDocument()
    expect(screen.getByText('Remover da organização')).toBeInTheDocument()
  })

  it('renderiza itens do variant admin-on-owner (com item desabilitado)', () => {
    render(<MemberMenu variant="admin-on-owner" anchor={anchor} onAction={onAction} onClose={onClose} />)
    expect(screen.getByText('Ver ministérios')).toBeInTheDocument()
    expect(screen.getByText('Copiar e-mail')).toBeInTheDocument()
    expect(screen.getByText('Remover · só após transferência')).toBeInTheDocument()
  })

  it('renderiza itens do variant self', () => {
    render(<MemberMenu variant="self" anchor={anchor} onAction={onAction} onClose={onClose} />)
    expect(screen.getByText('Copiar e-mail')).toBeInTheDocument()
    expect(screen.getByText('Sair da organização')).toBeInTheDocument()
  })

  it('renderiza itens do variant self-owner (com item desabilitado)', () => {
    render(<MemberMenu variant="self-owner" anchor={anchor} onAction={onAction} onClose={onClose} />)
    expect(screen.getByText('Copiar e-mail')).toBeInTheDocument()
    expect(screen.getByText('Sair · transfira a propriedade primeiro')).toBeInTheDocument()
  })

  it('clicar num item chama onAction e onClose', () => {
    render(<MemberMenu variant="admin-on-member" anchor={anchor} onAction={onAction} onClose={onClose} />)
    fireEvent.click(screen.getByText('Alterar papel…'))
    expect(onAction).toHaveBeenCalledWith('change-role')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicar em "Copiar e-mail" chama onAction com copy-email', () => {
    render(<MemberMenu variant="self" anchor={anchor} onAction={onAction} onClose={onClose} />)
    fireEvent.click(screen.getByText('Copiar e-mail'))
    expect(onAction).toHaveBeenCalledWith('copy-email')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('item disabled não tem onClick nem dispara onAction', () => {
    render(<MemberMenu variant="admin-on-owner" anchor={anchor} onAction={onAction} onClose={onClose} />)
    const disabledItem = screen.getByText('Remover · só após transferência')
    fireEvent.click(disabledItem)
    expect(onAction).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('pressionar Escape chama onClose', () => {
    render(<MemberMenu variant="self" anchor={anchor} onAction={onAction} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicar fora do menu e fora do anchor chama onClose', () => {
    render(<MemberMenu variant="self" anchor={anchor} onAction={onAction} onClose={onClose} />)
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    fireEvent.mouseDown(outside)
    expect(onClose).toHaveBeenCalledTimes(1)
    outside.remove()
  })

  it('clicar dentro do anchor não chama onClose', () => {
    render(<MemberMenu variant="self" anchor={anchor} onAction={onAction} onClose={onClose} />)
    fireEvent.mouseDown(anchor)
    expect(onClose).not.toHaveBeenCalled()
  })
})
