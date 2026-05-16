import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileTab } from './FileTab.js'

describe('FileTab', () => {
  let onFileSelected: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onFileSelected = vi.fn()
  })

  it('mostra dropzone + botão Selecionar arquivo', () => {
    render(<FileTab onFileSelected={onFileSelected} />)
    expect(screen.getByText(/arraste o arquivo aqui/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /selecionar arquivo/i })).toBeInTheDocument()
    expect(screen.getByText(/MP3, M4A, WAV, FLAC, OGG/i)).toBeInTheDocument()
  })

  it('clicar no botão abre o file input (file picker)', async () => {
    const { container } = render(<FileTab onFileSelected={onFileSelected} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    expect(input).toBeTruthy()

    const clickSpy = vi.spyOn(input, 'click')
    await userEvent.click(screen.getByRole('button', { name: /selecionar arquivo/i }))
    expect(clickSpy).toHaveBeenCalled()
  })

  it('callback é disparado quando arquivo é selecionado', async () => {
    const { container } = render(<FileTab onFileSelected={onFileSelected} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['fake'], 'song.mp3', { type: 'audio/mpeg' })

    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('drag-and-drop: drop dispara callback', async () => {
    render(<FileTab onFileSelected={onFileSelected} />)
    const dropzone = screen.getByTestId('file-dropzone')
    const file = new File(['fake'], 'song.wav', { type: 'audio/wav' })

    fireEvent.dragOver(dropzone)
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })
    expect(onFileSelected).toHaveBeenCalledWith(file)
  })
})
