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

  it('drag-and-drop: dragEnter e dragOver chamam preventDefault (issue #154)', () => {
    // Sem preventDefault em ambos os eventos, WebKit (Tauri/macOS) rejeita
    // o drop silenciosamente. O teste lock-in garante que o contrato se
    // mantém — quebrar isso quebra a feature em produção.
    render(<FileTab onFileSelected={onFileSelected} />)
    const dropzone = screen.getByTestId('file-dropzone')

    const enterEvent = new Event('dragenter', { bubbles: true, cancelable: true })
    dropzone.dispatchEvent(enterEvent)
    expect(enterEvent.defaultPrevented).toBe(true)

    const overEvent = new Event('dragover', { bubbles: true, cancelable: true })
    dropzone.dispatchEvent(overEvent)
    expect(overEvent.defaultPrevented).toBe(true)
  })

  it('drag-and-drop: arquivo com extensão não permitida é rejeitado SEM chamar callback', () => {
    render(<FileTab onFileSelected={onFileSelected} />)
    const dropzone = screen.getByTestId('file-dropzone')
    const badFile = new File(['fake'], 'video.mp4', { type: 'video/mp4' })

    fireEvent.drop(dropzone, { dataTransfer: { files: [badFile] } })

    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByText(/Tipo não permitido.*video\.mp4/)).toBeInTheDocument()
  })

  it('drag-and-drop: PDF é rejeitado com mensagem amigável', () => {
    render(<FileTab onFileSelected={onFileSelected} />)
    const dropzone = screen.getByTestId('file-dropzone')
    const pdf = new File(['fake'], 'docs.pdf', { type: 'application/pdf' })

    fireEvent.drop(dropzone, { dataTransfer: { files: [pdf] } })

    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByText(/Tipo não permitido.*docs\.pdf/)).toBeInTheDocument()
  })

  it('drag-and-drop: arquivo SEM extensão mas com MIME audio/* é aceito', () => {
    // Alguns gravadores salvam blob sem extensão padrão mas com mime correto.
    render(<FileTab onFileSelected={onFileSelected} />)
    const dropzone = screen.getByTestId('file-dropzone')
    const blob = new File(['fake'], 'rec', { type: 'audio/wav' })

    fireEvent.drop(dropzone, { dataTransfer: { files: [blob] } })

    expect(onFileSelected).toHaveBeenCalledWith(blob)
  })

  it('file picker: tipo não permitido via input também é rejeitado', () => {
    const { container } = render(<FileTab onFileSelected={onFileSelected} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const badFile = new File(['fake'], 'foto.jpg', { type: 'image/jpeg' })

    Object.defineProperty(input, 'files', { value: [badFile], configurable: true })
    fireEvent.change(input)

    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByText(/Tipo não permitido.*foto\.jpg/)).toBeInTheDocument()
  })
})
