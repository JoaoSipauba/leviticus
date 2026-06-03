import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

type Props = {
  onFileSelected: (file: File) => void
}

const ALLOWED_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'aiff', 'aif', 'ogg', 'opus']
const ACCEPT_EXTS = ALLOWED_EXTS.map((e) => `.${e}`).join(',')
const ACCEPT_MIME = 'audio/*'

// Drag-drop bypassa o atributo `accept` do <input>. Sem este filtro, qualquer
// arquivo (vídeo, PDF, imagem) chega ao handler do modal — onde só seria
// rejeitado depois de ler magic bytes, o que confunde o usuário ("por que
// abriu a UI e depois deu erro?"). Filtro client-side por extensão é a
// camada barata; o magic-byte check no AddSongModal continua sendo a
// fonte da verdade pra renames maliciosos.
function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot >= 0) {
    const ext = name.slice(dot + 1)
    if (ALLOWED_EXTS.includes(ext)) return true
  }
  // Fallback: aceita se MIME claramente é áudio (alguns gravadores salvam
  // sem extensão padrão mas com mime correto). Magic-byte check do modal
  // continua sendo a fonte da verdade — aqui só evita rejeição precipitada.
  return file.type.startsWith('audio/')
}

export function FileTab({ onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [rejectMsg, setRejectMsg] = useState<string | null>(null)

  function handleClick() {
    inputRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // O file picker já filtra pelo `accept`, mas alguns usuários trocam
      // o filtro pra "Todos os arquivos" — defensivo manter o check aqui.
      if (!isAllowedFile(file)) {
        setRejectMsg(`Tipo não permitido: ${file.name}. Use MP3, M4A, WAV, FLAC, OGG.`)
      } else {
        setRejectMsg(null)
        onFileSelected(file)
      }
    }
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
    if (!file) return
    // Filtro de tipo na dropzone — o input do file picker já tinha `accept`,
    // mas drag-drop bypassa isso. Sem este check, qualquer arquivo (vídeo,
    // PDF, imagem) chegaria ao handleFileSelected do modal e seria rejeitado
    // só depois de ler magic bytes — UX confusa.
    if (!isAllowedFile(file)) {
      setRejectMsg(`Tipo não permitido: ${file.name}. Use MP3, M4A, WAV, FLAC, OGG.`)
      return
    }
    setRejectMsg(null)
    onFileSelected(file)
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
        MP3, M4A, WAV, FLAC, OGG · até 1 GB
      </div>
      <button
        type="button"
        onClick={handleClick}
        className="rounded-lg px-4 py-2 text-[13px] font-semibold"
        style={{ background: '#a78bfa', color: '#09090b', border: 'none', cursor: 'pointer' }}
      >
        Selecionar arquivo
      </button>
      {rejectMsg && (
        <div className="mt-3 text-[12px]" style={{ color: '#f87171' }}>
          {rejectMsg}
        </div>
      )}
    </div>
  )
}
