# Cloud Storage UI — Tab Integrações (Plano 2 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a tab "Integrações" na página Organização com a UI completa pra conectar/desconectar/trocar a conta do Google Drive, exibir quota usada (barra segmentada + stats) e tratar todos os estados de erro (token expirado, drive cheio, pasta apagada). Consome a fundação backend do Plano 1.

**Architecture:** Nova tab `OrgIntegrations` em `OrgManage.tsx`. Estado gerenciado via zustand store `integrations.ts` que faz fetch de `cloud_storage_accounts_public` (SQLite local, populado pelo sync) + quota via edge function. Componentes desacoplados: `ConnectDriveCard`, `ConnectedAccountCard`, `QuotaBar`, `SwapAccountModal`, `DisconnectModal`. Deep link `leviticus://oauth-success` é capturado em `App.tsx` e dispara refresh do store. Permissão `manage_integrations` gateia botões de ação — membros sem perm veem o estado read-only.

**Tech Stack:** React 18, TypeScript, Zustand, Tauri v2 (`@tauri-apps/plugin-deep-link`, `@tauri-apps/plugin-shell` para `openUrl`), Vitest + React Testing Library + jsdom, Tailwind via CSS vars.

---

## Pré-requisitos

- [x] Plano 1 (Fundação) completo: `cloud_storage` schema, edge function `cloud-storage-proxy`, `src/lib/cloud-storage/*`, comandos Rust de hash/rename, plugin deep-link instalado, allow-list HTTP do Google.
- [ ] Secrets configurados no Supabase: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_STATE_SECRET`. ([Issue #24](https://github.com/JoaoSipauba/leviticus/issues/24))
- [ ] Edge function deployada em Supabase remoto (`supabase functions deploy cloud-storage-proxy`). Pode usar local pra desenvolvimento.

Se não estiver pronto, pause antes da Task 5 (que dispara OAuth real).

---

## Tracking de issues

Durante este plano, sempre que encontrar bug/melhoria/dívida fora do escopo da task atual, abra issue conforme convenção em `CLAUDE.md` (seção "Acompanhar achados"). Categorias: `type:bug|security|performance|ux|enhancement|feature|tech-debt|dx|docs`. Prioridades: `priority:critical|high|medium|low`.

---

## Estrutura de arquivos

### Criados

```
apps/desktop/src/store/integrations.ts             # Zustand: state do cloud_storage_account
apps/desktop/src/store/integrations.test.ts

apps/desktop/src/lib/deep-link.ts                  # Listener leviticus:// + parsing
apps/desktop/src/lib/deep-link.test.ts

apps/desktop/src/pages/org/OrgIntegrations.tsx     # Container da tab
apps/desktop/src/pages/org/OrgIntegrations.test.tsx

apps/desktop/src/components/integrations/
  ConnectDriveCard.tsx                              # Estado desconectado
  ConnectDriveCard.test.tsx
  ConnectedAccountCard.tsx                          # Estado conectado (header + ações)
  ConnectedAccountCard.test.tsx
  QuotaBar.tsx                                      # Barra segmentada + legenda
  QuotaBar.test.tsx
  StatsRow.tsx                                      # 38 músicas / em dia
  StatsRow.test.tsx
  DriveFullCard.tsx                                 # Estado vermelho (Drive cheio)
  DriveFullCard.test.tsx
  RecoveryActions.tsx                               # Liberar/upgrade/trocar
  RecoveryActions.test.tsx
  SwapAccountModal.tsx                              # Confirmação transparente
  SwapAccountModal.test.tsx
  DisconnectModal.tsx                               # Type-to-confirm pra desconectar
  DisconnectModal.test.tsx
  AdminsList.tsx                                    # Lista pra "avisar admin" (membro sem perm)
  AdminsList.test.tsx
```

### Modificados

```
apps/desktop/src/pages/OrgManage.tsx               # Registrar nova tab "Integrações"
apps/desktop/src/App.tsx                           # Bootstrap do deep-link listener
apps/desktop/src/lib/permissions.ts                # Nada — manage_integrations já no Permission
```

---

## Task 1: Store zustand `integrations.ts`

**Files:**
- Create: `apps/desktop/src/store/integrations.ts`
- Create: `apps/desktop/src/store/integrations.test.ts`

- [ ] **Step 1: Escrever teste do shape do store**

Create `apps/desktop/src/store/integrations.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([]),
  }),
}))
vi.mock('../lib/cloud-storage/client.js', () => ({
  getQuota: vi.fn(),
  initOAuth: vi.fn(),
  disconnect: vi.fn(),
}))

import { useIntegrationsStore } from './integrations.js'
import { getDb } from '../lib/db.js'

describe('integrationsStore', () => {
  beforeEach(() => {
    useIntegrationsStore.setState({ account: null, quota: null, status: 'unknown', error: null })
  })

  it('inicializa com account null e status unknown', () => {
    const s = useIntegrationsStore.getState()
    expect(s.account).toBeNull()
    expect(s.status).toBe('unknown')
  })

  it('refreshAccount carrega do SQLite quando existe', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([{
      org_id: 'o1',
      provider: 'google_drive',
      account_email: 'a@b.c',
      account_user_id: 'u1',
      app_folder_id: 'f1',
      connected_by: null,
      connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: 1000,
      last_quota_used: 500,
      last_quota_check_at: '2026-05-15T00:00:00Z',
      updated_at: '2026-05-15T00:00:00Z',
    }])

    await useIntegrationsStore.getState().refreshAccount('o1')

    const s = useIntegrationsStore.getState()
    expect(s.account?.account_email).toBe('a@b.c')
    expect(s.status).toBe('connected')
  })

  it('refreshAccount marca status disconnected quando vazio', async () => {
    ;(await getDb() as any).select.mockResolvedValueOnce([])
    await useIntegrationsStore.getState().refreshAccount('o1')
    expect(useIntegrationsStore.getState().status).toBe('disconnected')
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/store/integrations.test.ts`
Expected: FAIL — `Cannot find module './integrations.js'`

- [ ] **Step 3: Criar o store**

Create `apps/desktop/src/store/integrations.ts`:

```typescript
import { create } from 'zustand'
import type { CloudStorageAccount, QuotaInfo } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import * as cs from '../lib/cloud-storage/client.js'

export type IntegrationStatus =
  | 'unknown'
  | 'disconnected'
  | 'connected'
  | 'token_expired'
  | 'folder_missing'
  | 'quota_full'

type IntegrationsState = {
  account: CloudStorageAccount | null
  quota: QuotaInfo | null
  status: IntegrationStatus
  error: string | null
  refreshing: boolean

  refreshAccount: (orgId: string) => Promise<void>
  refreshQuota: (orgId: string) => Promise<void>
  setStatus: (status: IntegrationStatus) => void
  setError: (error: string | null) => void
}

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
  account: null,
  quota: null,
  status: 'unknown',
  error: null,
  refreshing: false,

  async refreshAccount(orgId: string) {
    if (get().refreshing) return
    set({ refreshing: true })
    try {
      const db = await getDb()
      const rows = await db.select<CloudStorageAccount[]>(
        'SELECT org_id, provider, account_email, account_user_id, app_folder_id, connected_by, connected_at, last_quota_total, last_quota_used, last_quota_check_at, updated_at FROM cloud_storage_accounts WHERE org_id = ?',
        [orgId]
      )
      if (rows.length > 0) {
        const acc = rows[0]
        // Derive status from quota if known
        const used = acc.last_quota_used ?? 0
        const total = acc.last_quota_total ?? 0
        const ratio = total > 0 ? used / total : 0
        set({
          account: acc,
          quota: total > 0 ? { total, used, available: Math.max(0, total - used) } : null,
          status: ratio >= 1 ? 'quota_full' : 'connected',
          error: null,
        })
      } else {
        set({ account: null, quota: null, status: 'disconnected', error: null })
      }
    } finally {
      set({ refreshing: false })
    }
  },

  async refreshQuota(orgId: string) {
    try {
      const quota = await cs.getQuota(orgId)
      const ratio = quota.total > 0 ? quota.used / quota.total : 0
      set({
        quota,
        status: ratio >= 1 ? 'quota_full' : 'connected',
        error: null,
      })
    } catch (err) {
      const e = err as { code?: string; message: string }
      if (e.code === 'invalid_grant') {
        set({ status: 'token_expired', error: e.message })
      } else {
        set({ error: e.message })
      }
    }
  },

  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
}))
```

- [ ] **Step 4: Rodar teste, verificar passa**

Run: `cd apps/desktop && pnpm vitest run src/store/integrations.test.ts`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/store/integrations.ts apps/desktop/src/store/integrations.test.ts
git commit -m "feat(integrations): store zustand pra estado do cloud storage account"
```

---

## Task 2: Listener de deep link

**Files:**
- Create: `apps/desktop/src/lib/deep-link.ts`
- Create: `apps/desktop/src/lib/deep-link.test.ts`

- [ ] **Step 1: Escrever teste do parser de URL**

Create `apps/desktop/src/lib/deep-link.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseDeepLink, isOAuthSuccess } from './deep-link.js'

describe('parseDeepLink', () => {
  it('parseia leviticus://oauth-success?org_id=abc', () => {
    const result = parseDeepLink('leviticus://oauth-success?org_id=abc-123')
    expect(result).toEqual({ kind: 'oauth-success', orgId: 'abc-123' })
  })

  it('retorna null pra URL desconhecida', () => {
    expect(parseDeepLink('leviticus://unknown')).toBeNull()
  })

  it('retorna null pra protocolo diferente', () => {
    expect(parseDeepLink('https://example.com/oauth-success?org_id=x')).toBeNull()
  })

  it('retorna null se org_id faltar', () => {
    expect(parseDeepLink('leviticus://oauth-success')).toBeNull()
  })
})

describe('isOAuthSuccess', () => {
  it('true pra leviticus://oauth-success', () => {
    expect(isOAuthSuccess('leviticus://oauth-success?org_id=x')).toBe(true)
  })
  it('false pra outras', () => {
    expect(isOAuthSuccess('leviticus://other')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/lib/deep-link.test.ts`
Expected: FAIL — module não existe

- [ ] **Step 3: Criar o módulo**

Create `apps/desktop/src/lib/deep-link.ts`:

```typescript
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'

export type DeepLinkEvent =
  | { kind: 'oauth-success'; orgId: string }

const PROTOCOL = 'leviticus://'

export function parseDeepLink(raw: string): DeepLinkEvent | null {
  if (!raw.startsWith(PROTOCOL)) return null
  try {
    const url = new URL(raw)
    if (url.host === 'oauth-success') {
      const orgId = url.searchParams.get('org_id')
      if (!orgId) return null
      return { kind: 'oauth-success', orgId }
    }
    return null
  } catch {
    return null
  }
}

export function isOAuthSuccess(raw: string): boolean {
  return parseDeepLink(raw)?.kind === 'oauth-success'
}

/**
 * Registra um listener de deep links no boot do app.
 * Chama o callback toda vez que o app receber um deep link conhecido.
 * Retorna unsubscribe.
 */
export async function listenForDeepLinks(
  onEvent: (event: DeepLinkEvent) => void
): Promise<() => void> {
  const unlisten = await onOpenUrl((urls: string[]) => {
    for (const raw of urls) {
      const parsed = parseDeepLink(raw)
      if (parsed) onEvent(parsed)
    }
  })
  return unlisten
}
```

- [ ] **Step 4: Rodar teste, verificar passa**

Run: `cd apps/desktop && pnpm vitest run src/lib/deep-link.test.ts`
Expected: 5/5 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/deep-link.ts apps/desktop/src/lib/deep-link.test.ts
git commit -m "feat(deep-link): parser + listener de leviticus:// URLs"
```

---

## Task 3: Bootstrap do deep-link no App.tsx

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Inspecionar App.tsx atual**

Run: `cat apps/desktop/src/App.tsx | head -80`
Identifique onde useEffect de inicialização existem (auth, sync, etc.).

- [ ] **Step 2: Adicionar import e useEffect pro deep-link listener**

Edit `apps/desktop/src/App.tsx`. Adicionar no topo (após outros imports do `./lib/`):

```typescript
import { listenForDeepLinks } from './lib/deep-link.js'
import { useIntegrationsStore } from './store/integrations.js'
```

E adicionar um `useEffect` (próximo aos outros effects de bootstrap, dentro do componente App):

```typescript
useEffect(() => {
  let unlisten: (() => void) | null = null
  void (async () => {
    unlisten = await listenForDeepLinks((event) => {
      if (event.kind === 'oauth-success') {
        // Refresh do account vem do sync que dispara via Supabase realtime,
        // mas chamamos refreshAccount imediato pra fechar modais e atualizar UI.
        const orgId = localStorage.getItem('leviticus_org_id')
        if (orgId === event.orgId) {
          void useIntegrationsStore.getState().refreshAccount(orgId)
        }
      }
    })
  })()
  return () => { unlisten?.() }
}, [])
```

**Importante:** este effect roda UMA vez no mount, sem dependências. O `unlisten` é executado no unmount (raro — App quase nunca desmonta).

- [ ] **Step 3: Build e check**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "feat(app): registra deep-link listener no boot pra OAuth callback"
```

---

## Task 4: Componente `ConnectDriveCard`

**Files:**
- Create: `apps/desktop/src/components/integrations/ConnectDriveCard.tsx`
- Create: `apps/desktop/src/components/integrations/ConnectDriveCard.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/ConnectDriveCard.test.tsx`:

```typescript
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
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/ConnectDriveCard.test.tsx`
Expected: FAIL — component não existe

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/ConnectDriveCard.tsx`:

```typescript
import { Cloud } from 'lucide-react'

type Props = {
  onConnect: () => void
  canConnect: boolean
  connecting?: boolean
}

export function ConnectDriveCard({ onConnect, canConnect, connecting }: Props) {
  return (
    <div className="rounded-xl p-6 text-center" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid var(--border-divider, #27272a)',
    }}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: 'var(--bg-accent, #27272a)' }}>
        <Cloud size={24} color="#a78bfa" strokeWidth={2} />
      </div>
      <div className="mb-1.5 text-[15px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
        Drive ainda não configurado
      </div>
      {connecting ? (
        <div className="text-[12px]" style={{ color: 'var(--text-muted, #71717a)' }}>
          Abrindo navegador… autorize no Google e volte pro app.
        </div>
      ) : (
        <>
          <div className="mx-auto mb-4 max-w-[360px] text-[12px] leading-relaxed"
            style={{ color: 'var(--text-muted, #71717a)' }}>
            Vai abrir o login do Google. Autorize acesso à pasta "Leviticus" que vai ser criada no seu Drive.
          </div>
          {!canConnect && (
            <div className="mb-3 text-[11px]" style={{ color: 'var(--text-warning, #fbbf24)' }}>
              Você não tem permissão pra gerenciar integrações. Peça pra um admin conectar.
            </div>
          )}
          <button
            onClick={onConnect}
            disabled={!canConnect || connecting}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#a78bfa', color: '#09090b' }}
          >
            Conectar Google Drive
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/ConnectDriveCard.test.tsx`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/ConnectDriveCard.tsx \
        apps/desktop/src/components/integrations/ConnectDriveCard.test.tsx
git commit -m "feat(integrations): ConnectDriveCard pra estado desconectado"
```

---

## Task 5: Componente `QuotaBar`

**Files:**
- Create: `apps/desktop/src/components/integrations/QuotaBar.tsx`
- Create: `apps/desktop/src/components/integrations/QuotaBar.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/QuotaBar.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuotaBar } from './QuotaBar.js'

describe('QuotaBar', () => {
  it('mostra total formatado em GB', () => {
    render(<QuotaBar total={16106127360} usedByLeviticus={142 * 1024 * 1024} usedByOthers={5 * 1024 * 1024 * 1024} />)
    // 16106127360 bytes = 15 GB
    expect(screen.getByText(/15 GB/)).toBeInTheDocument()
  })

  it('mostra "0 MB livres" quando uso = total', () => {
    const total = 1024 * 1024 * 1024
    render(<QuotaBar total={total} usedByLeviticus={0} usedByOthers={total} />)
    expect(screen.getByText(/0 MB livres/)).toBeInTheDocument()
  })

  it('exibe legenda dos 3 segmentos', () => {
    render(<QuotaBar total={1000 * 1024 * 1024} usedByLeviticus={200 * 1024 * 1024} usedByOthers={300 * 1024 * 1024} />)
    expect(screen.getByText('Leviticus')).toBeInTheDocument()
    expect(screen.getByText(/Outros arquivos/)).toBeInTheDocument()
    expect(screen.getByText(/Livre/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/QuotaBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/QuotaBar.tsx`:

```typescript
type Props = {
  total: number          // bytes
  usedByLeviticus: number
  usedByOthers: number
  warning?: boolean      // amarelo/laranja
  critical?: boolean     // vermelho
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function QuotaBar({ total, usedByLeviticus, usedByOthers, warning, critical }: Props) {
  const totalUsed = usedByLeviticus + usedByOthers
  const free = Math.max(0, total - totalUsed)
  const pctLeviticus = total > 0 ? Math.max(1, (usedByLeviticus / total) * 100) : 0  // mínimo 1% pra ser visível
  const pctOthers = total > 0 ? (usedByOthers / total) * 100 : 0
  const otherColor = critical ? '#ef4444' : warning ? '#fbbf24' : '#52525b'
  const freeLabelColor = critical ? '#ef4444' : free > 0 ? '#22c55e' : '#ef4444'

  return (
    <div className="rounded-lg p-3.5" style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            {fmtBytes(totalUsed)}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            {' '}de {fmtBytes(total)} usados
          </span>
        </div>
        <span className="text-[11px] font-medium" style={{ color: freeLabelColor }}>
          {fmtBytes(free)} {free > 0 ? 'livres' : 'livres'}
        </span>
      </div>

      <div className="flex h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--bg-divider, #27272a)' }}>
        {pctLeviticus > 0 && (
          <div style={{ width: `${pctLeviticus}%`, background: '#a78bfa', minWidth: 3 }} />
        )}
        {pctOthers > 0 && (
          <div style={{ width: `${pctOthers}%`, background: otherColor }} />
        )}
      </div>

      <div className="mt-2.5 flex gap-3.5 text-[10px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        <Legend color="#a78bfa" label="Leviticus" value={fmtBytes(usedByLeviticus)} />
        <Legend color={otherColor} label="Outros arquivos" value={fmtBytes(usedByOthers)} />
        <Legend color="transparent" border="#3f3f46" label="Livre" value={fmtBytes(free)} />
      </div>
    </div>
  )
}

function Legend({ color, border, label, value }: { color: string; border?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-sm"
        style={{ background: color, border: border ? `1px solid ${border}` : undefined }} />
      <span>{label} <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{value}</strong></span>
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/QuotaBar.test.tsx`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/QuotaBar.tsx \
        apps/desktop/src/components/integrations/QuotaBar.test.tsx
git commit -m "feat(integrations): QuotaBar com 3 segmentos + legenda"
```

---

## Task 6: Componente `StatsRow`

**Files:**
- Create: `apps/desktop/src/components/integrations/StatsRow.tsx`
- Create: `apps/desktop/src/components/integrations/StatsRow.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/StatsRow.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsRow } from './StatsRow.js'

describe('StatsRow', () => {
  it('mostra contagem de músicas e estado de sync', () => {
    render(<StatsRow uploadedCount={38} lastSyncedAt="2026-05-15T10:00:00Z" now={new Date('2026-05-15T10:02:00Z')} />)
    expect(screen.getByText('38 músicas')).toBeInTheDocument()
    expect(screen.getByText(/há 2 min/i)).toBeInTheDocument()
  })

  it('mostra "agora mesmo" quando sync foi <1 min', () => {
    render(<StatsRow uploadedCount={1} lastSyncedAt="2026-05-15T10:00:00Z" now={new Date('2026-05-15T10:00:30Z')} />)
    expect(screen.getByText(/agora mesmo/i)).toBeInTheDocument()
  })

  it('mostra "nunca" quando lastSyncedAt é null', () => {
    render(<StatsRow uploadedCount={0} lastSyncedAt={null} now={new Date()} />)
    expect(screen.getByText(/nunca/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/StatsRow.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/StatsRow.tsx`:

```typescript
import { Music, RefreshCw } from 'lucide-react'

type Props = {
  uploadedCount: number
  lastSyncedAt: string | null    // ISO
  now?: Date                      // injetável pra testes
}

function relTime(iso: string, now: Date): string {
  const then = new Date(iso).getTime()
  const diffSec = Math.floor((now.getTime() - then) / 1000)
  if (diffSec < 60) return 'agora mesmo'
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)} h`
  return `há ${Math.floor(diffSec / 86400)} d`
}

export function StatsRow({ uploadedCount, lastSyncedAt, now = new Date() }: Props) {
  const syncLabel = lastSyncedAt ? relTime(lastSyncedAt, now) : 'nunca'
  return (
    <div className="grid grid-cols-2 gap-2.5 rounded-lg p-2.5 px-3"
      style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="flex items-center gap-2.5">
        <Music size={16} color="#71717a" strokeWidth={2} />
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            {uploadedCount} música{uploadedCount === 1 ? '' : 's'}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted, #71717a)' }}>com backup</div>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <RefreshCw size={14} color="#22c55e" strokeWidth={2} />
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Em dia
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            sincronizado {syncLabel}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/StatsRow.test.tsx`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/StatsRow.tsx \
        apps/desktop/src/components/integrations/StatsRow.test.tsx
git commit -m "feat(integrations): StatsRow com músicas + sync status"
```

---

## Task 7: Componente `ConnectedAccountCard`

**Files:**
- Create: `apps/desktop/src/components/integrations/ConnectedAccountCard.tsx`
- Create: `apps/desktop/src/components/integrations/ConnectedAccountCard.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/ConnectedAccountCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectedAccountCard } from './ConnectedAccountCard.js'

const baseProps = {
  email: 'pastor@igreja.org',
  providerName: 'Google Drive',
  total: 16106127360,
  usedByLeviticus: 142 * 1024 * 1024,
  usedByOthers: 5 * 1024 * 1024 * 1024,
  uploadedCount: 38,
  lastSyncedAt: '2026-05-15T10:00:00Z',
  canManage: true,
}

describe('ConnectedAccountCard', () => {
  it('mostra email + nome do provedor + barra de quota + stats', () => {
    render(<ConnectedAccountCard {...baseProps} onSwap={() => {}} onDisconnect={() => {}} />)
    expect(screen.getByText(/pastor@igreja.org/)).toBeInTheDocument()
    expect(screen.getByText(/pasta "Leviticus"/)).toBeInTheDocument()
    expect(screen.getByText(/15 GB/)).toBeInTheDocument()
    expect(screen.getByText('38 músicas')).toBeInTheDocument()
  })

  it('chama onSwap quando botão Trocar conta é clicado', async () => {
    const onSwap = vi.fn()
    render(<ConnectedAccountCard {...baseProps} onSwap={onSwap} onDisconnect={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Trocar conta/i }))
    expect(onSwap).toHaveBeenCalled()
  })

  it('chama onDisconnect quando botão Desconectar é clicado', async () => {
    const onDisconnect = vi.fn()
    render(<ConnectedAccountCard {...baseProps} onSwap={() => {}} onDisconnect={onDisconnect} />)
    await userEvent.click(screen.getByRole('button', { name: /Desconectar/i }))
    expect(onDisconnect).toHaveBeenCalled()
  })

  it('esconde botões quando canManage=false', () => {
    render(<ConnectedAccountCard {...baseProps} canManage={false} onSwap={() => {}} onDisconnect={() => {}} />)
    expect(screen.queryByRole('button', { name: /Trocar conta/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Desconectar/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/ConnectedAccountCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/ConnectedAccountCard.tsx`:

```typescript
import { Check } from 'lucide-react'
import { QuotaBar } from './QuotaBar.js'
import { StatsRow } from './StatsRow.js'

type Props = {
  email: string
  providerName: string
  total: number
  usedByLeviticus: number
  usedByOthers: number
  uploadedCount: number
  lastSyncedAt: string | null
  canManage: boolean
  onSwap: () => void
  onDisconnect: () => void
}

export function ConnectedAccountCard(props: Props) {
  return (
    <div className="rounded-xl p-[18px]" style={{
      background: 'var(--bg-secondary, #18181b)',
      border: '1px solid var(--border-divider, #27272a)',
    }}>
      {/* Header: status + email + ações */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
          style={{ background: '#022c22', border: '1px solid #064e3b' }}>
          <Check size={18} color="#22c55e" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Conectado
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            {props.email} · pasta "Leviticus"
          </div>
        </div>
        {props.canManage && (
          <div className="flex gap-1.5">
            <button onClick={props.onSwap}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-medium"
              style={{ background: 'var(--bg-accent, #27272a)', color: 'var(--text-heading, #fafafa)', border: 'none' }}>
              Trocar conta
            </button>
            <button onClick={props.onDisconnect}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-medium bg-transparent"
              style={{ color: '#ef4444', border: '1px solid #7f1d1d' }}>
              Desconectar
            </button>
          </div>
        )}
      </div>

      {/* Quota */}
      <div className="mb-2.5">
        <QuotaBar total={props.total} usedByLeviticus={props.usedByLeviticus} usedByOthers={props.usedByOthers} />
      </div>

      {/* Stats */}
      <StatsRow uploadedCount={props.uploadedCount} lastSyncedAt={props.lastSyncedAt} />
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/ConnectedAccountCard.test.tsx`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/ConnectedAccountCard.tsx \
        apps/desktop/src/components/integrations/ConnectedAccountCard.test.tsx
git commit -m "feat(integrations): ConnectedAccountCard combinando QuotaBar + StatsRow"
```

---

## Task 8: Componente `DisconnectModal`

**Files:**
- Create: `apps/desktop/src/components/integrations/DisconnectModal.tsx`
- Create: `apps/desktop/src/components/integrations/DisconnectModal.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/DisconnectModal.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DisconnectModal } from './DisconnectModal.js'

describe('DisconnectModal', () => {
  it('mostra warning + email da conta', () => {
    render(<DisconnectModal open email="a@b.c" songsCount={38} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/a@b.c/)).toBeInTheDocument()
    expect(screen.getByText(/38 músicas/)).toBeInTheDocument()
  })

  it('botão Confirmar desabilitado até digitar "desconectar"', async () => {
    render(<DisconnectModal open email="a@b.c" songsCount={1} onConfirm={() => {}} onCancel={() => {}} />)
    const btn = screen.getByRole('button', { name: /^Desconectar$/i })
    expect(btn).toBeDisabled()

    const input = screen.getByPlaceholderText(/digite "desconectar"/i)
    await userEvent.type(input, 'desconectar')
    expect(btn).toBeEnabled()
  })

  it('chama onConfirm quando confirma', async () => {
    const onConfirm = vi.fn()
    render(<DisconnectModal open email="a@b.c" songsCount={1} onConfirm={onConfirm} onCancel={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText(/digite "desconectar"/i), 'desconectar')
    await userEvent.click(screen.getByRole('button', { name: /^Desconectar$/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('não renderiza quando open=false', () => {
    render(<DisconnectModal open={false} email="x" songsCount={0} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText(/digite/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/DisconnectModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/DisconnectModal.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

type Props = {
  open: boolean
  email: string
  songsCount: number
  onConfirm: () => void
  onCancel: () => void
}

const CONFIRM_PHRASE = 'desconectar'

export function DisconnectModal({ open, email, songsCount, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  if (!open) return null

  const canConfirm = typed.trim().toLowerCase() === CONFIRM_PHRASE

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl p-6"
        style={{ background: 'var(--bg-secondary, #18181b)', border: '1px solid #3f3f46', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: '#450a0a' }}>
            <AlertTriangle size={16} color="#ef4444" strokeWidth={2} />
          </div>
          <h4 className="m-0 text-[16px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Desconectar o Drive?
          </h4>
        </div>

        <p className="m-0 mb-4 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
          A conta <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{email}</strong> vai ser
          removida do Leviticus. As <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{songsCount} música{songsCount === 1 ? '' : 's'}</strong> que
          estão no backup continuam no Drive — mas novos uploads param até reconectar.
        </p>

        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder='digite "desconectar" pra confirmar'
          className="mb-4 w-full rounded-lg px-3 py-2 text-[13px]"
          style={{
            background: 'var(--bg-input, #09090b)',
            border: '1px solid var(--border-divider, #27272a)',
            color: 'var(--text-heading, #fafafa)',
            outline: 'none',
          }}
        />

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-medium"
            style={{ background: 'var(--bg-accent, #27272a)', color: 'var(--text-heading, #fafafa)', border: 'none' }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={!canConfirm}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#ef4444', color: '#fafafa', border: 'none' }}>
            Desconectar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/DisconnectModal.test.tsx`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/DisconnectModal.tsx \
        apps/desktop/src/components/integrations/DisconnectModal.test.tsx
git commit -m "feat(integrations): DisconnectModal com type-to-confirm"
```

---

## Task 9: Componente `SwapAccountModal`

**Files:**
- Create: `apps/desktop/src/components/integrations/SwapAccountModal.tsx`
- Create: `apps/desktop/src/components/integrations/SwapAccountModal.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/SwapAccountModal.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SwapAccountModal } from './SwapAccountModal.js'

describe('SwapAccountModal', () => {
  it('mostra email atual + contagem + estimativa', () => {
    render(<SwapAccountModal open currentEmail="a@b.c" songsCount={38} totalBytes={142 * 1024 * 1024}
      onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/a@b.c/)).toBeInTheDocument()
    expect(screen.getByText(/38 músicas/)).toBeInTheDocument()
    expect(screen.getByText(/142 MB/)).toBeInTheDocument()
  })

  it('lista os 3 passos da migração', () => {
    render(<SwapAccountModal open currentEmail="x" songsCount={1} totalBytes={1024}
      onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/baixar todas/i)).toBeInTheDocument()
    expect(screen.getByText(/conta nova/i)).toBeInTheDocument()
    expect(screen.getByText(/conta antiga/i)).toBeInTheDocument()
  })

  it('chama onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<SwapAccountModal open currentEmail="x" songsCount={1} totalBytes={1024}
      onConfirm={onConfirm} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Entendi, trocar conta/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('chama onCancel', async () => {
    const onCancel = vi.fn()
    render(<SwapAccountModal open currentEmail="x" songsCount={1} totalBytes={1024}
      onConfirm={() => {}} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/SwapAccountModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/SwapAccountModal.tsx`:

```typescript
import { RefreshCw, AlertTriangle } from 'lucide-react'

type Props = {
  open: boolean
  currentEmail: string
  songsCount: number
  totalBytes: number
  onConfirm: () => void
  onCancel: () => void
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function estimateMin(bytes: number): number {
  // Estimativa otimista: 50 Mbps = ~6.25 MB/s. Conta upload + download = 2x.
  const seconds = (bytes * 2) / (6.25 * 1024 * 1024)
  return Math.max(1, Math.round(seconds / 60))
}

export function SwapAccountModal({ open, currentEmail, songsCount, totalBytes, onConfirm, onCancel }: Props) {
  if (!open) return null
  const minutes = estimateMin(totalBytes)
  const sizeLabel = fmtBytes(totalBytes)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl p-6"
        style={{ background: 'var(--bg-secondary, #18181b)', border: '1px solid #3f3f46', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: '#1e1b4b' }}>
            <RefreshCw size={16} color="#a78bfa" strokeWidth={2} />
          </div>
          <h4 className="m-0 text-[16px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Trocar a conta do Drive
          </h4>
        </div>

        <p className="m-0 mb-3.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
          Você tem <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{songsCount} música{songsCount === 1 ? '' : 's'} ({sizeLabel})</strong> guardadas em <strong style={{ color: 'var(--text-heading, #fafafa)' }}>{currentEmail}</strong>. Ao trocar:
        </p>

        <div className="mb-3.5 rounded-lg p-3" style={{ background: 'var(--bg-accent, #09090b)', border: '1px solid var(--border-divider, #27272a)' }}>
          <Step n={1} text={<>O Leviticus vai <strong style={{ color: 'var(--text-heading, #fafafa)' }}>baixar todas as {songsCount} música{songsCount === 1 ? '' : 's'}</strong> da conta atual pra este dispositivo.</>} />
          <Step n={2} text={<>Você vai logar na conta nova. O Leviticus vai <strong style={{ color: 'var(--text-heading, #fafafa)' }}>subir tudo de novo</strong> nessa conta.</>} />
          <Step n={3} text={<>A pasta na conta antiga <strong style={{ color: 'var(--text-heading, #fafafa)' }}>não é apagada</strong>. Você pode deletar manualmente depois se quiser.</>} />
        </div>

        <div className="mb-4 flex gap-2 rounded-lg px-3 py-2.5" style={{ background: '#422006', border: '1px solid #78350f' }}>
          <AlertTriangle size={16} color="#fbbf24" strokeWidth={2} className="flex-shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed" style={{ color: '#fde68a' }}>
            Estimativa: <strong>~{minutes} min</strong>. Não feche o app durante a migração — outros membros não conseguem baixar até terminar.
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-medium"
            style={{ background: 'var(--bg-accent, #27272a)', color: 'var(--text-heading, #fafafa)', border: 'none' }}>
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold"
            style={{ background: '#a78bfa', color: '#09090b', border: 'none' }}>
            Entendi, trocar conta
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({ n, text }: { n: number; text: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex gap-2.5 last:mb-0">
      <div className="text-[13px] font-bold" style={{ color: '#a78bfa' }}>{n}.</div>
      <div className="flex-1 text-[12px] leading-relaxed" style={{ color: '#d4d4d8' }}>{text}</div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/SwapAccountModal.test.tsx`
Expected: 4/4 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/SwapAccountModal.tsx \
        apps/desktop/src/components/integrations/SwapAccountModal.test.tsx
git commit -m "feat(integrations): SwapAccountModal com confirmação transparente"
```

---

## Task 10: Componente `RecoveryActions`

**Files:**
- Create: `apps/desktop/src/components/integrations/RecoveryActions.tsx`
- Create: `apps/desktop/src/components/integrations/RecoveryActions.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/RecoveryActions.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecoveryActions } from './RecoveryActions.js'

describe('RecoveryActions', () => {
  it('mostra as 3 ações pra Google Drive', () => {
    render(<RecoveryActions provider="google_drive" onSwap={() => {}} />)
    expect(screen.getByText(/Liberar espaço no Drive/i)).toBeInTheDocument()
    expect(screen.getByText(/Atualizar plano do Google/i)).toBeInTheDocument()
    expect(screen.getByText(/Trocar pra outra conta/i)).toBeInTheDocument()
  })

  it('clicar em "Trocar conta" chama onSwap', async () => {
    const onSwap = vi.fn()
    render(<RecoveryActions provider="google_drive" onSwap={onSwap} />)
    await userEvent.click(screen.getByText(/Trocar pra outra conta/i))
    expect(onSwap).toHaveBeenCalled()
  })

  it('renderiza links externos pra Drive e One', () => {
    render(<RecoveryActions provider="google_drive" onSwap={() => {}} />)
    const driveLink = screen.getByRole('link', { name: /Liberar espaço no Drive/i })
    expect(driveLink).toHaveAttribute('href', expect.stringContaining('drive.google.com'))
    const oneLink = screen.getByRole('link', { name: /Atualizar plano do Google/i })
    expect(oneLink).toHaveAttribute('href', expect.stringContaining('one.google.com'))
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/RecoveryActions.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/RecoveryActions.tsx`:

```typescript
import { Trash2, TrendingUp, RefreshCw, ArrowRight } from 'lucide-react'
import type { ProviderId } from '@leviticus/core'

type Props = {
  provider: ProviderId
  onSwap: () => void
}

const PROVIDER_URLS: Record<ProviderId, { freeSpace: string; upgrade: string; freeSpaceLabel: string; upgradeLabel: string; upgradeDesc: string }> = {
  google_drive: {
    freeSpace: 'https://drive.google.com/drive/quota',
    upgrade: 'https://one.google.com/about',
    freeSpaceLabel: 'Liberar espaço no Drive',
    upgradeLabel: 'Atualizar plano do Google',
    upgradeDesc: '100 GB por R$ 8/mês ou 2 TB por R$ 50/mês via Google One',
  },
  onedrive: {
    freeSpace: 'https://onedrive.live.com/?v=manage_storage',
    upgrade: 'https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage',
    freeSpaceLabel: 'Liberar espaço no OneDrive',
    upgradeLabel: 'Atualizar plano da Microsoft',
    upgradeDesc: 'Planos Microsoft 365 ou OneDrive standalone',
  },
  dropbox: {
    freeSpace: 'https://www.dropbox.com/account/plan',
    upgrade: 'https://www.dropbox.com/plans',
    freeSpaceLabel: 'Liberar espaço no Dropbox',
    upgradeLabel: 'Atualizar plano do Dropbox',
    upgradeDesc: 'Planos Dropbox Plus / Family / Professional',
  },
}

export function RecoveryActions({ provider, onSwap }: Props) {
  const urls = PROVIDER_URLS[provider]
  return (
    <div className="rounded-lg p-3.5" style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="mb-2.5 text-[12px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
        Como resolver:
      </div>

      <ActionLink href={urls.freeSpace} icon={<Trash2 size={14} color="#a78bfa" strokeWidth={2} />}
        title={urls.freeSpaceLabel} desc={`Abrir e apagar arquivos antigos`} />

      <ActionLink href={urls.upgrade} icon={<TrendingUp size={14} color="#a78bfa" strokeWidth={2} />}
        title={urls.upgradeLabel} desc={urls.upgradeDesc} />

      <button onClick={onSwap}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left cursor-pointer"
        style={{ background: 'var(--bg-secondary, #18181b)', border: 'none' }}>
        <div className="flex h-8 w-8 items-center justify-center flex-shrink-0 rounded-md"
          style={{ background: 'var(--bg-accent, #27272a)' }}>
          <RefreshCw size={14} color="#a78bfa" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
            Trocar pra outra conta
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>
            Migra todas as músicas pra nova conta
          </div>
        </div>
        <ArrowRight size={14} color="#71717a" strokeWidth={2} />
      </button>
    </div>
  )
}

function ActionLink({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="mb-1.5 flex items-center gap-3 rounded-md px-3 py-2.5 no-underline cursor-pointer"
      style={{ background: 'var(--bg-secondary, #18181b)' }}>
      <div className="flex h-8 w-8 items-center justify-center flex-shrink-0 rounded-md"
        style={{ background: 'var(--bg-accent, #27272a)' }}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[12px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>{title}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>{desc}</div>
      </div>
      <ArrowRight size={14} color="#71717a" strokeWidth={2} />
    </a>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/RecoveryActions.test.tsx`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/RecoveryActions.tsx \
        apps/desktop/src/components/integrations/RecoveryActions.test.tsx
git commit -m "feat(integrations): RecoveryActions com 3 caminhos de recuperação"
```

---

## Task 11: Componente `DriveFullCard`

**Files:**
- Create: `apps/desktop/src/components/integrations/DriveFullCard.tsx`
- Create: `apps/desktop/src/components/integrations/DriveFullCard.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/DriveFullCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DriveFullCard } from './DriveFullCard.js'

const baseProps = {
  email: 'a@b.c',
  provider: 'google_drive' as const,
  total: 16 * 1024 ** 3,
  usedByLeviticus: 142 * 1024 ** 2,
  usedByOthers: 16 * 1024 ** 3 - 142 * 1024 ** 2,
  pendingCount: 3,
  pendingBytesNeeded: 48 * 1024 ** 2,
  canManage: true,
  onSwap: () => {},
}

describe('DriveFullCard', () => {
  it('mostra mensagem de Drive cheio + ações de recuperação', () => {
    render(<DriveFullCard {...baseProps} />)
    expect(screen.getByText(/Drive cheio/i)).toBeInTheDocument()
    expect(screen.getByText(/Liberar espaço no Drive/i)).toBeInTheDocument()
  })

  it('mostra info de pendentes', () => {
    render(<DriveFullCard {...baseProps} />)
    expect(screen.getByText(/3 músicas aguardando/i)).toBeInTheDocument()
    expect(screen.getByText(/48 MB/i)).toBeInTheDocument()
  })

  it('canManage=false esconde botão "Avise um admin" e RecoveryActions', () => {
    render(<DriveFullCard {...baseProps} canManage={false} />)
    expect(screen.queryByText(/Liberar espaço/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Avise um admin/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/DriveFullCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/DriveFullCard.tsx`:

```typescript
import { AlertCircle, Clock } from 'lucide-react'
import type { ProviderId } from '@leviticus/core'
import { QuotaBar } from './QuotaBar.js'
import { RecoveryActions } from './RecoveryActions.js'

type Props = {
  email: string
  provider: ProviderId
  total: number
  usedByLeviticus: number
  usedByOthers: number
  pendingCount: number
  pendingBytesNeeded: number
  canManage: boolean
  onSwap: () => void
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export function DriveFullCard(props: Props) {
  return (
    <>
      <div className="rounded-xl p-[18px]" style={{
        background: 'var(--bg-secondary, #18181b)',
        border: '1px solid #7f1d1d',
        boxShadow: '0 0 0 1px #450a0a inset',
      }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
            style={{ background: '#450a0a', border: '1px solid #7f1d1d' }}>
            <AlertCircle size={18} color="#ef4444" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-heading, #fafafa)' }}>
              Drive cheio — backup pausado automaticamente
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
              {props.pendingCount} música{props.pendingCount === 1 ? '' : 's'} sem backup. Sobem assim que liberar espaço.
            </div>
          </div>
        </div>

        <div className="mb-3.5">
          <QuotaBar total={props.total} usedByLeviticus={props.usedByLeviticus} usedByOthers={props.usedByOthers} critical />
        </div>

        {props.canManage ? (
          <RecoveryActions provider={props.provider} onSwap={props.onSwap} />
        ) : (
          <div className="rounded-lg p-3 text-[12px]" style={{ background: 'var(--bg-accent, #09090b)', color: 'var(--text-muted, #a1a1aa)' }}>
            Avise um admin pra liberar espaço ou trocar a conta.
          </div>
        )}
      </div>

      {props.pendingCount > 0 && (
        <div className="mt-3.5 flex items-center gap-2.5 rounded-lg px-3.5 py-3"
          style={{ background: '#1c1917', border: '1px solid #422006' }}>
          <Clock size={16} color="#fbbf24" strokeWidth={2} className="flex-shrink-0" />
          <div className="flex-1">
            <div className="text-[12px] font-semibold" style={{ color: '#fde68a' }}>
              {props.pendingCount} música{props.pendingCount === 1 ? '' : 's'} aguardando espaço
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: '#a8a29e' }}>
              Sobem automaticamente quando liberar {fmtBytes(props.pendingBytesNeeded)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/DriveFullCard.test.tsx`
Expected: 3/3 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/DriveFullCard.tsx \
        apps/desktop/src/components/integrations/DriveFullCard.test.tsx
git commit -m "feat(integrations): DriveFullCard pra estado de quota cheia"
```

---

## Task 12: Componente `AdminsList` (membro sem permissão)

**Files:**
- Create: `apps/desktop/src/components/integrations/AdminsList.tsx`
- Create: `apps/desktop/src/components/integrations/AdminsList.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/components/integrations/AdminsList.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminsList } from './AdminsList.js'

describe('AdminsList', () => {
  it('lista cada admin com nome e papel', () => {
    render(<AdminsList admins={[
      { id: '1', name: 'Pastor Silva', roleName: 'Dono' },
      { id: '2', name: 'Maria Santos', roleName: 'Líder de Louvor' },
    ]} />)
    expect(screen.getByText('Pastor Silva')).toBeInTheDocument()
    expect(screen.getByText(/Dono/)).toBeInTheDocument()
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
    expect(screen.getByText(/Líder de Louvor/)).toBeInTheDocument()
  })

  it('mostra mensagem quando lista vazia', () => {
    render(<AdminsList admins={[]} />)
    expect(screen.getByText(/Nenhum admin/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/AdminsList.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar componente**

Create `apps/desktop/src/components/integrations/AdminsList.tsx`:

```typescript
type Admin = {
  id: string
  name: string
  roleName: string
}

type Props = {
  admins: Admin[]
}

export function AdminsList({ admins }: Props) {
  if (admins.length === 0) {
    return (
      <div className="rounded-lg p-3 text-[12px]" style={{ background: 'var(--bg-accent, #09090b)', color: 'var(--text-muted, #a1a1aa)' }}>
        Nenhum admin disponível.
      </div>
    )
  }

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-accent, #09090b)' }}>
      <div className="mb-2 text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: 'var(--text-muted, #a1a1aa)' }}>
        Admins desta organização
      </div>
      <div className="flex flex-col gap-1.5">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <Avatar name={a.name} />
            <span className="text-[12px]" style={{ color: 'var(--text-heading, #fafafa)' }}>{a.name}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted, #71717a)' }}>· {a.roleName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: '#a78bfa', color: '#09090b' }}>
      {initial}
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/components/integrations/AdminsList.test.tsx`
Expected: 2/2 pass

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/integrations/AdminsList.tsx \
        apps/desktop/src/components/integrations/AdminsList.test.tsx
git commit -m "feat(integrations): AdminsList pra usuários sem permissão"
```

---

## Task 13: Página `OrgIntegrations` — orquestra tudo

**Files:**
- Create: `apps/desktop/src/pages/org/OrgIntegrations.tsx`
- Create: `apps/desktop/src/pages/org/OrgIntegrations.test.tsx`

- [ ] **Step 1: Escrever teste**

Create `apps/desktop/src/pages/org/OrgIntegrations.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockState = {
  account: null as any,
  quota: null as any,
  status: 'disconnected' as string,
  error: null as string | null,
  refreshAccount: vi.fn(),
  refreshQuota: vi.fn(),
}

vi.mock('../../store/integrations.js', () => ({
  useIntegrationsStore: Object.assign(
    (selector: any) => selector(mockState),
    { getState: () => mockState }
  ),
}))
vi.mock('../../lib/permissions.js', () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../lib/cloud-storage/client.js', () => ({
  initOAuth: vi.fn().mockResolvedValue({ authUrl: 'https://x', state: 's' }),
  disconnect: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) }),
}))

import { OrgIntegrations } from './OrgIntegrations.js'

describe('OrgIntegrations', () => {
  beforeEach(() => {
    mockState.account = null
    mockState.quota = null
    mockState.status = 'disconnected'
    mockState.error = null
    mockState.refreshAccount.mockReset()
    mockState.refreshQuota.mockReset()
  })

  it('mostra ConnectDriveCard quando disconnected', async () => {
    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(screen.getByText(/Drive ainda não configurado/i)).toBeInTheDocument()
    })
  })

  it('mostra ConnectedAccountCard quando connected', async () => {
    mockState.account = {
      org_id: 'o1', provider: 'google_drive', account_email: 'a@b.c', account_user_id: 'u',
      app_folder_id: 'f', connected_by: null, connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: 100, last_quota_used: 50, last_quota_check_at: null, updated_at: '2026-05-15T00:00:00Z',
    }
    mockState.quota = { total: 100, used: 50, available: 50 }
    mockState.status = 'connected'

    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(screen.getByText(/a@b.c/)).toBeInTheDocument()
    })
  })

  it('mostra DriveFullCard quando status quota_full', async () => {
    mockState.account = {
      org_id: 'o1', provider: 'google_drive', account_email: 'a@b.c', account_user_id: 'u',
      app_folder_id: 'f', connected_by: null, connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: 100, last_quota_used: 100, last_quota_check_at: null, updated_at: '2026-05-15T00:00:00Z',
    }
    mockState.quota = { total: 100, used: 100, available: 0 }
    mockState.status = 'quota_full'

    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(screen.getByText(/Drive cheio/i)).toBeInTheDocument()
    })
  })

  it('chama refreshAccount + refreshQuota no mount', async () => {
    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(mockState.refreshAccount).toHaveBeenCalledWith('o1')
    })
  })
})
```

- [ ] **Step 2: Rodar teste, ver falha**

Run: `cd apps/desktop && pnpm vitest run src/pages/org/OrgIntegrations.test.tsx`
Expected: FAIL

- [ ] **Step 3: Criar página**

Create `apps/desktop/src/pages/org/OrgIntegrations.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { open as openExternal } from '@tauri-apps/plugin-shell'
import { useIntegrationsStore } from '../../store/integrations.js'
import { hasPermission } from '../../lib/permissions.js'
import * as cs from '../../lib/cloud-storage/client.js'
import { getDb } from '../../lib/db.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { ConnectDriveCard } from '../../components/integrations/ConnectDriveCard.js'
import { ConnectedAccountCard } from '../../components/integrations/ConnectedAccountCard.js'
import { DriveFullCard } from '../../components/integrations/DriveFullCard.js'
import { SwapAccountModal } from '../../components/integrations/SwapAccountModal.js'
import { DisconnectModal } from '../../components/integrations/DisconnectModal.js'
import { AdminsList } from '../../components/integrations/AdminsList.js'

type Props = { orgId: string }

export function OrgIntegrations({ orgId }: Props) {
  const account = useIntegrationsStore((s) => s.account)
  const quota = useIntegrationsStore((s) => s.quota)
  const status = useIntegrationsStore((s) => s.status)
  const refreshAccount = useIntegrationsStore((s) => s.refreshAccount)
  const refreshQuota = useIntegrationsStore((s) => s.refreshQuota)

  const [canManage, setCanManage] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [admins, setAdmins] = useState<Array<{ id: string; name: string; roleName: string }>>([])

  // Carrega permissão + conta + quota + counts
  useEffect(() => {
    void hasPermission('manage_integrations', orgId).then(setCanManage)
    void refreshAccount(orgId)
  }, [orgId, refreshAccount])

  // Periodic quota refresh (when connected)
  useEffect(() => {
    if (status !== 'connected' && status !== 'quota_full') return
    void refreshQuota(orgId)
    const id = setInterval(() => void refreshQuota(orgId), 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [status, orgId, refreshQuota])

  // Carrega contagem de músicas com backup_status='uploaded' + lista de admins
  useEffect(() => {
    void (async () => {
      const db = await getDb()
      const rows = await db.select<{ cnt: number }[]>(
        'SELECT COUNT(*) as cnt FROM songs WHERE org_id = ? AND backup_status = ?',
        [orgId, 'uploaded']
      )
      setUploadedCount(rows[0]?.cnt ?? 0)

      // Admins = owner + quem tem manage_integrations
      const adminRows = await db.select<{ id: string; name: string; role_name: string }[]>(
        `SELECT om.user_id as id, COALESCE(up.display_name, 'Membro') as name,
                COALESCE(r.name, 'Membro') as role_name
         FROM organization_members om
         LEFT JOIN user_profiles_view up ON up.user_id = om.user_id
         LEFT JOIN user_role_assignments ura ON ura.user_id = om.user_id AND ura.org_id = om.org_id
         LEFT JOIN roles r ON r.id = ura.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         WHERE om.org_id = ? AND (rp.permission = 'manage_integrations' OR om.user_id IN (
           SELECT owner_id FROM orgs WHERE id = ?
         ))`,
        [orgId, orgId]
      )
      setAdmins(adminRows.map((r) => ({ id: r.id, name: r.name, roleName: r.role_name })))
    })()
  }, [orgId, account?.account_email])

  async function handleConnect() {
    setConnecting(true)
    try {
      const { authUrl } = await cs.initOAuth(orgId)
      await openExternal(authUrl)
      // Aguarda o deep link callback (capturado em App.tsx) refresh do store
    } catch (err) {
      console.error('OAuth init failed:', err)
      toastError('Não foi possível abrir o Google. Tente novamente.')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    try {
      await cs.disconnect(orgId)
      await refreshAccount(orgId)
      toastSuccess('Drive desconectado')
      setDisconnectOpen(false)
    } catch (err) {
      console.error('Disconnect failed:', err)
      toastError('Falha ao desconectar. Tente novamente.')
    }
  }

  function handleSwap() {
    // Trocar conta = desconectar lógicamente + iniciar nova OAuth.
    // Implementação completa (com migração de músicas) fica no Plano 4.
    // No Plano 2 só dispara o fluxo OAuth direto.
    setSwapOpen(false)
    void handleConnect()
  }

  return (
    <div>
      <h3 className="m-0 mb-1 text-[15px] font-semibold" style={{ color: 'var(--text-heading)' }}>
        Backup das músicas no Google Drive
      </h3>
      <p className="m-0 mb-[18px] text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Conecte uma conta Google da igreja pra guardar as músicas em nuvem. Membros baixam automaticamente quando precisarem — não precisam logar no Google.
      </p>

      {status === 'disconnected' && (
        <ConnectDriveCard onConnect={handleConnect} canConnect={canManage} connecting={connecting} />
      )}

      {status === 'connected' && account && quota && (
        <ConnectedAccountCard
          email={account.account_email}
          providerName="Google Drive"
          total={quota.total}
          usedByLeviticus={account.last_quota_used && account.last_quota_total
            ? Math.max(0, (account.last_quota_used ?? 0) - (quota.used - (account.last_quota_used ?? 0)))
            : 0}
          usedByOthers={Math.max(0, quota.used)}
          uploadedCount={uploadedCount}
          lastSyncedAt={account.last_quota_check_at}
          canManage={canManage}
          onSwap={() => setSwapOpen(true)}
          onDisconnect={() => setDisconnectOpen(true)}
        />
      )}

      {(status === 'token_expired' || status === 'folder_missing') && (
        <ConnectDriveCard onConnect={handleConnect} canConnect={canManage} connecting={connecting} />
      )}

      {status === 'quota_full' && account && quota && (
        <DriveFullCard
          email={account.account_email}
          provider="google_drive"
          total={quota.total}
          usedByLeviticus={0}
          usedByOthers={quota.used}
          pendingCount={0}  // populado em plano 4 (sync worker)
          pendingBytesNeeded={0}
          canManage={canManage}
          onSwap={() => setSwapOpen(true)}
        />
      )}

      {!canManage && status !== 'disconnected' && (
        <div className="mt-4">
          <AdminsList admins={admins} />
        </div>
      )}

      <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        O Leviticus acessa apenas a pasta "Leviticus" no seu Drive — não vê outros arquivos.
      </div>

      <SwapAccountModal
        open={swapOpen}
        currentEmail={account?.account_email ?? ''}
        songsCount={uploadedCount}
        totalBytes={account?.last_quota_used ?? 0}
        onConfirm={handleSwap}
        onCancel={() => setSwapOpen(false)}
      />

      <DisconnectModal
        open={disconnectOpen}
        email={account?.account_email ?? ''}
        songsCount={uploadedCount}
        onConfirm={handleDisconnect}
        onCancel={() => setDisconnectOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Rodar teste**

Run: `cd apps/desktop && pnpm vitest run src/pages/org/OrgIntegrations.test.tsx`
Expected: 4/4 pass

Se algum mock estiver incompleto (ex: zustand selector), ajuste o mock no teste — não modifique a implementação. Padrão comum: o mock do store precisa retornar tanto valores quanto funções.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/pages/org/OrgIntegrations.tsx \
        apps/desktop/src/pages/org/OrgIntegrations.test.tsx
git commit -m "feat(integrations): página OrgIntegrations orquestrando todos estados"
```

---

## Task 14: Registrar tab "Integrações" em OrgManage

**Files:**
- Modify: `apps/desktop/src/pages/OrgManage.tsx`

- [ ] **Step 1: Ler estrutura atual**

Run: `head -50 apps/desktop/src/pages/OrgManage.tsx`
Localize as constantes `TabKey`, `Tab`, `ALL_TABS` e os imports.

- [ ] **Step 2: Adicionar import**

Edit `apps/desktop/src/pages/OrgManage.tsx`. No topo, após os outros imports de `./org/...`:

```typescript
import { OrgIntegrations } from './org/OrgIntegrations.js'
```

E adicionar o ícone Plug ao import do lucide-react:

```typescript
import { Info, Users, Mail, Shield, Settings, Plug } from 'lucide-react'
```

- [ ] **Step 3: Estender TabKey e ALL_TABS**

Edit `apps/desktop/src/pages/OrgManage.tsx`. Modifique o type TabKey e a const ALL_TABS:

```typescript
type TabKey = 'info' | 'members' | 'invites' | 'roles' | 'integrations' | 'danger'

// ...

const ALL_TABS: Tab[] = [
  { key: 'info',         label: 'Informações',  Icon: Info,     requires: null },
  { key: 'members',      label: 'Membros',      Icon: Users,    requires: null },
  { key: 'invites',      label: 'Convites',     Icon: Mail,     requires: 'manage_members' },
  { key: 'roles',        label: 'Papéis',       Icon: Shield,   requires: 'manage_roles' },
  { key: 'integrations', label: 'Integrações',  Icon: Plug,     requires: null },
  { key: 'danger',       label: 'Configurações', Icon: Settings, requires: null },
]
```

- [ ] **Step 4: Atualizar allowedKeys inicial**

Localize a linha:
```typescript
const [allowedKeys, setAllowedKeys] = useState<Set<TabKey>>(new Set(['info', 'members', 'danger']))
```

Mudar pra incluir 'integrations' (sempre visível, mesma regra que info/danger):
```typescript
const [allowedKeys, setAllowedKeys] = useState<Set<TabKey>>(new Set(['info', 'members', 'integrations', 'danger']))
```

E dentro do `load()`:
```typescript
const allowed = new Set<TabKey>(['info', 'members', 'integrations', 'danger'])
```

- [ ] **Step 5: Renderizar a tab content**

Edit `apps/desktop/src/pages/OrgManage.tsx`. Localize o bloco onde cada tab é renderizada (parecido com `{effectiveTab === 'info' && <OrgInfo .../>}`) e adicione:

```typescript
{effectiveTab === 'integrations' && <OrgIntegrations orgId={orgId} />}
```

Posicione antes do `'danger'` pra manter ordem visual coerente com ALL_TABS.

- [ ] **Step 6: Build + typecheck**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: 0 erros

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/pages/OrgManage.tsx
git commit -m "feat(org): registra tab Integrações em OrgManage"
```

---

## Task 15: Smoke test no app real + DoD

**Files:** (sem mudanças de código — validação manual)

- [ ] **Step 1: Rodar build dev**

Run: `cd apps/desktop && pnpm tauri dev` (timeout 180s, deixar rodando)
Expected: app abre, sem erros no console.

- [ ] **Step 2: Navegar até a tab Integrações**

No app:
1. Login + selecionar org
2. Menu lateral → Organização → Integrações

Expected: tab visível, mostra "Drive ainda não configurado" + botão "Conectar Google Drive"

- [ ] **Step 3: Verificar tab para usuário sem permissão**

Logar como usuário sem `manage_integrations` (membro comum sem papel especial). Tab deve aparecer mas botão Conectar deve estar desabilitado com mensagem "Você não tem permissão pra gerenciar integrações."

- [ ] **Step 4: Verificar que abre OAuth no browser**

Como admin, clicar "Conectar Google Drive". Expected:
- Toast/aviso "Abrindo navegador…"
- Browser do sistema abre com URL `https://accounts.google.com/...`
- Se Supabase remoto + OAuth client ID forem reais, fluxo completa e volta com deep link
- Se Supabase local, vai dar erro de redirect_uri — esperado em dev (anote como esperado)

- [ ] **Step 5: Rodar tests cumulativos do plano**

Run: `cd apps/desktop && pnpm vitest run src/store/integrations.test.ts src/lib/deep-link.test.ts src/components/integrations/ src/pages/org/OrgIntegrations.test.tsx`
Expected: TODOS passam (cerca de 27+ testes)

- [ ] **Step 6: Rodar typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: 0 erros

- [ ] **Step 7: Marcar o plano como completo no markdown**

Editar manualmente o arquivo deste plano (`docs/superpowers/plans/2026-05-15-cloud-storage-ui-integracoes.md`) e marcar todos os checkboxes como `[x]`.

- [ ] **Step 8: Commit final**

```bash
git add docs/superpowers/plans/2026-05-15-cloud-storage-ui-integracoes.md
git commit -m "docs(plan): marca Plano 2 (UI Integrações) como completo"
```

---

## Critérios de aceitação (DoD do Plano 2)

Antes de partir pro Plano 3:

- [ ] Tab "Integrações" aparece em OrgManage entre "Papéis" e "Configurações"
- [ ] Estado desconectado mostra `ConnectDriveCard` com botão funcional
- [ ] Botão Conectar abre OAuth no browser via `@tauri-apps/plugin-shell` open
- [ ] Após OAuth bem-sucedido, deep link `leviticus://oauth-success` aciona refresh do store
- [ ] Estado conectado mostra `ConnectedAccountCard` com email, quota bar segmentada (3 cores), stats (música count + sync time)
- [ ] Botão "Trocar conta" abre `SwapAccountModal` com 3 passos transparentes
- [ ] Botão "Desconectar" abre `DisconnectModal` com type-to-confirm "desconectar"
- [ ] Quando `last_quota_used >= last_quota_total`, mostra `DriveFullCard` vermelho + `RecoveryActions`
- [ ] Membro sem `manage_integrations` vê o estado mas sem botões de ação, com `AdminsList` orientando a contatar admin
- [ ] Quota é refrescada periodicamente (cada 10 min) quando tab está aberta
- [ ] `pnpm typecheck` 0 erros
- [ ] Todos os testes vitest desta tab passam (~27+)
- [ ] Sem warning de unused locals
- [ ] App buildia sem erros (`pnpm tauri build --debug`)

### Limitações conhecidas (tratadas em planos seguintes)

- Trocar conta no Plano 2 simplesmente reinicia o fluxo OAuth — a migração de músicas (baixar da conta antiga, subir na nova) entra no Plano 4 com o sync worker
- `pendingCount` no `DriveFullCard` fica em 0 até o Plano 4 implementar o sync worker que conta itens em `pending_cloud_uploads`
- Setup inicial automático (admin sobe biblioteca existente em background) também entra no Plano 4
- Estados `token_expired` e `folder_missing` caem no `ConnectDriveCard` genérico no Plano 2 (sem copy específica explicando o motivo). UI dedicada com "Reconectar — sua sessão expirou" / "Pasta de backup não encontrada — recriar" entra no Plano 4 (que também detecta esses estados via sync worker)
