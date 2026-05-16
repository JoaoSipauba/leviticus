# Cloud Storage Add Song Flows — Plano de Implementação (Plano 3 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a tab "Arquivo" como caminho principal pra adicionar música (drag-and-drop + upload pro Drive), modificar o fluxo YouTube pra também subir o arquivo baixado pro Drive, e incluir disclaimer prominente na tab YouTube alertando sobre uso de músicas autorizadas. Consome a fundação backend do Plano 1 e a UI de Integrações do Plano 2.

**Architecture:** Top-level tabs reorganizados pra "Arquivo" (primário) e "YouTube" (secundário com `!`). Fluxo de upload de arquivo: file picker → magic-byte detection (`file-type` npm) → pre-check de quota → compressão lossless via ffmpeg sidecar (WAV/FLAC/AIFF → Opus 160k) → cópia local + INSERT song no Supabase + upload pro Drive via `uploadResumable` existente. Fluxo YouTube preservado mas com upload pro Drive após yt-dlp. Falha de upload nunca perde música — `backup_status='pending'` se Drive indisponível.

**Tech Stack:** React 18 + TypeScript, Tauri v2 (Command/sidecar ffmpeg via `@tauri-apps/plugin-shell`), `file-type` npm (magic bytes), Vitest + RTL pra testes de componente, vitest + mockIPC pra testes unit.

---

## Pré-requisitos

- [x] Plano 1 completo: `src/lib/cloud-storage/{client,upload,download,status}.ts`, edge function deployada, `cloud_storage_accounts` schema
- [x] Plano 2 completo: tab Integrações funcional, store `useIntegrationsStore` com `status`
- [ ] Edge function `cloud-storage-proxy` rodando (`supabase functions serve cloud-storage-proxy --env-file supabase/.env.local --no-verify-jwt`)

---

## Tracking de issues

Durante este plano, sempre que encontrar bug/melhoria/dívida fora do escopo da task atual, abra issue conforme convenção em `CLAUDE.md` (seção "Acompanhar achados"). Categorias: `type:bug|security|performance|ux|enhancement|feature|tech-debt|dx|docs`. Prioridades: `priority:critical|high|medium|low`.

---

## Estrutura de arquivos

### Criados

```
apps/desktop/src/lib/cloud-storage/
  format-detection.ts                          # Detecta formato via magic bytes (file-type npm)
  format-detection.test.ts
  compression.ts                                # WAV/FLAC/AIFF → Opus 160k via ffmpeg sidecar
  compression.test.ts
  upload-song.ts                                # Orquestra: detect → compress → upload → status
  upload-song.test.ts

apps/desktop/src/components/add-song/
  FileTab.tsx                                   # Arquivo tab UI (dropzone + select button)
  FileTab.test.tsx
  YouTubeDisclaimer.tsx                         # Callout amarelo prominente
  YouTubeDisclaimer.test.tsx
```

### Modificados

```
apps/desktop/package.json                       # Adiciona file-type npm
apps/desktop/src/components/AddSongModal.tsx    # Adiciona Arquivo como top-level tab; integra upload no Step 3
apps/desktop/src-tauri/src/cloud_storage.rs     # Novo comando compress_to_opus_file
apps/desktop/src-tauri/src/lib.rs               # Registra comando
```

### Fluxo conceitual

```
Step 1 Arquivo:                              Step 1 YouTube:
  drop/select file                              search ou paste URL
  ↓                                              ↓
  format-detection.ts                           ytdlp.fetchYoutubeMetadata
  → magic bytes, MIME, size                     → metadata
  ↓                                              ↓
  pre-check quota (se Drive conectado)
  ↓
  ┌─── Step 2 (compartilhado) ────────────┐
  │ Editar título/artista/grupos/song_type │
  └────────────────────────────────────────┘
  ↓
  ┌─── Step 3 (compartilhado, com modo) ──┐
  │ Arquivo flow:                          │
  │   compression.ts (se lossless)         │
  │   copy local                           │
  │   INSERT supabase song                 │
  │   upload-song.ts → cloud_file_id       │
  │   setBackupStatus('uploaded')          │
  │                                        │
  │ YouTube flow:                          │
  │   downloadSong (yt-dlp)                │
  │   INSERT supabase song                 │
  │   upload-song.ts → cloud_file_id       │
  │   setBackupStatus('uploaded')          │
  │                                        │
  │ Drive indisponível:                    │
  │   pula upload                          │
  │   setBackupStatus('pending')           │
  │   toast: "salvo, sem backup ainda"     │
  └────────────────────────────────────────┘
```

---

## Task 1: Adicionar `file-type` npm + format-detection

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/src/lib/cloud-storage/format-detection.ts`
- Create: `apps/desktop/src/lib/cloud-storage/format-detection.test.ts`

- [ ] **Step 1: Instalar file-type**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop`:

```bash
pnpm add file-type@21
```

Expected: `package.json` ganha `"file-type": "^21..."` em `dependencies` + lock atualizado.

- [ ] **Step 2: Escrever teste**

Create `apps/desktop/src/lib/cloud-storage/format-detection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { categorizeAudioFormat, isLossless, isSupportedAudio } from './format-detection.js'

describe('categorizeAudioFormat', () => {
  it('classifica WAV/FLAC/AIFF como lossless', () => {
    expect(categorizeAudioFormat({ ext: 'wav', mime: 'audio/wav' })).toEqual({ kind: 'lossless', ext: 'wav' })
    expect(categorizeAudioFormat({ ext: 'flac', mime: 'audio/flac' })).toEqual({ kind: 'lossless', ext: 'flac' })
    expect(categorizeAudioFormat({ ext: 'aif', mime: 'audio/aiff' })).toEqual({ kind: 'lossless', ext: 'aif' })
    expect(categorizeAudioFormat({ ext: 'aiff', mime: 'audio/aiff' })).toEqual({ kind: 'lossless', ext: 'aiff' })
  })

  it('classifica MP3/M4A/OGG/Opus como lossy', () => {
    expect(categorizeAudioFormat({ ext: 'mp3', mime: 'audio/mpeg' })).toEqual({ kind: 'lossy', ext: 'mp3' })
    expect(categorizeAudioFormat({ ext: 'm4a', mime: 'audio/m4a' })).toEqual({ kind: 'lossy', ext: 'm4a' })
    expect(categorizeAudioFormat({ ext: 'aac', mime: 'audio/aac' })).toEqual({ kind: 'lossy', ext: 'aac' })
    expect(categorizeAudioFormat({ ext: 'ogg', mime: 'audio/ogg' })).toEqual({ kind: 'lossy', ext: 'ogg' })
    expect(categorizeAudioFormat({ ext: 'opus', mime: 'audio/opus' })).toEqual({ kind: 'lossy', ext: 'opus' })
  })

  it('rejeita formatos não-áudio', () => {
    expect(categorizeAudioFormat({ ext: 'pdf', mime: 'application/pdf' })).toEqual({ kind: 'unsupported', ext: 'pdf' })
    expect(categorizeAudioFormat({ ext: 'mp4', mime: 'video/mp4' })).toEqual({ kind: 'unsupported', ext: 'mp4' })
  })
})

describe('isLossless / isSupportedAudio', () => {
  it('isLossless retorna true para wav, flac, aiff, aif', () => {
    expect(isLossless('wav')).toBe(true)
    expect(isLossless('flac')).toBe(true)
    expect(isLossless('aiff')).toBe(true)
    expect(isLossless('aif')).toBe(true)
    expect(isLossless('mp3')).toBe(false)
  })

  it('isSupportedAudio cobre lossy + lossless', () => {
    expect(isSupportedAudio('wav')).toBe(true)
    expect(isSupportedAudio('mp3')).toBe(true)
    expect(isSupportedAudio('mp4')).toBe(false)
  })
})
```

- [ ] **Step 3: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/format-detection.test.ts`
Expected: FAIL — module não existe

- [ ] **Step 4: Criar format-detection.ts**

Create `apps/desktop/src/lib/cloud-storage/format-detection.ts`:

```typescript
import { fileTypeFromBuffer } from 'file-type'

export type AudioCategory = 'lossless' | 'lossy' | 'unsupported'

export type DetectedFormat = {
  kind: AudioCategory
  ext: string
}

const LOSSLESS_EXTS = new Set(['wav', 'flac', 'aiff', 'aif'])
const LOSSY_EXTS = new Set(['mp3', 'm4a', 'aac', 'ogg', 'opus'])

export function isLossless(ext: string): boolean {
  return LOSSLESS_EXTS.has(ext.toLowerCase())
}

export function isSupportedAudio(ext: string): boolean {
  const e = ext.toLowerCase()
  return LOSSLESS_EXTS.has(e) || LOSSY_EXTS.has(e)
}

export function categorizeAudioFormat(opts: { ext: string; mime: string }): DetectedFormat {
  const ext = opts.ext.toLowerCase()
  if (LOSSLESS_EXTS.has(ext)) return { kind: 'lossless', ext }
  if (LOSSY_EXTS.has(ext)) return { kind: 'lossy', ext }
  return { kind: 'unsupported', ext }
}

/**
 * Detecta o formato de um arquivo via magic bytes. Lê os primeiros 4 KiB.
 * Retorna DetectedFormat ou null se o arquivo não for um tipo conhecido.
 */
export async function detectFromBytes(bytes: Uint8Array): Promise<DetectedFormat | null> {
  const result = await fileTypeFromBuffer(bytes)
  if (!result) return null
  return categorizeAudioFormat({ ext: result.ext, mime: result.mime })
}
```

- [ ] **Step 5: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/format-detection.test.ts`
Expected: 8/8 pass (3 + 2 + 2 + 1)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml \
        apps/desktop/src/lib/cloud-storage/format-detection.ts \
        apps/desktop/src/lib/cloud-storage/format-detection.test.ts
git commit -m "feat(cloud-storage): detecção de formato de áudio via magic bytes"
```

---

## Task 2: Tauri command `compress_to_opus`

**Files:**
- Modify: `apps/desktop/src-tauri/src/cloud_storage.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Adicionar comando em cloud_storage.rs**

Edit `apps/desktop/src-tauri/src/cloud_storage.rs`. Adicionar **depois** das funções existentes:

```rust
use std::path::Path;
use std::process::Command;

/// Comprime um arquivo de áudio para Opus 160 kbps usando ffmpeg.
/// Espera que ffmpeg já tenha sido baixado via ensure_ffmpeg (em $APPLOCALDATA/bin).
///
/// IMPORTANTE: a invocação real do binário usa `Command::create('ffmpeg', ...)` no JS
/// (via tauri-plugin-shell) porque o sidecar lookup é feito lá. Este comando Rust é
/// pra validar/calcular paths e retornar a duração final do output (precisa de ffprobe).
///
/// Mas: pra simplicidade do Plano 3 e consistência com o resto do codebase (ver
/// ytdlp.ts:356 que chama ffmpeg via Command.create), a compressão FICA NO TS.
/// Este comando Rust apenas valida que o arquivo existe e retorna metadados básicos.
#[tauri::command]
pub async fn cloud_storage_file_size(path: String) -> Result<u64, String> {
    let p = Path::new(&path);
    let meta = tokio::fs::metadata(p).await.map_err(|e| format!("stat {path}: {e}"))?;
    Ok(meta.len())
}
```

Wait — vamos manter consistência com o codebase: ffmpeg é chamado via `Command.create('ffmpeg', ...)` no TS (ver `ytdlp.ts`). Não precisa de novo comando Rust pra compressão. Vamos só adicionar `cloud_storage_file_size` que usa `tokio::fs::metadata` (não disponível no JS Tauri sem extra config).

- [ ] **Step 2: Registrar no invoke_handler**

Edit `apps/desktop/src-tauri/src/lib.rs`. Localizar a chamada `tauri::generate_handler![...]` e adicionar:

```rust
cloud_storage::cloud_storage_file_size,
```

(adicionar logo após os existentes `cloud_storage::cloud_storage_hash_file` e `cloud_storage::cloud_storage_rename_file`)

- [ ] **Step 3: cargo build pra validar**

Run: `cd apps/desktop/src-tauri && cargo build`
Expected: build limpo

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/cloud_storage.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(tauri): comando cloud_storage_file_size pra preflight do upload"
```

---

## Task 3: Módulo compression.ts

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/compression.ts`
- Create: `apps/desktop/src/lib/cloud-storage/compression.test.ts`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/lib/cloud-storage/compression.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCommand = {
  execute: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
}

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn().mockReturnValue(mockCommand),
  },
}))

vi.mock('../ytdlp.js', () => ({
  ensureFfmpeg: vi.fn().mockResolvedValue('/fake/path/ffmpeg'),
}))

import { Command } from '@tauri-apps/plugin-shell'
import { compressToOpus } from './compression.js'

describe('compressToOpus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCommand.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  })

  it('chama ffmpeg com codec libopus e bitrate 160k', async () => {
    await compressToOpus({ inputPath: '/in.wav', outputPath: '/out.opus' })
    expect(Command.create).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', '/in.wav', '-c:a', 'libopus', '-b:a', '160k', '-y', '/out.opus'])
    )
  })

  it('lança erro quando ffmpeg sai com código !== 0', async () => {
    mockCommand.execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'fail' })
    await expect(compressToOpus({ inputPath: '/a', outputPath: '/b' }))
      .rejects.toThrow(/fail/i)
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/compression.test.ts`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar compression.ts**

Create `apps/desktop/src/lib/cloud-storage/compression.ts`:

```typescript
import { Command } from '@tauri-apps/plugin-shell'
import { ensureFfmpeg } from '../ytdlp.js'

export type CompressOpts = {
  inputPath: string
  outputPath: string  // deve terminar em .opus
}

/**
 * Comprime áudio lossless (WAV/FLAC/AIFF) para Opus 160 kbps.
 * Por que Opus 160k: indistinguível de lossless em qualquer playback humano,
 * ~10x menor que WAV equivalente.
 *
 * Usa o sidecar ffmpeg do Tauri (mesmo binário que ytdlp.ts).
 * Em primeiro uso, ffmpeg é baixado pra $APPLOCALDATA/bin via ensureFfmpeg().
 */
export async function compressToOpus(opts: CompressOpts): Promise<void> {
  await ensureFfmpeg()
  const command = Command.create('ffmpeg', [
    '-i', opts.inputPath,
    '-c:a', 'libopus',
    '-b:a', '160k',
    '-vbr', 'on',          // VBR pra eficiência
    '-application', 'audio', // otimiza pra música (vs voice)
    '-y',                  // overwrite output
    opts.outputPath,
  ])

  const result = await command.execute()
  if (result.code !== 0) {
    throw new Error(`Falha ao comprimir áudio: ${result.stderr || 'ffmpeg failed'}`)
  }
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/compression.test.ts`
Expected: 2/2 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/compression.ts apps/desktop/src/lib/cloud-storage/compression.test.ts
git commit -m "feat(cloud-storage): compressão WAV/FLAC/AIFF → Opus 160k via ffmpeg"
```

---

## Task 4: Módulo upload-song.ts (orquestrador)

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/upload-song.ts`
- Create: `apps/desktop/src/lib/cloud-storage/upload-song.test.ts`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/lib/cloud-storage/upload-song.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tauriInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => tauriInvoke(...args),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}))
vi.mock('./compression.js', () => ({
  compressToOpus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./client.js', () => ({
  createUploadSession: vi.fn().mockResolvedValue({
    sessionUrl: 'https://up', sessionId: 's1', expiresAt: 'x',
  }),
  getFileInfo: vi.fn().mockResolvedValue({
    fileId: 'gd-file-1', size: 1024, mimeType: 'audio/opus',
    createdAt: '2026-01-01', modifiedAt: '2026-01-01',
  }),
}))
vi.mock('./upload.js', () => ({
  uploadResumable: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./status.js', () => ({
  setBackupStatus: vi.fn().mockResolvedValue(undefined),
}))

import { uploadSongToDrive } from './upload-song.js'
import { compressToOpus } from './compression.js'
import { createUploadSession } from './client.js'
import { uploadResumable } from './upload.js'
import { setBackupStatus } from './status.js'

describe('uploadSongToDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tauriInvoke.mockResolvedValue('hash-abc')
  })

  it('lossless: comprime antes de subir', async () => {
    await uploadSongToDrive({
      orgId: 'org-1',
      songId: 'song-1',
      filePath: '/local/song-1.wav',
      ext: 'wav',
      kind: 'lossless',
    })
    expect(compressToOpus).toHaveBeenCalled()
    expect(createUploadSession).toHaveBeenCalledWith('org-1', expect.objectContaining({
      mimeType: 'audio/opus',
    }))
    expect(setBackupStatus).toHaveBeenCalledWith('song-1', 'uploaded', expect.objectContaining({
      cloud_file_id: 'gd-file-1',
    }))
  })

  it('lossy: NÃO comprime, sobe arquivo original', async () => {
    await uploadSongToDrive({
      orgId: 'org-1',
      songId: 'song-2',
      filePath: '/local/song-2.mp3',
      ext: 'mp3',
      kind: 'lossy',
    })
    expect(compressToOpus).not.toHaveBeenCalled()
    expect(uploadResumable).toHaveBeenCalledWith(expect.objectContaining({
      filePath: '/local/song-2.mp3',
    }))
  })

  it('falha no upload marca status=failed e propaga erro', async () => {
    vi.mocked(uploadResumable).mockRejectedValueOnce(new Error('boom'))
    await expect(uploadSongToDrive({
      orgId: 'org-1',
      songId: 'song-3',
      filePath: '/x',
      ext: 'mp3',
      kind: 'lossy',
    })).rejects.toThrow('boom')
    expect(setBackupStatus).toHaveBeenCalledWith('song-3', 'failed', expect.anything())
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/upload-song.test.ts`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar upload-song.ts**

Create `apps/desktop/src/lib/cloud-storage/upload-song.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import { compressToOpus } from './compression.js'
import { createUploadSession, getFileInfo } from './client.js'
import { uploadResumable } from './upload.js'
import { setBackupStatus } from './status.js'
import type { AudioCategory } from './format-detection.js'

export type UploadSongOpts = {
  orgId: string
  songId: string
  filePath: string             // caminho do arquivo original local
  ext: string                  // 'mp3', 'wav', etc. (lowercase)
  kind: AudioCategory          // 'lossless' | 'lossy' | 'unsupported'
  onProgress?: (pct: number) => void
}

const MIME_BY_EXT: Record<string, string> = {
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/m4a',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
}

/**
 * Orquestra o upload de uma música pro Drive:
 * 1. Se lossless: comprime pra .opus num temp file
 * 2. Calcula hash SHA-256
 * 3. Cria upload session via edge function
 * 4. Faz PUT chunked direto pro Google
 * 5. Confirma + extrai cloud_file_id
 * 6. Atualiza songs.backup_status='uploaded'
 *
 * Se qualquer passo falhar, marca backup_status='failed' e propaga.
 */
export async function uploadSongToDrive(opts: UploadSongOpts): Promise<void> {
  if (opts.kind === 'unsupported') {
    throw new Error(`Formato não suportado: ${opts.ext}`)
  }

  let uploadPath = opts.filePath
  let uploadExt = opts.ext
  let mimeType = MIME_BY_EXT[opts.ext] ?? 'application/octet-stream'

  try {
    // 1. Compressão (só lossless)
    if (opts.kind === 'lossless') {
      const opusPath = `${opts.filePath}.opus`
      await compressToOpus({ inputPath: opts.filePath, outputPath: opusPath })
      uploadPath = opusPath
      uploadExt = 'opus'
      mimeType = 'audio/opus'
    }

    // 2. Hash + tamanho
    const hash = await invoke<string>('cloud_storage_hash_file', { path: uploadPath })
    const size = await invoke<number>('cloud_storage_file_size', { path: uploadPath })

    // 3. Cria upload session
    const session = await createUploadSession(opts.orgId, {
      filename: `${opts.songId}.${uploadExt}`,
      size,
      mimeType,
    })

    // 4. Upload chunked
    await uploadResumable({
      filePath: uploadPath,
      session,
      onProgress: opts.onProgress
        ? (p) => opts.onProgress?.(p.pct)
        : undefined,
    })

    // 5. Confirma + pega cloud_file_id (file-info responde com ID do arquivo
    // criado a partir do session ID)
    const info = await getFileInfo(opts.orgId, session.sessionId)
    if (!info) throw new Error('Upload completou mas arquivo não foi encontrado no Drive')

    // 6. Atualiza status
    await setBackupStatus(opts.songId, 'uploaded', {
      cloud_file_id: info.fileId,
      cloud_file_size: info.size,
      cloud_file_hash: hash,
    })
  } catch (err) {
    try {
      await setBackupStatus(opts.songId, 'failed')
    } catch {
      // ignora — não quer ofuscar o erro original
    }
    throw err
  }
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/upload-song.test.ts`
Expected: 3/3 pass

Nota: o 3º teste verifica que após falha `setBackupStatus` é chamado com `'failed'`. Pra isso o status atual no DB precisa estar em 'pending' (transição válida é `pending → failed`). O teste mocka setBackupStatus então a transição não importa, mas em runtime o callsite deve passar songs já em status='pending'.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/upload-song.ts apps/desktop/src/lib/cloud-storage/upload-song.test.ts
git commit -m "feat(cloud-storage): orquestrador upload-song (compress + upload + status)"
```

---

## Task 5: Componente `YouTubeDisclaimer`

**Files:**
- Create: `apps/desktop/src/components/add-song/YouTubeDisclaimer.tsx`
- Create: `apps/desktop/src/components/add-song/YouTubeDisclaimer.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/add-song/YouTubeDisclaimer.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YouTubeDisclaimer } from './YouTubeDisclaimer.js'

describe('YouTubeDisclaimer', () => {
  it('mostra título de atenção e copy sobre autorização', () => {
    render(<YouTubeDisclaimer />)
    expect(screen.getByText(/permissão pra baixar/i)).toBeInTheDocument()
    expect(screen.getByText(/diretrizes do YouTube/i)).toBeInTheDocument()
    expect(screen.getByText(/sua igreja/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/add-song/YouTubeDisclaimer.test.tsx`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/add-song/YouTubeDisclaimer.tsx`:

```typescript
import { AlertTriangle } from 'lucide-react'

export function YouTubeDisclaimer() {
  return (
    <div className="rounded-xl p-3.5 mb-3"
      style={{ background: '#422006', border: '1px solid #78350f' }}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} color="#fbbf24" strokeWidth={2} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-[12.5px] font-semibold mb-1.5" style={{ color: '#fde68a' }}>
            Use só com músicas que você tem permissão pra baixar
          </div>
          <div className="text-[11px] leading-relaxed" style={{ color: '#fde68a' }}>
            O Leviticus não se responsabiliza por downloads fora das diretrizes do YouTube.
            Prefira subir o arquivo da gravação oficial da sua igreja sempre que possível.
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/add-song/YouTubeDisclaimer.test.tsx`
Expected: 1/1 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/add-song/YouTubeDisclaimer.tsx \
        apps/desktop/src/components/add-song/YouTubeDisclaimer.test.tsx
git commit -m "feat(add-song): YouTubeDisclaimer callout"
```

---

## Task 6: Componente `FileTab` (dropzone + select button)

**Files:**
- Create: `apps/desktop/src/components/add-song/FileTab.tsx`
- Create: `apps/desktop/src/components/add-song/FileTab.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/add-song/FileTab.test.tsx`:

```typescript
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
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/add-song/FileTab.test.tsx`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/add-song/FileTab.tsx`:

```typescript
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
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/add-song/FileTab.test.tsx`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/add-song/FileTab.tsx \
        apps/desktop/src/components/add-song/FileTab.test.tsx
git commit -m "feat(add-song): FileTab com dropzone + file picker"
```

---

## Task 7: Adicionar tab "Arquivo" no AddSongModal

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

- [ ] **Step 1: Identificar onde tabs estão renderizadas**

Run: `grep -n "switchTab\|setTab\|tab === \|type.*'search'.*'url'" apps/desktop/src/components/AddSongModal.tsx | head -10`

Localize:
- Linha ~656: declaração `const [tab, setTab] = useState<'search' | 'url'>('search')`
- Linha ~1415: tab switcher render
- Linha ~1438, ~1565: blocos `{tab === 'search' && ...}` e `{tab === 'url' && ...}`

- [ ] **Step 2: Atualizar tipos de tab**

Edit `apps/desktop/src/components/AddSongModal.tsx`. Localizar:

```typescript
const [tab, setTab] = useState<'search' | 'url'>('search')
```

Substituir por:

```typescript
// 'file' é o caminho principal (Plano 3). 'search'/'url' são YouTube secundários.
const [tab, setTab] = useState<'file' | 'search' | 'url'>('file')
```

- [ ] **Step 3: Atualizar `switchTab` pra aceitar o novo valor**

Localizar:

```typescript
function switchTab(t: 'search' | 'url') {
```

Substituir por:

```typescript
function switchTab(t: 'file' | 'search' | 'url') {
```

- [ ] **Step 4: Atualizar título do header**

Localizar (linha ~1355):

```typescript
{step === 1 && (tab === 'search' ? 'Pesquise por nome ou artista' : 'Cole o link do YouTube')}
```

Substituir por:

```typescript
{step === 1 && (
  tab === 'file' ? 'Escolha um arquivo de áudio'
  : tab === 'search' ? 'Pesquise por nome ou artista'
  : 'Cole o link do YouTube'
)}
```

- [ ] **Step 5: Reestruturar tab switcher**

Localizar o bloco `(['search', 'url'] as const).map(...)` (linha ~1415). Substituir o tab switcher inteiro por:

```typescript
<div
  style={{
    display: 'flex',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  }}
>
  {/* Tab principal: Arquivo */}
  <button
    onClick={() => switchTab('file')}
    style={{
      flex: 1,
      padding: '7px 10px',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 600,
      border: 'none',
      cursor: 'pointer',
      background: tab === 'file' ? 'rgba(167,139,250,0.25)' : 'transparent',
      color: tab === 'file' ? '#a78bfa' : '#6b7280',
      transition: 'all 0.15s',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}
  >
    Arquivo
  </button>
  {/* Tabs secundários YouTube */}
  {(['search', 'url'] as const).map((t) => (
    <button
      key={t}
      onClick={() => switchTab(t)}
      style={{
        flex: 1,
        padding: '7px 10px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        background: tab === t ? 'rgba(37,99,235,0.25)' : 'transparent',
        color: tab === t ? '#93c5fd' : '#6b7280',
        transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      {t === 'search' ? 'Buscar' : 'Colar URL'}
      <span style={{
        background: '#422006', color: '#fbbf24',
        fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
      }}>!</span>
    </button>
  ))}
</div>
```

- [ ] **Step 6: Adicionar disclaimer em tabs YouTube**

Adicionar import no topo do arquivo:

```typescript
import { YouTubeDisclaimer } from './add-song/YouTubeDisclaimer.js'
```

Localizar `{tab === 'search' && (` (~linha 1438) — adicionar `<YouTubeDisclaimer />` LOGO ACIMA do `<>`:

```typescript
{tab === 'search' && (
  <>
    <YouTubeDisclaimer />
    {/* resto do conteúdo existente */}
```

Similarmente em `{tab === 'url' && (` — adicionar `<YouTubeDisclaimer />` no início do JSX.

- [ ] **Step 7: Typecheck pra garantir que nada quebrou**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: 0 erros (pode ter warning sobre 'file' não ter conteúdo ainda — corrigido na Task 8)

- [ ] **Step 8: Commit (parcial — tab existe mas sem conteúdo)**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat(add-song): adiciona tab Arquivo + disclaimer YouTube"
```

---

## Task 8: Conteúdo do tab "Arquivo" + estado do arquivo selecionado

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

- [ ] **Step 1: Adicionar imports**

Edit `apps/desktop/src/components/AddSongModal.tsx`. Adicionar nos imports:

```typescript
import { FileTab } from './add-song/FileTab.js'
import { detectFromBytes, type DetectedFormat } from '../lib/cloud-storage/format-detection.js'
```

- [ ] **Step 2: Adicionar estado**

Localizar a seção de useState declarations (próximo da linha 656). Adicionar:

```typescript
// Arquivo selecionado pela tab 'file' (mantém File em memória até Step 2 confirmar)
const [selectedFile, setSelectedFile] = useState<File | null>(null)
const [detectedFormat, setDetectedFormat] = useState<DetectedFormat | null>(null)
const [fileError, setFileError] = useState<string | null>(null)
```

- [ ] **Step 3: Adicionar handler de seleção de arquivo**

Adicionar como function dentro do componente (próximo das outras handlers, ex: depois de `switchTab`):

```typescript
async function handleFileSelected(file: File) {
  setFileError(null)
  // Tamanho — limite 100 MB
  if (file.size > 100 * 1024 * 1024) {
    setFileError('Arquivo grande demais. Limite: 100 MB.')
    setSelectedFile(null)
    setDetectedFormat(null)
    return
  }

  // Lê os primeiros 4 KB pra detectar magic bytes
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  const detected = await detectFromBytes(head)

  if (!detected || detected.kind === 'unsupported') {
    setFileError(`Formato não suportado${detected ? ` (${detected.ext})` : ''}. Use MP3, M4A, WAV, FLAC ou OGG.`)
    setSelectedFile(null)
    setDetectedFormat(null)
    return
  }

  setSelectedFile(file)
  setDetectedFormat(detected)
  // Pre-popula título com nome do arquivo (sem extensão)
  const name = file.name.replace(/\.[^.]+$/, '')
  setTitle(name)
  // Avança pra Step 2 quando o usuário confirma (botão renderizado abaixo)
}
```

- [ ] **Step 4: Renderizar conteúdo do tab 'file'**

Localizar o switcher (linha ~1435). Logo após o fechamento do switcher (`</div>`) e antes de `{tab === 'search' && ...}`, adicionar:

```typescript
{/* ── Arquivo tab ── */}
{tab === 'file' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {!selectedFile && (
      <>
        <FileTab onFileSelected={handleFileSelected} />
        {fileError && (
          <div style={{ padding: 10, borderRadius: 8, background: '#450a0a', color: '#fca5a5', fontSize: 12 }}>
            {fileError}
          </div>
        )}
      </>
    )}
    {selectedFile && detectedFormat && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: 12, borderRadius: 10,
          background: '#18181b', border: '1px solid #27272a',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fafafa', fontSize: 13, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFile.name}
            </div>
            <div style={{ color: '#71717a', fontSize: 11 }}>
              {(selectedFile.size / 1024 / 1024).toFixed(1)} MB ·{' '}
              {detectedFormat.ext.toUpperCase()} ·{' '}
              {detectedFormat.kind === 'lossless'
                ? 'Será convertido pra Opus 160k'
                : 'Será enviado como está'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setSelectedFile(null); setDetectedFormat(null); setTitle('') }}
            style={{
              background: 'transparent', color: '#71717a',
              border: 'none', cursor: 'pointer', padding: 4,
            }}
          >
            Trocar
          </button>
        </div>
        <BtnPrimary onClick={() => setStep(2)} style={{ width: '100%' }}>
          Continuar
        </BtnPrimary>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Rodar typecheck**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 6: Smoke test manual no app dev**

Run: `cd apps/desktop && pnpm tauri:dev`

Manualmente:
1. Login + abrir biblioteca
2. Clica "Adicionar"
3. Tab "Arquivo" deve estar selecionada por padrão
4. Drag-and-drop um MP3 → preview do arquivo aparece, botão "Continuar" habilitado
5. Trocar pra tab "Buscar" → disclaimer amarelo no topo
6. Trocar pra tab "Colar URL" → disclaimer amarelo no topo
7. Voltar pra "Arquivo", clicar "Trocar", selecionar outro arquivo → funciona

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat(add-song): conteúdo do tab Arquivo (dropzone + preview + continuar)"
```

---

## Task 9: Wire fluxo Arquivo no Step 3 (insert song + upload)

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

- [ ] **Step 1: Adicionar imports e helpers**

Edit `apps/desktop/src/components/AddSongModal.tsx`. Adicionar imports:

```typescript
import { writeFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs'
import { uploadSongToDrive } from '../lib/cloud-storage/upload-song.js'
import { useIntegrationsStore } from '../store/integrations.js'
import { toastSuccess, toastError } from '../store/toasts.js'
```

- [ ] **Step 2: Adicionar uso do store de integrações**

Dentro do componente (próximo a outros hooks):

```typescript
const cloudStatus = useIntegrationsStore((s) => s.status)
```

- [ ] **Step 3: Localizar `handleConfirm` e adicionar branch pra Arquivo**

Localizar `async function handleConfirm()` (~linha 1189). O fluxo atual é todo YouTube. Adicionar checagem no início:

Identificar linha ~1189-1200 onde começa `handleConfirm`. Antes dos passos do YouTube, adicionar:

```typescript
async function handleConfirm() {
  if (tab === 'file' && selectedFile && detectedFormat) {
    return handleConfirmFile()
  }
  // ... fluxo YouTube existente continua intacto
```

- [ ] **Step 4: Adicionar handleConfirmFile**

Adicionar como function separada no mesmo escopo (depois do handleConfirm existente OU antes — manter coesão):

```typescript
async function handleConfirmFile() {
  if (!selectedFile || !detectedFormat) return
  const orgId = localStorage.getItem('leviticus_org_id')
  if (!orgId) { setError('Sem organização selecionada'); return }

  setSaving(true)
  setError(null)

  // Reutiliza lógica de insert song existente, mas com source='upload' e
  // sem youtube_url. Pega user_id do supabase auth.
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) { setError('Sessão expirada'); setSaving(false); return }

  try {
    // 1. Insert song row no Supabase. backup_status='pending' por padrão.
    const { data: songRow, error: insertErr } = await supabase
      .from('songs')
      .insert({
        org_id: orgId,
        added_by: authData.user.id,
        youtube_url: `local://upload/${Date.now()}`,  // placeholder — youtube_url é NOT NULL unique
        title: title.trim(),
        artist: artist.trim() || 'Desconhecido',
        thumbnail_url: null,
        duration_seconds: null,
        song_type: songType,
        source: 'upload',
        original_format: detectedFormat.ext,
        backup_status: 'pending',
      })
      .select('id')
      .single()
    if (insertErr || !songRow) {
      throw new Error(insertErr?.message ?? 'Falha ao salvar música')
    }

    const songId = songRow.id

    // 2. Insert song-group associations
    if (selectedGroups.length > 0) {
      const sgRows = selectedGroups.map((gid) => ({ song_id: songId, group_id: gid }))
      const { error: sgErr } = await supabase.from('song_groups').insert(sgRows)
      if (sgErr) console.warn('song_groups insert failed:', sgErr)
    }

    // 3. Copia o arquivo pra $APPLOCALDATA/audio/{songId}.{ext}
    setStep(3)
    setProgress(0)
    const ext = detectedFormat.ext
    const localPath = `audio/${songId}.${ext}`
    const buf = new Uint8Array(await selectedFile.arrayBuffer())
    // Garante a pasta audio/ existe
    try { await mkdir('audio', { baseDir: BaseDirectory.AppLocalData, recursive: true }) } catch {}
    await writeFile(localPath, buf, { baseDir: BaseDirectory.AppLocalData })

    // Resolve path absoluto pra passar pro upload (Tauri commands precisam de absolute)
    const { invoke } = await import('@tauri-apps/api/core')
    const { appLocalDataDir } = await import('@tauri-apps/api/path')
    const absDir = await appLocalDataDir()
    const absPath = `${absDir}/${localPath}`

    // 4. Upload pro Drive (se conectado)
    if (cloudStatus === 'connected') {
      try {
        setProgress(10)
        await uploadSongToDrive({
          orgId,
          songId,
          filePath: absPath,
          ext,
          kind: detectedFormat.kind,
          onProgress: (pct) => setProgress(10 + Math.round(pct * 0.85)),
        })
        setProgress(100)
        toastSuccess('Música adicionada e salva no backup')
      } catch (uploadErr) {
        console.error('upload failed:', uploadErr)
        toastError('Música adicionada, mas backup falhou. Tente de novo depois.')
        // status já foi marcado como 'failed' dentro do upload-song.ts
      }
    } else {
      toastSuccess('Música adicionada — sem backup (Drive desconectado)')
    }

    // 5. Sync + UI
    await syncOrg(orgId)
    bumpLibrary()
    setTimeout(() => setStep(4), 400)
  } catch (err) {
    console.error('handleConfirmFile failed:', err)
    setError(err instanceof Error ? err.message : 'Falha ao adicionar música')
    setSaving(false)
    setStep(2)  // Volta pro form de metadata
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 5: Rodar typecheck**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 6: Smoke test manual**

Run: `cd apps/desktop && pnpm tauri:dev`

1. Conecta Drive (tab Integrações) — confirma `status=connected`
2. Adiciona música via Arquivo: drop um MP3 → Step 2 (metadata) → Continuar → Step 3 (progress) → upload completa → Step 4 sucesso → toast "Música adicionada e salva no backup"
3. Confirma na biblioteca que a música apareceu
4. Verifica no Drive (https://drive.google.com) que o arquivo `{songId}.mp3` está na pasta Leviticus
5. Verifica no Supabase: `songs.backup_status = 'uploaded'` e `cloud_file_id` populado

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat(add-song): fluxo Arquivo — insert song + upload pro Drive"
```

---

## Task 10: Wire upload pro Drive no fluxo YouTube

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

- [ ] **Step 1: Identificar onde downloadSong é chamado**

Run: `grep -n "downloadSong\|setStep(3)\|onProgress" apps/desktop/src/components/AddSongModal.tsx | head -10`

Localiza o `await downloadSong(...)` dentro do `handleConfirm` (~linha 1240-1270 estimado).

- [ ] **Step 2: Adicionar upload-to-Drive após o download**

Localizar onde o download termina e o Step 4 é setado (`setTimeout(() => setStep(4), 400)`). ANTES desse setTimeout, adicionar upload pro Drive:

```typescript
// (após o downloadSong concluir e antes de setStep(4))

// Upload pro Drive (se conectado). Falha não bloqueia a música —
// fica em backup_status='pending' pra retry futuro (Plano 4).
if (cloudStatus === 'connected') {
  try {
    // findSongFile retorna o path real (m4a/webm/opus dependendo do yt-dlp)
    const { findSongFile } = await import('../lib/ytdlp.js')
    const localFilePath = await findSongFile(songId)
    if (localFilePath) {
      // Detecta extensão real do arquivo baixado
      const ext = localFilePath.split('.').pop()?.toLowerCase() ?? 'm4a'
      const kind = (ext === 'wav' || ext === 'flac' || ext === 'aiff' || ext === 'aif')
        ? 'lossless' as const
        : 'lossy' as const

      setProgress(0)  // Reset progress bar pra o upload
      await uploadSongToDrive({
        orgId,
        songId,
        filePath: localFilePath,
        ext,
        kind,
        onProgress: (pct) => setProgress(pct),
      })
      toastSuccess('Música adicionada e salva no backup')
    }
  } catch (uploadErr) {
    console.error('YouTube upload to Drive failed:', uploadErr)
    toastError('Música baixada, mas backup falhou. Tente de novo depois.')
    // status='failed' já setado em upload-song.ts
  }
}
```

**IMPORTANTE**: este bloco assume que `orgId` e `songId` estão acessíveis no escopo. Se não estiverem, suba pra escopo de função (deve estar — verificar pelos `console.log` existentes nearby).

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 4: Smoke test manual**

Run: `cd apps/desktop && pnpm tauri:dev`

1. Confirma Drive conectado
2. Adiciona música via YouTube (tab Buscar ou Colar URL)
3. yt-dlp baixa → upload pro Drive → toast "salva no backup"
4. Verifica no Drive

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat(add-song): YouTube flow também sobe pro Drive após download"
```

---

## Task 11: Pre-check de quota antes de Step 2

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

- [ ] **Step 1: Adicionar helper**

Edit `apps/desktop/src/components/AddSongModal.tsx`. Modificar `handleFileSelected` (criado na Task 8) pra adicionar checagem de quota após detectar o formato:

Localizar o `handleFileSelected` e adicionar antes do `setSelectedFile(file)`:

```typescript
async function handleFileSelected(file: File) {
  setFileError(null)
  if (file.size > 100 * 1024 * 1024) {
    setFileError('Arquivo grande demais. Limite: 100 MB.')
    setSelectedFile(null)
    setDetectedFormat(null)
    return
  }

  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  const detected = await detectFromBytes(head)
  if (!detected || detected.kind === 'unsupported') {
    setFileError(`Formato não suportado${detected ? ` (${detected.ext})` : ''}. Use MP3, M4A, WAV, FLAC ou OGG.`)
    setSelectedFile(null)
    setDetectedFormat(null)
    return
  }

  // Pre-check quota se Drive conectado. Margem 1.5x pra compressão temp.
  if (cloudStatus === 'connected') {
    try {
      const { getQuota } = await import('../lib/cloud-storage/client.js')
      const orgId = localStorage.getItem('leviticus_org_id')
      if (orgId) {
        const q = await getQuota(orgId)
        const need = file.size * 1.5
        if (q.available < need) {
          const needMb = Math.round(need / 1024 / 1024)
          const availMb = Math.round(q.available / 1024 / 1024)
          setFileError(
            `Não cabe no Drive. Arquivo precisa ~${needMb} MB mas só sobram ${availMb} MB. ` +
            `Libere espaço ou troque a conta na tab Integrações.`
          )
          setSelectedFile(null)
          setDetectedFormat(null)
          return
        }
      }
    } catch (e) {
      // Falha na checagem de quota não bloqueia — só loga (upload pode falhar
      // depois e cair em backup_status='pending'/failed).
      console.warn('quota pre-check failed:', e)
    }
  }

  setSelectedFile(file)
  setDetectedFormat(detected)
  const name = file.name.replace(/\.[^.]+$/, '')
  setTitle(name)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 3: Smoke test manual**

1. Drive cheio: ir na tab Integrações, verificar que mostra DriveFullCard
2. Tentar adicionar arquivo de 50 MB → erro inline aparece
3. Drive com espaço: arquivo pequeno passa normalmente

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat(add-song): pre-check de quota antes de selecionar arquivo"
```

---

## Task 12: Smoke test + DoD do Plano 3

**Files:** (sem mudanças de código — validação)

- [ ] **Step 1: Validar typecheck monorepo**

Run: `pnpm typecheck` (na raiz do projeto)
Expected: 0 erros

- [ ] **Step 2: Rodar testes vitest do módulo**

Run: `cd apps/desktop && pnpm vitest run src/lib/cloud-storage/ src/components/add-song/`
Expected: TODOS passam (cerca de 15+ testes novos)

- [ ] **Step 3: Smoke test E2E manual completo**

Run: `cd apps/desktop && pnpm tauri:dev` (mantém `supabase functions serve` em outro terminal)

Fluxos críticos pra validar:
- [ ] Adicionar via Arquivo (MP3 lossy) → upload sem compressão → Drive
- [ ] Adicionar via Arquivo (WAV lossless) → compressão → Opus → Drive
- [ ] Adicionar via YouTube (Buscar) → yt-dlp → upload Drive
- [ ] Adicionar via YouTube (Colar URL) → yt-dlp → upload Drive
- [ ] Drive desconectado → adicionar arquivo → música salva local, `backup_status='pending'`, sem erro
- [ ] Drive cheio → tentar arquivo > available → erro inline "não cabe"
- [ ] Formato não suportado (.txt) → erro inline imediato
- [ ] Arquivo > 100 MB → erro inline imediato

- [ ] **Step 4: Marcar plano como completo**

Editar este arquivo (`docs/superpowers/plans/2026-05-16-cloud-storage-add-song-flows.md`) marcando todos os checkboxes acima como `[x]`.

- [ ] **Step 5: Commit final**

```bash
git add docs/superpowers/plans/2026-05-16-cloud-storage-add-song-flows.md
git commit -m "docs(plan): marca Plano 3 (Add Song flows) como completo"
```

---

## Critérios de aceitação (DoD do Plano 3)

Antes de partir pro Plano 4:

- [ ] Tab "Arquivo" aparece no AddSongModal como primária (esquerda)
- [ ] Tabs "Buscar" e "Colar URL" (YouTube) com badge `!` amarelo
- [ ] YouTubeDisclaimer aparece no topo das tabs YouTube
- [ ] FileTab funcional: drag-and-drop + button picker
- [ ] Format detection: rejeita formatos não-suportados com erro inline
- [ ] Tamanho > 100 MB rejeitado com erro inline
- [ ] Pre-check de quota: rejeita arquivos que não cabem no Drive (quando conectado)
- [ ] Lossless (WAV/FLAC/AIFF) → comprime pra Opus 160k antes de subir
- [ ] Lossy (MP3/M4A/etc) → sobe original sem recomprimir
- [ ] Música é salva no Supabase mesmo se upload falhar (`backup_status='pending'`)
- [ ] Drive desconectado: música salva, toast informa sem-backup
- [ ] Drive conectado: upload completa + `backup_status='uploaded'` + `cloud_file_id` populado
- [ ] YouTube flow: também faz upload pro Drive após yt-dlp
- [ ] Toasts informam sucesso/erro de cada estado
- [ ] `pnpm typecheck` 0 erros
- [ ] Vitest desta área passa (~15+ testes novos)
- [ ] Sem regressão em E2E spec 03 (add-song existente)

### Limitações conhecidas (tratadas em Plano 4)

- Sync worker pra retry de uploads pendentes não existe ainda — falhas ficam permanentes em `backup_status='failed'` até intervenção manual ou re-add
- Library não mostra indicador de "sem backup" — UI da biblioteca é Plano 4
- Setup inicial automático (admin sobe biblioteca existente) também entra no Plano 4
- Download do Drive quando arquivo some local — Plano 4
- E2E coverage do upload flow — depende de pré-seed via SQL (similar ao spec 15), fica pra Plano 4 onde implementamos sync worker completo
