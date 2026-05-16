# Cloud Storage Library + Sync Worker — Plano de Implementação (Plano 4 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o feature do Cloud Storage: a Biblioteca mostra indicadores claros de quais músicas têm backup (banner + badge + chip filtro), o player baixa do Drive automaticamente quando o arquivo não está local, e um sync-worker em background tenta novamente uploads pendentes que falharam. Estados de erro do Drive (token expirado, pasta sumiu) ganham UI dedicada.

**Architecture:** Componentes isolados em `src/components/library/` (BackupBanner, BackupStatusBadge, BackupFilterChip). Lib `src/lib/cloud-storage/download-song.ts` orquestra download via `generateDownloadUrl` + `downloadToFile` existentes. Lib `sync-worker.ts` lê fila local `pending_cloud_uploads` e re-tenta uploads com backoff exponencial. Bootstrap no `App.tsx` registra o worker na boot do app. Estados de erro em `OrgIntegrations` ganham branches `token_expired` / `folder_missing` com copy específico e ações claras.

**Tech Stack:** React 18 + TypeScript, Zustand (store integrations já existente), Tauri v2 (plugin-fs, IPC), Vitest + RTL.

---

## Pré-requisitos

- [x] Plano 1 completo: schema, edge function, `download.ts`, `upload.ts`, status state machine
- [x] Plano 2 completo: tab Integrações funcional
- [x] Plano 3 completo: upload-song.ts, fluxo Arquivo, YouTube com upload
- [ ] Edge function `cloud-storage-proxy` rodando (necessário pra integração real do download)

---

## Tracking de issues

Durante este plano, sempre que encontrar bug/melhoria/dívida fora do escopo da task atual, abra issue conforme convenção em `CLAUDE.md` (seção "Acompanhar achados").

---

## Estrutura de arquivos

### Criados

```
apps/desktop/src/components/library/
  LibraryBackupBanner.tsx              # Banner topo: "X músicas sem backup"
  LibraryBackupBanner.test.tsx
  BackupStatusBadge.tsx                # Ponto amarelo no canto da capa
  BackupStatusBadge.test.tsx
  BackupFilterChip.tsx                 # Chip "Sem backup (N)" pra filtrar
  BackupFilterChip.test.tsx

apps/desktop/src/lib/cloud-storage/
  pending-queue.ts                     # Helpers pra ler/contar pending_cloud_uploads
  pending-queue.test.ts
  download-song.ts                     # Orquestra: getDownloadUrl → downloadToFile
  download-song.test.ts
  sync-worker.ts                       # Background retry de uploads pendentes
  sync-worker.test.ts
```

### Modificados

```
apps/desktop/src/pages/Library.tsx     # Banner + chip + filtro por backup_status
apps/desktop/src/components/SongCard.tsx  # Badge no canto da capa
apps/desktop/src/lib/audio.ts          # detect missing local → download from Drive
apps/desktop/src/App.tsx               # Bootstrap sync-worker
apps/desktop/src/pages/org/OrgIntegrations.tsx  # Estados token_expired/folder_missing
apps/desktop/src/store/integrations.ts # pendingCount + ações para sync-worker
```

---

## Task 1: Helpers de fila pendente

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/pending-queue.ts`
- Create: `apps/desktop/src/lib/cloud-storage/pending-queue.test.ts`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/lib/cloud-storage/pending-queue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const dbMock = {
  select: vi.fn(),
  execute: vi.fn(),
}
vi.mock('../db.js', () => ({ getDb: vi.fn().mockResolvedValue(dbMock) }))

import { countPendingBackup, listPendingBackupSongs, getPendingTotalBytes } from './pending-queue.js'

describe('pending-queue helpers', () => {
  beforeEach(() => {
    dbMock.select.mockReset()
    dbMock.execute.mockReset()
  })

  it('countPendingBackup retorna 0 quando vazio', async () => {
    dbMock.select.mockResolvedValueOnce([{ cnt: 0 }])
    const n = await countPendingBackup('org-1')
    expect(n).toBe(0)
  })

  it('countPendingBackup conta apenas backup_status != uploaded', async () => {
    dbMock.select.mockResolvedValueOnce([{ cnt: 3 }])
    const n = await countPendingBackup('org-1')
    expect(n).toBe(3)
    expect(dbMock.select).toHaveBeenCalledWith(
      expect.stringContaining("backup_status != 'uploaded'"),
      ['org-1']
    )
  })

  it('listPendingBackupSongs retorna ids das músicas pendentes', async () => {
    dbMock.select.mockResolvedValueOnce([
      { id: 's1', title: 'A', backup_status: 'pending', original_format: 'mp3' },
      { id: 's2', title: 'B', backup_status: 'failed', original_format: 'wav' },
    ])
    const songs = await listPendingBackupSongs('org-1')
    expect(songs).toHaveLength(2)
    expect(songs[0]).toMatchObject({ id: 's1', backup_status: 'pending' })
  })

  it('getPendingTotalBytes soma cloud_file_size (estimativa)', async () => {
    dbMock.select.mockResolvedValueOnce([{ total: 50 * 1024 * 1024 }])
    const total = await getPendingTotalBytes('org-1')
    expect(total).toBe(50 * 1024 * 1024)
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop`:
`pnpm vitest run src/lib/cloud-storage/pending-queue.test.ts`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar pending-queue.ts**

Create `apps/desktop/src/lib/cloud-storage/pending-queue.ts`:

```typescript
import { getDb } from '../db.js'

export type PendingSong = {
  id: string
  title: string
  artist: string
  backup_status: 'pending' | 'failed' | 'no_account'
  original_format: string | null
}

/**
 * Conta músicas com backup pendente OU falhado (qualquer estado != 'uploaded').
 * Inclui 'no_account' (Drive não conectado ainda).
 */
export async function countPendingBackup(orgId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ cnt: number }[]>(
    "SELECT COUNT(*) as cnt FROM songs WHERE org_id = ? AND backup_status != 'uploaded'",
    [orgId]
  )
  return rows[0]?.cnt ?? 0
}

/** Lista músicas pendentes pra mostrar na UI ou alimentar o sync-worker. */
export async function listPendingBackupSongs(orgId: string): Promise<PendingSong[]> {
  const db = await getDb()
  return db.select<PendingSong[]>(
    "SELECT id, title, artist, backup_status, original_format FROM songs " +
    "WHERE org_id = ? AND backup_status != 'uploaded' ORDER BY created_at ASC",
    [orgId]
  )
}

/**
 * Estima o total de bytes que vão precisar ser carregados.
 * Usa cloud_file_size cacheado quando existe (uploads parciais);
 * caso contrário retorna 0 (não dá pra estimar sem ler o arquivo local).
 */
export async function getPendingTotalBytes(orgId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(cloud_file_size), 0) as total FROM songs " +
    "WHERE org_id = ? AND backup_status != 'uploaded'",
    [orgId]
  )
  return rows[0]?.total ?? 0
}
```

- [ ] **Step 4: Rodar teste**

Run: `pnpm vitest run src/lib/cloud-storage/pending-queue.test.ts`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/pending-queue.ts apps/desktop/src/lib/cloud-storage/pending-queue.test.ts
git commit -m "feat(cloud-storage): helpers pra contar músicas com backup pendente"
```

---

## Task 2: Componente LibraryBackupBanner

**Files:**
- Create: `apps/desktop/src/components/library/LibraryBackupBanner.tsx`
- Create: `apps/desktop/src/components/library/LibraryBackupBanner.test.tsx`

Make sure `apps/desktop/src/components/library/` exists (mkdir -p).

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/library/LibraryBackupBanner.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryBackupBanner } from './LibraryBackupBanner.js'

describe('LibraryBackupBanner', () => {
  it('não renderiza quando count = 0', () => {
    const { container } = render(<LibraryBackupBanner pendingCount={0} status="connected" onConfigure={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('mostra contagem + CTA "Configurar" quando disconnected', () => {
    const onConfigure = vi.fn()
    render(<LibraryBackupBanner pendingCount={12} status="disconnected" onConfigure={onConfigure} />)
    expect(screen.getByText(/12 músicas sem backup/i)).toBeInTheDocument()
    expect(screen.getByText(/configure o Drive/i)).toBeInTheDocument()
  })

  it('clicar Configurar dispara callback', async () => {
    const onConfigure = vi.fn()
    render(<LibraryBackupBanner pendingCount={5} status="disconnected" onConfigure={onConfigure} />)
    await userEvent.click(screen.getByRole('button', { name: /configurar/i }))
    expect(onConfigure).toHaveBeenCalled()
  })

  it('quota_full mostra cor vermelha + copy específico', () => {
    render(<LibraryBackupBanner pendingCount={3} status="quota_full" onConfigure={() => {}} />)
    expect(screen.getByText(/Drive cheio/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `pnpm vitest run src/components/library/LibraryBackupBanner.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/library/LibraryBackupBanner.tsx`:

```typescript
import { CloudOff, AlertCircle } from 'lucide-react'
import type { IntegrationStatus } from '../../store/integrations.js'

type Props = {
  pendingCount: number
  status: IntegrationStatus
  onConfigure: () => void
}

export function LibraryBackupBanner({ pendingCount, status, onConfigure }: Props) {
  if (pendingCount === 0) return null

  const critical = status === 'quota_full'
  const Icon = critical ? AlertCircle : CloudOff

  const message =
    status === 'quota_full' ? 'Drive cheio — backup pausado'
    : status === 'token_expired' ? 'Conexão com Drive expirou'
    : status === 'folder_missing' ? 'Pasta de backup não encontrada no Drive'
    : status === 'disconnected' ? `${pendingCount} música${pendingCount === 1 ? '' : 's'} sem backup. Configure o Drive pra guardar as músicas da igreja.`
    : `${pendingCount} música${pendingCount === 1 ? '' : 's'} aguardando upload.`

  const buttonLabel =
    status === 'disconnected' ? 'Configurar'
    : status === 'token_expired' ? 'Reconectar'
    : status === 'folder_missing' ? 'Recriar pasta'
    : 'Resolver'

  return (
    <div
      className="rounded-xl px-3.5 py-3 mb-3 flex items-center gap-3"
      style={{
        background: critical ? '#450a0a' : '#1c1917',
        border: critical ? '1px solid #7f1d1d' : '1px solid #422006',
      }}
    >
      <Icon size={18} color={critical ? '#ef4444' : '#fbbf24'} strokeWidth={2} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold" style={{ color: critical ? '#fecaca' : '#fde68a' }}>
          {message}
        </div>
      </div>
      <button
        onClick={onConfigure}
        className="rounded-md px-3 py-1.5 text-[12px] font-semibold flex-shrink-0"
        style={{
          background: critical ? '#ef4444' : '#a78bfa',
          color: '#09090b',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `pnpm vitest run src/components/library/LibraryBackupBanner.test.tsx`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/library/LibraryBackupBanner.tsx \
        apps/desktop/src/components/library/LibraryBackupBanner.test.tsx
git commit -m "feat(library): LibraryBackupBanner com estados conditional"
```

---

## Task 3: Componente BackupStatusBadge

**Files:**
- Create: `apps/desktop/src/components/library/BackupStatusBadge.tsx`
- Create: `apps/desktop/src/components/library/BackupStatusBadge.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/library/BackupStatusBadge.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BackupStatusBadge } from './BackupStatusBadge.js'

describe('BackupStatusBadge', () => {
  it('não renderiza nada quando uploaded', () => {
    const { container } = render(<BackupStatusBadge status="uploaded" />)
    expect(container.firstChild).toBeNull()
  })

  it('mostra ponto amarelo quando pending', () => {
    render(<BackupStatusBadge status="pending" />)
    const badge = screen.getByTestId('backup-status-badge')
    expect(badge).toHaveAttribute('title', 'Sem backup ainda')
  })

  it('mostra ponto vermelho quando failed', () => {
    render(<BackupStatusBadge status="failed" />)
    const badge = screen.getByTestId('backup-status-badge')
    expect(badge).toHaveAttribute('title', expect.stringMatching(/falhou/i))
  })

  it('mostra ponto cinza quando no_account', () => {
    render(<BackupStatusBadge status="no_account" />)
    const badge = screen.getByTestId('backup-status-badge')
    expect(badge).toHaveAttribute('title', expect.stringMatching(/Drive não configurado/i))
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `pnpm vitest run src/components/library/BackupStatusBadge.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/library/BackupStatusBadge.tsx`:

```typescript
import type { BackupStatus } from '@leviticus/core'

type Props = {
  status: BackupStatus
}

const STATUS_INFO: Record<BackupStatus, { color: string; title: string } | null> = {
  uploaded: null,
  pending: { color: '#fbbf24', title: 'Sem backup ainda' },
  failed: { color: '#ef4444', title: 'Backup falhou — vai tentar de novo' },
  no_account: { color: '#71717a', title: 'Drive não configurado' },
}

export function BackupStatusBadge({ status }: Props) {
  const info = STATUS_INFO[status]
  if (!info) return null

  return (
    <div
      data-testid="backup-status-badge"
      title={info.title}
      style={{
        width: 10,
        height: 10,
        background: info.color,
        border: '2px solid #0a0a0a',
        borderRadius: '50%',
        position: 'absolute',
        top: -3,
        right: -3,
        zIndex: 1,
      }}
    />
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `pnpm vitest run src/components/library/BackupStatusBadge.test.tsx`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/library/BackupStatusBadge.tsx \
        apps/desktop/src/components/library/BackupStatusBadge.test.tsx
git commit -m "feat(library): BackupStatusBadge — ponto colorido por status"
```

---

## Task 4: Componente BackupFilterChip

**Files:**
- Create: `apps/desktop/src/components/library/BackupFilterChip.tsx`
- Create: `apps/desktop/src/components/library/BackupFilterChip.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/library/BackupFilterChip.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BackupFilterChip } from './BackupFilterChip.js'

describe('BackupFilterChip', () => {
  it('mostra contagem + estado inativo', () => {
    render(<BackupFilterChip count={12} active={false} onToggle={() => {}} />)
    expect(screen.getByText(/Sem backup \(12\)/i)).toBeInTheDocument()
  })

  it('não renderiza quando count = 0', () => {
    const { container } = render(<BackupFilterChip count={0} active={false} onToggle={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('clicar dispara toggle', async () => {
    const onToggle = vi.fn()
    render(<BackupFilterChip count={3} active={false} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `pnpm vitest run src/components/library/BackupFilterChip.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/library/BackupFilterChip.tsx`:

```typescript
type Props = {
  count: number
  active: boolean
  onToggle: () => void
}

export function BackupFilterChip({ count, active, onToggle }: Props) {
  if (count === 0) return null

  return (
    <button
      onClick={onToggle}
      style={{
        background: active ? '#422006' : 'rgba(255,255,255,0.06)',
        color: active ? '#fbbf24' : '#a1a1aa',
        fontSize: 11,
        padding: '5px 10px',
        borderRadius: 99,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        background: '#fbbf24',
        borderRadius: '50%',
        display: 'inline-block',
      }} />
      Sem backup ({count})
    </button>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `pnpm vitest run src/components/library/BackupFilterChip.test.tsx`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/library/BackupFilterChip.tsx \
        apps/desktop/src/components/library/BackupFilterChip.test.tsx
git commit -m "feat(library): BackupFilterChip pra filtrar músicas sem backup"
```

---

## Task 5: Integrar banner + chip + filtro na Library

**Files:**
- Modify: `apps/desktop/src/pages/Library.tsx`

- [ ] **Step 1: Adicionar imports e hooks**

Edit `apps/desktop/src/pages/Library.tsx`. Adicionar imports:

```typescript
import { useNavigate } from 'react-router-dom'
import { LibraryBackupBanner } from '../components/library/LibraryBackupBanner.js'
import { BackupFilterChip } from '../components/library/BackupFilterChip.js'
import { countPendingBackup } from '../lib/cloud-storage/pending-queue.js'
import { useIntegrationsStore } from '../store/integrations.js'
```

- [ ] **Step 2: Adicionar estado pra pending count + filtro**

Dentro do componente, próximo às outras useState declarations:

```typescript
const navigate = useNavigate()
const cloudStatus = useIntegrationsStore((s) => s.status)
const [pendingCount, setPendingCount] = useState(0)
const [showOnlyPending, setShowOnlyPending] = useState(false)
```

- [ ] **Step 3: Carregar pendingCount no useEffect existente**

Localizar o `useEffect` que carrega `songs` (~linha 22-51). Após `setSongs(rows)` e similares, adicionar a contagem:

```typescript
const count = await countPendingBackup(orgId)
setPendingCount(count)
```

(Ainda dentro da função `load()` antes de `setLoading(false)`)

- [ ] **Step 4: Refresh do pendingCount quando integrations status muda**

Adicionar useEffect separado pra reagir a mudanças no cloudStatus:

```typescript
useEffect(() => {
  if (!orgId) return
  void countPendingBackup(orgId).then(setPendingCount)
}, [orgId, cloudStatus, librarySeed])
```

- [ ] **Step 5: Modificar filtragem pra incluir pending**

Modificar o cálculo de `filtered`:

```typescript
const filtered = songs.filter((s) => {
  const matchesSearch =
    !search ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.artist.toLowerCase().includes(search.toLowerCase())
  const matchesGroup =
    !groupFilter || (songGroupMap.get(s.id) ?? []).includes(groupFilter)
  const matchesBackup = !showOnlyPending || s.backup_status !== 'uploaded'
  return matchesSearch && matchesGroup && matchesBackup
})
```

- [ ] **Step 6: Renderizar banner antes do search/filters**

Localizar onde o input de busca está renderizado (`<input type="search"...` na linha ~131). ANTES do `<div className="flex gap-3 mb-4">` que envolve search+filtro, adicionar:

```typescript
<LibraryBackupBanner
  pendingCount={pendingCount}
  status={cloudStatus}
  onConfigure={() => navigate('/manage?tab=integrations')}
/>
```

- [ ] **Step 7: Renderizar chip ao lado do select de ministérios**

Localizar o `<select>` do groupFilter. Após o `</select>` mas DENTRO do mesmo `<div className="flex gap-3 mb-4">`, adicionar:

```typescript
<BackupFilterChip
  count={pendingCount}
  active={showOnlyPending}
  onToggle={() => setShowOnlyPending((v) => !v)}
/>
```

- [ ] **Step 8: Typecheck**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop`:
`pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/pages/Library.tsx
git commit -m "feat(library): integra BackupBanner + FilterChip + filtragem por backup_status"
```

---

## Task 6: Badge no SongCard

**Files:**
- Modify: `apps/desktop/src/components/SongCard.tsx`

- [ ] **Step 1: Localizar o thumbnail da capa**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus`:
`grep -n "thumbnail_url\|cover\|capa\|position:.*relative" apps/desktop/src/components/SongCard.tsx | head -10`

Identificar onde a capa (thumbnail) é renderizada. Normalmente um `<img>` ou `<div>` com fundo cover.

- [ ] **Step 2: Adicionar import**

Edit `apps/desktop/src/components/SongCard.tsx`. Adicionar no topo:

```typescript
import { BackupStatusBadge } from './library/BackupStatusBadge.js'
```

- [ ] **Step 3: Renderizar badge sobre a capa**

Localizar o container da capa (geralmente um `<div>` ou `<img>` em volta da thumbnail). Envolvê-lo num wrapper com `position: relative` (se ainda não tiver) e renderizar `<BackupStatusBadge status={song.backup_status} />` dentro do wrapper.

Padrão recomendado: encontrar o `<img>` ou `<div>` de capa e mudar o pai pra ter `position: relative`. Exemplo:

```typescript
// Antes:
<img src={song.thumbnail_url} ... />

// Depois:
<div style={{ position: 'relative', flexShrink: 0 }}>
  <img src={song.thumbnail_url} ... />
  <BackupStatusBadge status={song.backup_status} />
</div>
```

Adapte o exato estilo/marker já usado no SongCard.

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/SongCard.tsx
git commit -m "feat(library): SongCard mostra badge de backup status"
```

---

## Task 7: Módulo download-song.ts

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/download-song.ts`
- Create: `apps/desktop/src/lib/cloud-storage/download-song.test.ts`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/lib/cloud-storage/download-song.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client.js', () => ({
  generateDownloadUrl: vi.fn().mockResolvedValue({
    url: 'https://drive.google.com/download?file_id=fake',
    expiresAt: '2026-01-01',
  }),
}))
vi.mock('./download.js', () => ({
  downloadToFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/local/data/'),
}))

import { downloadSongFromDrive } from './download-song.js'
import { generateDownloadUrl } from './client.js'
import { downloadToFile } from './download.js'

describe('downloadSongFromDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('busca URL, baixa pro path local, valida hash quando fornecido', async () => {
    await downloadSongFromDrive({
      orgId: 'org-1',
      songId: 'song-1',
      cloudFileId: 'gd-file-1',
      ext: 'opus',
      expectedHash: 'abc123',
      expectedSize: 1024,
    })
    expect(generateDownloadUrl).toHaveBeenCalledWith('org-1', 'gd-file-1')
    expect(downloadToFile).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://drive.google.com/download?file_id=fake',
      expectedHash: 'abc123',
      expectedSize: 1024,
    }))
  })

  it('constrói destPath via appLocalDataDir + songId.ext', async () => {
    await downloadSongFromDrive({
      orgId: 'org-1',
      songId: 's2',
      cloudFileId: 'gd-2',
      ext: 'mp3',
    })
    expect(downloadToFile).toHaveBeenCalledWith(expect.objectContaining({
      destPath: '/local/data/audio/s2.mp3',
    }))
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `pnpm vitest run src/lib/cloud-storage/download-song.test.ts`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar download-song.ts**

Create `apps/desktop/src/lib/cloud-storage/download-song.ts`:

```typescript
import { appLocalDataDir } from '@tauri-apps/api/path'
import { generateDownloadUrl } from './client.js'
import { downloadToFile, type DownloadProgress } from './download.js'

export type DownloadSongOpts = {
  orgId: string
  songId: string
  cloudFileId: string
  ext: string
  expectedHash?: string
  expectedSize?: number
  onProgress?: (p: DownloadProgress) => void
  signal?: AbortSignal
}

/**
 * Baixa uma música do Drive pra $APPLOCALDATA/audio/{songId}.{ext}.
 * Composição: edge function gera URL temporária → cliente Tauri puxa o
 * arquivo + verifica hash + escreve atomicamente.
 */
export async function downloadSongFromDrive(opts: DownloadSongOpts): Promise<string> {
  const { url } = await generateDownloadUrl(opts.orgId, opts.cloudFileId)
  const baseDir = await appLocalDataDir()
  const destPath = `${baseDir}/audio/${opts.songId}.${opts.ext}`

  await downloadToFile({
    url,
    destPath,
    expectedHash: opts.expectedHash,
    expectedSize: opts.expectedSize,
    onProgress: opts.onProgress,
    signal: opts.signal,
  })

  return destPath
}
```

- [ ] **Step 4: Rodar teste**

Run: `pnpm vitest run src/lib/cloud-storage/download-song.test.ts`
Expected: 2/2 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/download-song.ts \
        apps/desktop/src/lib/cloud-storage/download-song.test.ts
git commit -m "feat(cloud-storage): download-song orquestrador (URL + downloadToFile)"
```

---

## Task 8: Wire play flow com download lazy

**Files:**
- Modify: `apps/desktop/src/lib/audio.ts` (ou onde `playSong` é chamado a partir do SongCard)

- [ ] **Step 1: Localizar onde música é tocada**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus`:
`grep -n "playSong\|currentSong\|setCurrentSong\|setIsPlaying" apps/desktop/src/components/SongCard.tsx | head -10`

E:
`grep -n "playSong\|setCurrentSong" apps/desktop/src/components/PlayerMini.tsx apps/desktop/src/store/player.ts | head -10`

Identifica o callsite de play (botão na SongCard que dispara o player). Provavelmente em SongCard.tsx tem um handler `handlePlay` ou similar que faz `usePlayerStore.getState().play(song)` ou similar.

- [ ] **Step 2: Adicionar download lazy antes do play**

Edit o handler de play (provavelmente em `SongCard.tsx`). Antes de iniciar o playback, verificar se arquivo local existe; se não, baixar do Drive:

```typescript
import { findSongFile } from '../lib/ytdlp.js'
import { downloadSongFromDrive } from '../lib/cloud-storage/download-song.js'
import { toastError } from '../store/toasts.js'

async function handlePlay() {
  // Já em uso — preservar lógica existente
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  // Detecta se arquivo local existe
  const localPath = await findSongFile(song.id)
  if (!localPath) {
    // Não tem local — tenta baixar do Drive
    if (!song.cloud_file_id) {
      toastError('Música sem backup e sem arquivo local. Adicione novamente.')
      return
    }
    try {
      // Indicador de progresso visual fica fora de escopo neste plano —
      // por ora apenas mostra toast + faz download bloqueante.
      const ext = song.original_format ?? 'mp3'
      await downloadSongFromDrive({
        orgId,
        songId: song.id,
        cloudFileId: song.cloud_file_id,
        ext,
        expectedHash: song.cloud_file_hash ?? undefined,
        expectedSize: song.cloud_file_size ?? undefined,
      })
    } catch (err) {
      console.error('Drive download failed:', err)
      toastError('Não foi possível baixar do Drive. Tente novamente.')
      return
    }
  }

  // Continuar com o play normal (que já existia antes desta task)
}
```

**IMPORTANT**: ajuste pra encaixar na lógica existente do `handlePlay` — não substitua, apenas adicione o download lazy ANTES do código de play.

- [ ] **Step 3: Typecheck**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop`:
`pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/SongCard.tsx
git commit -m "feat(library): play baixa do Drive automaticamente quando local sumiu"
```

---

## Task 9: Sync worker

**Files:**
- Create: `apps/desktop/src/lib/cloud-storage/sync-worker.ts`
- Create: `apps/desktop/src/lib/cloud-storage/sync-worker.test.ts`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/lib/cloud-storage/sync-worker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./pending-queue.js', () => ({
  listPendingBackupSongs: vi.fn().mockResolvedValue([]),
  countPendingBackup: vi.fn().mockResolvedValue(0),
}))
vi.mock('./upload-song.js', () => ({
  uploadSongToDrive: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../ytdlp.js', () => ({
  findSongFile: vi.fn().mockResolvedValue('/local/audio.mp3'),
}))

import { startSyncWorker, stopSyncWorker } from './sync-worker.js'
import { listPendingBackupSongs } from './pending-queue.js'
import { uploadSongToDrive } from './upload-song.js'

describe('sync-worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopSyncWorker()
    vi.useRealTimers()
  })

  it('startSyncWorker dispara primeira execução imediatamente', async () => {
    vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
      { id: 's1', title: 'A', artist: 'X', backup_status: 'pending', original_format: 'mp3' },
    ])
    startSyncWorker('org-1', { status: 'connected' })
    // Tick microtasks pra completar
    await vi.runOnlyPendingTimersAsync()
    expect(listPendingBackupSongs).toHaveBeenCalledWith('org-1')
    expect(uploadSongToDrive).toHaveBeenCalledWith(expect.objectContaining({
      songId: 's1',
    }))
  })

  it('NÃO sobe quando Drive desconectado', async () => {
    vi.mocked(listPendingBackupSongs).mockResolvedValueOnce([
      { id: 's1', title: 'A', artist: 'X', backup_status: 'pending', original_format: 'mp3' },
    ])
    startSyncWorker('org-1', { status: 'disconnected' })
    await vi.runOnlyPendingTimersAsync()
    expect(uploadSongToDrive).not.toHaveBeenCalled()
  })

  it('stopSyncWorker para de re-rodar', async () => {
    startSyncWorker('org-1', { status: 'connected' })
    await vi.runOnlyPendingTimersAsync()
    stopSyncWorker()
    vi.mocked(listPendingBackupSongs).mockClear()
    // Avança 10 min sem permitir microtasks → não deve rodar
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(listPendingBackupSongs).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `pnpm vitest run src/lib/cloud-storage/sync-worker.test.ts`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar sync-worker.ts**

Create `apps/desktop/src/lib/cloud-storage/sync-worker.ts`:

```typescript
import { listPendingBackupSongs } from './pending-queue.js'
import { uploadSongToDrive } from './upload-song.js'
import { findSongFile } from '../ytdlp.js'
import { appLocalDataDir } from '@tauri-apps/api/path'
import { isLossless, type AudioCategory } from './format-detection.js'

const RETRY_INTERVAL_MS = 5 * 60 * 1000  // 5 min entre passes

let intervalId: ReturnType<typeof setInterval> | null = null
let running = false

type StartOpts = {
  status: string  // IntegrationStatus mas evita import circular
}

/**
 * Inicia o worker. Dispara uma execução imediata + agenda repetições.
 * Idempotente — chamar duas vezes não cria dois workers.
 */
export function startSyncWorker(orgId: string, opts: StartOpts): void {
  if (intervalId) return
  void runPass(orgId, opts.status)
  intervalId = setInterval(() => { void runPass(orgId, opts.status) }, RETRY_INTERVAL_MS)
}

export function stopSyncWorker(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

async function runPass(orgId: string, status: string): Promise<void> {
  if (running) return
  if (status !== 'connected' && status !== 'quota_full') return
  // Pra simplificar — quando status='quota_full', tentamos mesmo assim
  // (pode ter havido limpeza no Drive e ainda não recheckou). Falha cai em
  // backup_status='failed' e fica pra próxima.
  running = true
  try {
    const songs = await listPendingBackupSongs(orgId)
    if (songs.length === 0) return

    for (const song of songs) {
      try {
        const localPath = await findSongFile(song.id)
        if (!localPath) {
          // Sem arquivo local pra subir — esse device não tem essa música.
          // Pulamos. Outro device com o arquivo vai subir quando rodar o
          // worker dele.
          continue
        }
        const ext = song.original_format ?? localPath.split('.').pop()?.toLowerCase() ?? 'mp3'
        const kind: AudioCategory = isLossless(ext) ? 'lossless' : 'lossy'
        await uploadSongToDrive({
          orgId,
          songId: song.id,
          filePath: localPath,
          ext,
          kind,
        })
      } catch (err) {
        // Já marcado como failed dentro de upload-song.ts. Continua pra próxima.
        console.warn('[sync-worker] upload failed for song', song.id, err)
      }
    }
  } finally {
    running = false
  }
}

// Helper exposta pra testes — força um pass síncrono.
export async function _runPassForTest(orgId: string, status: string): Promise<void> {
  return runPass(orgId, status)
}
```

- [ ] **Step 4: Rodar teste**

Run: `pnpm vitest run src/lib/cloud-storage/sync-worker.test.ts`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/cloud-storage/sync-worker.ts \
        apps/desktop/src/lib/cloud-storage/sync-worker.test.ts
git commit -m "feat(cloud-storage): sync-worker pra retry de uploads pendentes"
```

---

## Task 10: Bootstrap sync-worker em App.tsx

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Adicionar imports**

Edit `apps/desktop/src/App.tsx`. Adicionar:

```typescript
import { startSyncWorker, stopSyncWorker } from './lib/cloud-storage/sync-worker.js'
```

- [ ] **Step 2: Adicionar useEffect que reage a mudança de orgId/status**

Localizar dentro do componente App o `useEffect` que já lida com deep-link (criado em Plano 2 Task 3). Logo após, adicionar:

```typescript
useEffect(() => {
  const orgId = localStorage.getItem('leviticus_org_id')
  if (!orgId) return
  const status = useIntegrationsStore.getState().status
  startSyncWorker(orgId, { status })
  return () => { stopSyncWorker() }
}, [])
```

E reativar quando o status mudar (assinar o store):

```typescript
useEffect(() => {
  const unsub = useIntegrationsStore.subscribe((state, prev) => {
    if (state.status !== prev.status) {
      const orgId = localStorage.getItem('leviticus_org_id')
      if (!orgId) return
      stopSyncWorker()
      startSyncWorker(orgId, { status: state.status })
    }
  })
  return unsub
}, [])
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "feat(cloud-storage): bootstrap do sync-worker no boot do app"
```

---

## Task 11: Estados de erro dedicados em OrgIntegrations

**Files:**
- Modify: `apps/desktop/src/pages/org/OrgIntegrations.tsx`
- Create: `apps/desktop/src/components/integrations/TokenExpiredCard.tsx`
- Create: `apps/desktop/src/components/integrations/TokenExpiredCard.test.tsx`
- Create: `apps/desktop/src/components/integrations/FolderMissingCard.tsx`
- Create: `apps/desktop/src/components/integrations/FolderMissingCard.test.tsx`

- [ ] **Step 1: Criar TokenExpiredCard + teste**

Create `apps/desktop/src/components/integrations/TokenExpiredCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TokenExpiredCard } from './TokenExpiredCard.js'

describe('TokenExpiredCard', () => {
  it('mostra mensagem de reconectar + botão', async () => {
    const onReconnect = vi.fn()
    render(<TokenExpiredCard email="x@y.com" onReconnect={onReconnect} canConnect />)
    expect(screen.getByText(/conexão expirou/i)).toBeInTheDocument()
    expect(screen.getByText(/x@y\.com/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /reconectar/i }))
    expect(onReconnect).toHaveBeenCalled()
  })

  it('canConnect=false desabilita botão', () => {
    render(<TokenExpiredCard email="x@y.com" onReconnect={() => {}} canConnect={false} />)
    expect(screen.getByRole('button', { name: /reconectar/i })).toBeDisabled()
  })
})
```

Run: `pnpm vitest run src/components/integrations/TokenExpiredCard.test.tsx` → FAIL.

Create `apps/desktop/src/components/integrations/TokenExpiredCard.tsx`:

```typescript
import { AlertTriangle } from 'lucide-react'

type Props = {
  email: string
  canConnect: boolean
  onReconnect: () => void
}

export function TokenExpiredCard({ email, canConnect, onReconnect }: Props) {
  return (
    <div className="rounded-xl p-[18px]" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid #78350f',
    }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
          style={{ background: '#422006', border: '1px solid #78350f' }}>
          <AlertTriangle size={18} color="#fbbf24" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Conexão expirou
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
            {email} · token revogado ou expirado no Google
          </div>
        </div>
      </div>
      <p className="text-[12px] leading-relaxed mb-3" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        Faça o login no Google de novo pra retomar uploads. Os arquivos que estão no Drive continuam acessíveis depois da reconexão.
      </p>
      <button
        onClick={onReconnect}
        disabled={!canConnect}
        className="rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#a78bfa', color: '#09090b', border: 'none' }}
      >
        Reconectar Google Drive
      </button>
    </div>
  )
}
```

Run: tests pass.

- [ ] **Step 2: Criar FolderMissingCard + teste**

Create `apps/desktop/src/components/integrations/FolderMissingCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FolderMissingCard } from './FolderMissingCard.js'

describe('FolderMissingCard', () => {
  it('mostra mensagem + botão Recriar pasta', async () => {
    const onRecreate = vi.fn()
    render(<FolderMissingCard email="x@y.com" onRecreate={onRecreate} canManage />)
    expect(screen.getByText(/pasta de backup não encontrada/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /recriar pasta/i }))
    expect(onRecreate).toHaveBeenCalled()
  })
})
```

Create `apps/desktop/src/components/integrations/FolderMissingCard.tsx`:

```typescript
import { FolderX } from 'lucide-react'

type Props = {
  email: string
  canManage: boolean
  onRecreate: () => void
}

export function FolderMissingCard({ email, canManage, onRecreate }: Props) {
  return (
    <div className="rounded-xl p-[18px]" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid #78350f',
    }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
          style={{ background: '#422006', border: '1px solid #78350f' }}>
          <FolderX size={18} color="#fbbf24" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Pasta de backup não encontrada
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
            {email} · a pasta "Leviticus" foi removida do Drive
          </div>
        </div>
      </div>
      <p className="text-[12px] leading-relaxed mb-3" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        Clique pra recriar a pasta. As músicas que estavam dentro foram perdidas — vamos refazer os uploads automaticamente.
      </p>
      <button
        onClick={onRecreate}
        disabled={!canManage}
        className="rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#a78bfa', color: '#09090b', border: 'none' }}
      >
        Recriar pasta
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Integrar em OrgIntegrations**

Edit `apps/desktop/src/pages/org/OrgIntegrations.tsx`. Adicionar imports:

```typescript
import { TokenExpiredCard } from '../../components/integrations/TokenExpiredCard.js'
import { FolderMissingCard } from '../../components/integrations/FolderMissingCard.js'
```

Localizar onde tem `{(status === 'token_expired' || status === 'folder_missing') && <ConnectDriveCard .../>}` (a renderização genérica feita no Plano 2). Substituir por:

```typescript
{status === 'token_expired' && account && (
  <TokenExpiredCard
    email={account.account_email}
    canConnect={canManage}
    onReconnect={handleConnect}
  />
)}

{status === 'folder_missing' && account && (
  <FolderMissingCard
    email={account.account_email}
    canManage={canManage}
    onRecreate={handleConnect}
  />
)}
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm tsc --noEmit` → 0 erros

```bash
git add apps/desktop/src/components/integrations/TokenExpiredCard.tsx \
        apps/desktop/src/components/integrations/TokenExpiredCard.test.tsx \
        apps/desktop/src/components/integrations/FolderMissingCard.tsx \
        apps/desktop/src/components/integrations/FolderMissingCard.test.tsx \
        apps/desktop/src/pages/org/OrgIntegrations.tsx
git commit -m "feat(integrations): UI dedicada pra token_expired e folder_missing"
```

---

## Task 12: E2E spec — backup states na biblioteca

**Files:**
- Create: `apps/desktop/e2e/specs/16-library-backup-states.spec.ts`

- [ ] **Step 1: Escrever spec**

Create `apps/desktop/e2e/specs/16-library-backup-states.spec.ts`:

```typescript
// apps/desktop/e2e/specs/16-library-backup-states.spec.ts
//
// Journey #12 — Biblioteca backup status (banner + badge + filter chip).
//
// Pré-seedando songs com diferentes backup_status via service-role client
// + invoke direto no SQLite local (mesmo pattern do spec 15). Cobre:
//   T1 — biblioteca sem músicas pendentes não mostra banner
//   T2 — biblioteca com pendentes mostra banner com contagem
//   T3 — chip "Sem backup" filtra apenas pendentes

import { browser, $, expect } from '@wdio/globals'
import {
  makeAdminClient,
  createTestUser,
  createOrgWithOwner,
  createSongForOrg,
} from '../helpers/supabase.js'
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'

describe('Journey #12 — Biblioteca backup states', () => {
  let email: string
  let password: string
  let userId: string
  let orgId: string
  let orgName: string
  let songIds: string[] = []

  before(async () => {
    email = `lib-backup+${Date.now()}@leviticus.test`
    password = 'senha-do-teste-e2e'
    orgName = `Lib Igreja ${Date.now()}`
    await cleanLocalSqlite()

    const admin = makeAdminClient()
    const user = await createTestUser(admin, { email, password })
    userId = user.id
    const org = await createOrgWithOwner(admin, userId, orgName)
    orgId = org.id

    // Seed 3 músicas com backup_status diferentes
    const s1 = await createSongForOrg(admin, orgId, userId, 'Música Uploaded', 'Artista A')
    const s2 = await createSongForOrg(admin, orgId, userId, 'Música Pending', 'Artista B')
    const s3 = await createSongForOrg(admin, orgId, userId, 'Música Failed', 'Artista C')
    songIds = [s1, s2, s3]

    // Marca cada uma com seu status
    await admin.from('songs').update({ backup_status: 'uploaded' }).eq('id', s1)
    await admin.from('songs').update({ backup_status: 'pending' }).eq('id', s2)
    await admin.from('songs').update({ backup_status: 'failed' }).eq('id', s3)

    // Login
    await browser.waitUntil(
      async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
      { timeout: 30_000 }
    )
    await $('input[type=email]').waitForExist({ timeout: 30_000 })
    await setReactInputValue('input#email', email)
    await setReactInputValue('input#password', password)
    await $('button[type=submit]').click()
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      { timeout: 30_000 }
    )
    const orgBtn = $(`button*=${orgName}`)
    await orgBtn.waitForExist({ timeout: 10_000 })
    await orgBtn.click()
    await browser.waitUntil(
      async () => /\/library/.test(await browser.getUrl()),
      { timeout: 90_000 }
    )
  })

  it('T1 — banner mostra contagem de pendentes (2)', async () => {
    // 1 uploaded + 1 pending + 1 failed = 2 não-uploaded
    const banner = $('div*=2 músicas sem backup')
    await banner.waitForExist({ timeout: 10_000, timeoutMsg: 'Banner did not render with count' })
  })

  it('T2 — chip "Sem backup (2)" aparece', async () => {
    const chip = $('button*=Sem backup (2)')
    await chip.waitForExist({ timeout: 5_000, timeoutMsg: 'Chip did not render' })
  })

  it('T3 — clicar no chip filtra só pendentes', async () => {
    const chip = $('button*=Sem backup (2)')
    await chip.click()

    // Após filtrar, "Música Uploaded" não deve aparecer
    const uploadedSong = $('div*=Música Uploaded')
    await browser.waitUntil(
      async () => !(await uploadedSong.isExisting()),
      { timeout: 5_000, timeoutMsg: '"Música Uploaded" ainda visível após filtrar' }
    )

    // Mas "Música Pending" e "Música Failed" devem aparecer
    await $('div*=Música Pending').waitForExist({ timeout: 5_000 })
    await $('div*=Música Failed').waitForExist({ timeout: 5_000 })
  })
})
```

- [ ] **Step 2: Rodar spec**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop/e2e`:
```
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env 2>&1 | grep "^SERVICE_ROLE_KEY=" | cut -d'"' -f2) npx wdio run ./wdio.local.conf.ts --spec specs/16-library-backup-states.spec.ts
```

Expected: 3/3 passing. Se algum selector falhar, ajuste com base nos mesmos princípios usados no spec 15 (element prefix nos partial selectors).

**IMPORTANTE**: lembrar de rebuildar o bundle dev antes (`pnpm tauri build --debug --config src-tauri/tauri.conf.dev.json`) — o spec roda contra o `.app` instalado, não o `tauri dev`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/e2e/specs/16-library-backup-states.spec.ts
git commit -m "test(e2e): spec 16 — biblioteca backup states (banner + chip + filtro)"
```

---

## Task 13: Smoke test + DoD

**Files:** (sem mudanças de código — validação)

- [ ] **Step 1: Typecheck monorepo**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus`:
`pnpm typecheck`
Expected: 0 erros

- [ ] **Step 2: Testes vitest**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop`:
`pnpm test`
Expected: TODOS passam (cerca de 25+ testes novos)

- [ ] **Step 3: Rebuildar bundle dev**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop`:
`pnpm tauri build --debug --config src-tauri/tauri.conf.dev.json`
Expected: build completa, `Leviticus Dev.app` atualizado

Re-registrar no LaunchServices:
```bash
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "/Users/joaosipauba/Projects/pessoal/leviticus/apps/desktop/src-tauri/target/debug/bundle/macos/Leviticus Dev.app"
```

- [ ] **Step 4: E2E suite completa**

Run from `/Users/joaosipauba/Projects/pessoal/leviticus`:
`pnpm --filter leviticus-e2e e2e:local`
Expected: TODOS os specs passam (15 anteriores + spec 16 novo = 16/16). Spec 14 T2 pode ser flaky — re-rodar se falhar nele.

- [ ] **Step 5: Smoke test manual no app**

Subir o app:
```bash
cd apps/desktop && pnpm tauri:dev
```

Em outro terminal:
```bash
supabase functions serve cloud-storage-proxy --env-file supabase/.env.local --no-verify-jwt
```

Manualmente validar:
- [ ] Biblioteca com apenas músicas uploaded → sem banner, sem chip
- [ ] Adicionar música (Drive desconectado) → aparece banner "X músicas sem backup, Configurar"
- [ ] Conectar Drive → banner ainda aparece com botão "Resolver", até sync-worker subir tudo
- [ ] Após uploads completarem → banner some
- [ ] Apagar arquivo local manualmente em `~/Library/Application Support/com.leviticus.app.dev/audio/` → clicar play na música → app baixa do Drive transparentemente
- [ ] Token expired: revogar permissão no https://myaccount.google.com/permissions → próximo refresh do quota dispara estado → UI mostra TokenExpiredCard
- [ ] Folder missing: apagar pasta "Leviticus" no Drive manualmente → próxima operação detecta → FolderMissingCard

- [ ] **Step 6: Commit final**

Editar este plano marcando todos os checkboxes como `[x]`.

```bash
git add docs/superpowers/plans/2026-05-16-cloud-storage-library-sync.md
git commit -m "docs(plan): marca Plano 4 como completo — feature Cloud Storage finalizada"
```

---

## Critérios de aceitação (DoD do Plano 4)

Antes de fechar a feature:

- [ ] LibraryBackupBanner aparece quando há músicas com backup != uploaded
- [ ] BackupStatusBadge mostra ponto colorido no canto da capa (amarelo=pending, vermelho=failed, cinza=no_account)
- [ ] BackupFilterChip filtra biblioteca pra mostrar só pendentes
- [ ] Click play em música sem arquivo local com cloud_file_id → baixa do Drive automaticamente
- [ ] sync-worker roda no boot + a cada 5 min, tenta upload das pendentes
- [ ] Sync-worker pula quando Drive desconectado
- [ ] TokenExpiredCard renderiza em status='token_expired' com botão Reconectar
- [ ] FolderMissingCard renderiza em status='folder_missing' com botão Recriar
- [ ] `pnpm typecheck` 0 erros monorepo
- [ ] `pnpm test` todos passam (Plano 4 adiciona ~25+ testes)
- [ ] `pnpm --filter leviticus-e2e e2e:local` — 16/16 specs verdes
- [ ] Bundle dev rebuildado + registrado no LaunchServices
- [ ] Cobertura visual manual: 6 cenários acima

### Limitações conhecidas (sem prazo)

- **Setup inicial automático** (admin sobe biblioteca existente ao conectar Drive pela primeira vez): NÃO implementado nessa iteração. O sync-worker eventualmente pega tudo, mas pode levar várias passes de 5min. Pode virar issue follow-up.
- **Conflict resolution** quando 2 membros sobem a mesma música: O sync-worker confia no INSERT do song row. Se 2 devices têm o mesmo arquivo, o segundo só faz upload da DIFERENÇA (mesma song_id, vai tentar upsert no Drive — Google Drive permite duplicatas no mesmo folder, criando ID novo). Resolução manual via UI fica pra futuro.
- **Retry com backoff exponencial**: o sync-worker hoje usa intervalo fixo de 5min. Backoff exponencial pra erros transientes (rate limit, 5xx) seria melhor — issue follow-up.
- **Estado offline**: quando offline, o worker ainda tenta e falha silenciosamente. Banner não diferencia "offline" de "Drive cheio" — issue separada.
