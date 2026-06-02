import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

type Props = {
  onFileSelected: (file: File) => void
}

const ACCEPT_EXTS = '.mp3,.m4a,.aac,.wav,.flac,.aiff,.aif,.ogg,.opus'
const ACCEPT_MIME = 'audio/*'

export function FileTab({ onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleClick() {
    inputRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelected(file)
    // Reset pra permitir selecionar o mesmo arquivo novamente
    if (inputRef.current) inputRef.current.value = ''
  }

  // Em alguns WebViews (notavelmente WKWebView do Tauri/macOS), dropEffect
  // só funciona se preventDefault for chamado tanto em dragEnter quanto
  // em dragOver — caso contrário o navegador rejeita o drop silenciosamente.
  // Issue #154: combinar isso com dragDropEnabled:false em tauri.conf.json
  // (que tira a captura nativa do OS) destrava o drop no FileTab.
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileSelected(file)
  }

  return (
    <div
      data-testid="file-dropzone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="rounded-xl p-8 text-center transition-colors"
      style={{
        background: '#09090b',
        border: isDragging
          ? '2px dashed #a78bfa'
          : '2px dashed #3f3f46',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_EXTS + ',' + ACCEPT_MIME}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: '#27272a' }}>
        <Upload size={24} color="#a78bfa" strokeWidth={2} />
      </div>
      <div className="mb-1 text-[15px] font-medium" style={{ color: '#fafafa' }}>
        Arraste o arquivo aqui
      </div>
      <div className="mb-3 text-[12px]" style={{ color: '#71717a' }}>
        MP3, M4A, WAV, FLAC, OGG · até 100 MB
      </div>
      <button
        type="button"
        onClick={handleClick}
        className="rounded-lg px-4 py-2 text-[13px] font-semibold"
        style={{ background: '#a78bfa', color: '#09090b', border: 'none', cursor: 'pointer' }}
      >
        Selecionar arquivo
      </button>
    </div>
  )
}
