# Event Tracking (App-side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrumentar o app desktop pra emitir eventos comportamentais (músicas tocadas, cultos executados, app aberto, downloads) que destravam métricas de engajamento e retenção no dashboard.

**Architecture:** Eventos são gravados numa fila durável em SQLite local (`analytics_queue`) e drenados em lote pra uma tabela `analytics_events` no Supabase (INSERT-only, RLS). A fila garante que eventos gerados offline não se percam. A emissão é não-bloqueante: nunca atrasa uma ação do usuário.

**Tech Stack:** Tauri v2, React 18, TypeScript, `tauri-plugin-sql` (SQLite), Supabase, Vitest.

**Spec:** [docs/PRD-Metricas-Comportamentais.md](../../PRD-Metricas-Comportamentais.md) — fases 1-4 (app-side). A fase 5 (dashboard `/admin`) fica fora deste plano.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260522000001_analytics_events.sql` | Tabela `analytics_events` + RLS no Supabase (criar) |
| `apps/desktop/src-tauri/migrations/007_analytics_queue.sql` | Tabela `analytics_queue` local — fila durável (criar) |
| `apps/desktop/src-tauri/src/lib.rs` | Registrar migration v7 (modificar) |
| `apps/desktop/src/lib/analytics.ts` | Módulo central: `trackEvent` + `flushAnalyticsQueue` (criar) |
| `apps/desktop/src/lib/analytics.test.ts` | Testes unit do módulo (criar) |
| `apps/desktop/src/App.tsx` | Emite `app_opened`; dispara flush no boot + interval periódico (modificar) |
| `apps/desktop/src/lib/network.ts` | Dispara flush ao reconectar (modificar) |
| `apps/desktop/src/components/PlayerMini.tsx` | Emite `song_played`, `song_completed` (modificar) |
| `apps/desktop/src/components/AddSongModal.tsx` | Emite `download_succeeded` / `download_failed` (modificar) |

> Nota: a emissão de `song_played` fica no `PlayerMini` (não no `store/player.ts`) porque o store é um módulo puro sem dependências de I/O e queremos manter assim — o `PlayerMini` é o bridge natural pra side effects, igual já faz com Howler.
>
> Nota sobre "cultos executados": **não há evento dedicado**. O culto é considerado executado quando uma música dele é tocada dentro da janela `scheduled_at`–`scheduled_end` (janela exata, sem margem). Isso é uma métrica **derivada** de `song_played` no dashboard (`/admin`, fora deste plano) — cobre tanto o modo playlist quanto tocar músicas avulsas. Por isso `song_played` carrega `song_id` e `occurred_at`, que é tudo que a derivação precisa.

---

## Task 1: Migration Supabase — `analytics_events`

**Files:**
- Create: `supabase/migrations/20260522000001_analytics_events.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Tabela de eventos comportamentais do app desktop. INSERT-only do ponto de
-- vista do app; leitura só via service role (dashboard /admin).
-- Aditiva e retrocompatível: app antigo continua funcionando, só não emite.
CREATE TABLE analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id)    ON DELETE SET NULL,
  event_type  text NOT NULL CHECK (event_type IN (
    'app_opened', 'song_played', 'song_completed',
    'download_succeeded', 'download_failed'
  )),
  -- song_id/playlist_id sem FK de propósito: o evento é histórico imutável e
  -- deve sobreviver à deleção da música/culto.
  song_id     uuid,
  playlist_id uuid,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text,
  platform    text,
  occurred_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_occurred ON analytics_events (occurred_at);
CREATE INDEX idx_analytics_events_org      ON analytics_events (org_id, occurred_at);
CREATE INDEX idx_analytics_events_type     ON analytics_events (event_type, occurred_at);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Membro autenticado só insere evento próprio, numa org da qual participa.
CREATE POLICY analytics_insert_own ON analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    ))
  );
-- Sem policy de SELECT: a tabela é invisível pro app. Leitura só via service role.
```

- [ ] **Step 2: Aplicar a migration no Supabase local**

Run: `supabase migration up`
Expected: aplica `20260522000001_analytics_events` sem erro.

- [ ] **Step 3: Verificar a tabela e a policy**

Run: `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\d analytics_events" -c "SELECT polname FROM pg_policies WHERE tablename='analytics_events';"`
Expected: a tabela e a policy `analytics_insert_own` aparecem listadas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000001_analytics_events.sql
git commit -m "feat: add analytics_events table for behavioral metrics"
```

---

## Task 2: Migration SQLite local — `analytics_queue`

**Files:**
- Create: `apps/desktop/src-tauri/migrations/007_analytics_queue.sql`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (lista de migrations, após o bloco da v6)

- [ ] **Step 1: Criar a migration SQLite**

Arquivo `apps/desktop/src-tauri/migrations/007_analytics_queue.sql`:

```sql
-- Fila durável de eventos de analytics. Puramente local — NÃO é sincronizada
-- pro Supabase. trackEvent() escreve aqui; flushAnalyticsQueue() drena.
CREATE TABLE analytics_queue (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL
);
```

- [ ] **Step 2: Registrar a migration v7 em lib.rs**

Em `apps/desktop/src-tauri/src/lib.rs`, dentro de `.add_migrations(...)`, logo após o bloco da `version: 6` (a `tauri_plugin_sql::Migration` de `006_cloud_storage.sql`) e antes do `]` que fecha o array:

```rust
                        tauri_plugin_sql::Migration {
                            version: 7,
                            description: "analytics_queue",
                            sql: include_str!("../migrations/007_analytics_queue.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
```

- [ ] **Step 3: Verificar compilação do Rust**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/migrations/007_analytics_queue.sql apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add local analytics_queue table for durable event buffering"
```

---

## Task 3: Módulo `analytics.ts` — núcleo

**Files:**
- Create: `apps/desktop/src/lib/analytics.ts`
- Test: `apps/desktop/src/lib/analytics.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Arquivo `apps/desktop/src/lib/analytics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake DB compartilhado entre os mocks.
const fakeDb = {
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
}
vi.mock('./db.js', () => ({ getDb: () => Promise.resolve(fakeDb) }))

const insertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('./supabase.js', () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}))

vi.mock('./observability.js', () => ({ captureException: vi.fn() }))

vi.mock('../store/auth.js', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'user-1' } }) },
}))

vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => Promise.resolve('1.2.3') }))

import { trackEvent, flushAnalyticsQueue } from './analytics.js'

beforeEach(() => {
  fakeDb.execute.mockClear()
  fakeDb.select.mockReset().mockResolvedValue([])
  insertMock.mockClear().mockResolvedValue({ error: null })
  localStorage.clear()
})

describe('trackEvent', () => {
  it('enfileira o evento no SQLite com timestamp e tipo', async () => {
    localStorage.setItem('leviticus_org_id', 'org-1')
    trackEvent('song_played', { songId: 'song-1' })
    await vi.waitFor(() => expect(fakeDb.execute).toHaveBeenCalled())

    const [sql, params] = fakeDb.execute.mock.calls[0]
    expect(sql).toContain('INSERT INTO analytics_queue')
    const row = JSON.parse((params as string[])[0])
    expect(row.event_type).toBe('song_played')
    expect(row.song_id).toBe('song-1')
    expect(row.org_id).toBe('org-1')
    expect(row.user_id).toBe('user-1')
    expect(typeof row.occurred_at).toBe('string')
  })

  it('não enfileira quando não há usuário logado', async () => {
    const { useAuthStore } = await import('../store/auth.js')
    vi.mocked(useAuthStore.getState).mockReturnValueOnce({ user: null } as never)
    trackEvent('app_opened')
    await Promise.resolve()
    expect(fakeDb.execute).not.toHaveBeenCalled()
  })
})

describe('flushAnalyticsQueue', () => {
  it('não faz nada quando a fila está vazia', async () => {
    fakeDb.select.mockResolvedValueOnce([])
    await flushAnalyticsQueue()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('envia em lote e apaga da fila ao ter sucesso', async () => {
    fakeDb.select.mockResolvedValueOnce([
      { id: 1, payload: '{"event_type":"app_opened"}' },
      { id: 2, payload: '{"event_type":"song_played"}' },
    ])
    await flushAnalyticsQueue()
    expect(insertMock).toHaveBeenCalledWith([
      { event_type: 'app_opened' },
      { event_type: 'song_played' },
    ])
    const deleteCall = fakeDb.execute.mock.calls.find(([s]) => String(s).includes('DELETE'))
    expect(deleteCall).toBeTruthy()
    expect(deleteCall![1]).toEqual([1, 2])
  })

  it('mantém a fila intacta quando o insert falha', async () => {
    fakeDb.select.mockResolvedValueOnce([{ id: 1, payload: '{"event_type":"app_opened"}' }])
    insertMock.mockResolvedValueOnce({ error: { message: 'offline' } })
    await flushAnalyticsQueue()
    const deleteCall = fakeDb.execute.mock.calls.find(([s]) => String(s).includes('DELETE'))
    expect(deleteCall).toBeFalsy()
  })
})
```

- [ ] **Step 2: Rodar os testes pra confirmar que falham**

Run: `cd apps/desktop && pnpm vitest run src/lib/analytics.test.ts`
Expected: FAIL — `Cannot find module './analytics.js'`.

- [ ] **Step 3: Implementar o módulo**

Arquivo `apps/desktop/src/lib/analytics.ts`:

```ts
import { getDb } from './db.js'
import { supabase } from './supabase.js'
import { useAuthStore } from '../store/auth.js'
import { captureException } from './observability.js'
import { getVersion } from '@tauri-apps/api/app'

export type AnalyticsEventType =
  | 'app_opened'
  | 'song_played'
  | 'song_completed'
  | 'download_succeeded'
  | 'download_failed'

type EventPayload = {
  songId?: string
  playlistId?: string
  metadata?: Record<string, unknown>
}

// Máximo de linhas na fila local — protege contra crescimento sem limite num
// device cronicamente offline. Excedeu, descarta as mais antigas (FIFO).
const QUEUE_CAP = 10_000
// Tamanho do lote enviado por flush.
const FLUSH_BATCH = 200

// app_version é resolvida 1× e cacheada — getVersion() é async.
let cachedVersion: string | null = null
void getVersion()
  .then((v) => { cachedVersion = v })
  .catch(() => { /* sem versão é aceitável */ })

function detectPlatform(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (ua.includes('Mac')) return 'macos'
  if (ua.includes('Win')) return 'windows'
  return null
}

/**
 * Registra um evento comportamental. Não-bloqueante: carimba o timestamp
 * agora e grava na fila local de forma assíncrona. Nunca lança.
 * Descarta o evento se não houver usuário logado (RLS exigiria user_id).
 */
export function trackEvent(type: AnalyticsEventType, payload: EventPayload = {}): void {
  const userId = useAuthStore.getState().user?.id ?? null
  if (!userId) return
  const row = {
    org_id: localStorage.getItem('leviticus_org_id'),
    user_id: userId,
    event_type: type,
    song_id: payload.songId ?? null,
    playlist_id: payload.playlistId ?? null,
    metadata: payload.metadata ?? {},
    app_version: cachedVersion,
    platform: detectPlatform(),
    occurred_at: new Date().toISOString(),
  }
  void enqueue(row)
}

async function enqueue(row: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDb()
    await db.execute('INSERT INTO analytics_queue (payload) VALUES (?)', [JSON.stringify(row)])
    await db.execute(
      'DELETE FROM analytics_queue WHERE id NOT IN (SELECT id FROM analytics_queue ORDER BY id DESC LIMIT ?)',
      [QUEUE_CAP],
    )
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'enqueue' })
  }
}

// Guarda contra flushes concorrentes (boot + reconexão + interval podem
// coincidir).
let flushing = false

/**
 * Drena a fila local pro Supabase em lote. Só apaga da fila após sucesso —
 * falha (offline, RLS) mantém os eventos pra próxima tentativa. Nunca lança.
 */
export async function flushAnalyticsQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const db = await getDb()
    const rows = await db.select<{ id: number; payload: string }[]>(
      'SELECT id, payload FROM analytics_queue ORDER BY id LIMIT ?',
      [FLUSH_BATCH],
    )
    if (rows.length === 0) return
    const events = rows.map((r) => JSON.parse(r.payload))
    const { error } = await supabase.from('analytics_events').insert(events)
    if (error) {
      captureException(error, { feature: 'analytics', step: 'flush-insert' })
      return
    }
    const ids = rows.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    await db.execute(`DELETE FROM analytics_queue WHERE id IN (${placeholders})`, ids)
  } catch (e) {
    captureException(e, { feature: 'analytics', step: 'flush' })
  } finally {
    flushing = false
  }
}
```

- [ ] **Step 4: Rodar os testes pra confirmar que passam**

Run: `cd apps/desktop && pnpm vitest run src/lib/analytics.test.ts`
Expected: PASS — todos os 5 testes verdes.

- [ ] **Step 5: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/lib/analytics.ts apps/desktop/src/lib/analytics.test.ts
git commit -m "feat: add analytics module with durable event queue"
```

---

## Task 4: Disparar flush — boot, reconexão, interval

**Files:**
- Modify: `apps/desktop/src/lib/network.ts` (dentro de `startNetworkMonitor`)
- Modify: `apps/desktop/src/App.tsx` (boot + interval periódico)

- [ ] **Step 1: Flush ao reconectar — network.ts**

Em `apps/desktop/src/lib/network.ts`, adicionar o import no topo:

```ts
import { flushAnalyticsQueue } from './analytics.js'
```

Dentro de `startNetworkMonitor`, localizar o ponto onde o estado muda pra `online` (a transição offline→online dentro do `pingHealthCheck`/listener) e adicionar, logo após o `set({ online: true })` correspondente:

```ts
    void flushAnalyticsQueue()
```

> Se `startNetworkMonitor` não tiver um ponto único de transição pra online, adicionar a chamada dentro do callback que roda o ping periódico, condicionada a `online === true`. O flush é idempotente e barato — chamar a mais não causa dano.

- [ ] **Step 2: Flush no boot + interval — App.tsx**

Em `apps/desktop/src/App.tsx`, adicionar o import:

```ts
import { flushAnalyticsQueue } from './lib/analytics.js'
```

Adicionar um `useEffect` novo no componente `App` (junto dos outros effects de boot, ex: após o effect do deep-link):

```ts
  // Drena a fila de analytics no boot e a cada 1 min enquanto o app está
  // aberto. Eventos gerados offline ficam na fila e sobem quando há rede.
  useEffect(() => {
    void flushAnalyticsQueue()
    const interval = setInterval(() => void flushAnalyticsQueue(), 60_000)
    return () => clearInterval(interval)
  }, [])
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes afetada**

Run: `cd apps/desktop && pnpm vitest run src/lib/network.test.ts`
Expected: PASS — os testes existentes de network continuam verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/network.ts apps/desktop/src/App.tsx
git commit -m "feat: flush analytics queue on boot, reconnect and interval"
```

---

## Task 5: Emitir `app_opened`

**Files:**
- Modify: `apps/desktop/src/App.tsx` (boot sequence, dentro do `.then((session) => {...})`)

- [ ] **Step 1: Adicionar o import**

Atualizar o import de analytics em `App.tsx` pra incluir `trackEvent`:

```ts
import { flushAnalyticsQueue, trackEvent } from './lib/analytics.js'
```

- [ ] **Step 2: Emitir `app_opened` após resolver sessão**

No `useEffect` de boot, dentro do `Promise.race([...]).then((session) => {...})`, no ramo `else` (quando `session` existe), logo após `const orgId = localStorage.getItem('leviticus_org_id')`:

```ts
            trackEvent('app_opened')
```

> Emitido só quando há sessão — `trackEvent` já descarta eventos sem usuário, mas posicionar aqui deixa a intenção explícita. É 1 evento por abertura do app.

- [ ] **Step 3: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "feat: emit app_opened analytics event on boot"
```

---

## Task 6: Emitir `song_played`

**Files:**
- Modify: `apps/desktop/src/components/PlayerMini.tsx`
- Test: `apps/desktop/src/components/PlayerMini.test.tsx`

`song_played` é emitido toda vez que uma reprodução começa. Carrega `playlistId` quando a reprodução ocorre em contexto de culto (útil pra breakdown playlist vs. avulso), mas a métrica "cultos executados" é derivada disso no dashboard — não há evento dedicado.

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/desktop/src/components/PlayerMini.test.tsx`, adicionar o mock de analytics no topo (junto dos outros `vi.mock`):

```ts
const trackEventMock = vi.fn()
vi.mock('../lib/analytics.js', () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
  flushAnalyticsQueue: vi.fn(),
}))
```

Adicionar um teste novo (`describe('analytics events', ...)`), dentro dele resetar o mock no `beforeEach` (`trackEventMock.mockClear()`):

```ts
  it('emite song_played quando uma música começa a tocar', async () => {
    // renderiza o PlayerMini e dispara a reprodução de uma música —
    // seguir o padrão de setup já usado pelos outros testes deste arquivo
    // (usePlayerStore.getState().play(song, ...)).
    // Após o play, o effect de emissão deve disparar trackEvent.
    expect(trackEventMock).toHaveBeenCalledWith(
      'song_played',
      expect.objectContaining({ songId: expect.any(String) }),
    )
  })
```

> O setup concreto de renderização/play deve copiar o padrão já presente em `PlayerMini.test.tsx` (mesma forma de montar `currentSong` e chamar `play`). Não inventar setup novo.

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd apps/desktop && pnpm vitest run src/components/PlayerMini.test.tsx -t "emite song_played"`
Expected: FAIL — `trackEvent` não foi chamado.

- [ ] **Step 3: Implementar a emissão no PlayerMini**

Em `apps/desktop/src/components/PlayerMini.tsx`, adicionar o import:

```ts
import { trackEvent } from '../lib/analytics.js'
```

Adicionar um `useEffect` que dispara ao mudar de música, emitindo `song_played`:

```ts
  // Emite evento de analytics ao iniciar a reprodução de uma música.
  // playlistId vai junto quando há contexto de culto; "cultos executados"
  // é derivado disso no dashboard (música tocada na janela do culto).
  useEffect(() => {
    if (!currentSong) return
    trackEvent('song_played', {
      songId: currentSong.id,
      playlistId: currentPlaylist?.id,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id])
```

> Disparar por `currentSong?.id` cobre play inicial, next/previous e troca de faixa.

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd apps/desktop && pnpm vitest run src/components/PlayerMini.test.tsx`
Expected: PASS — o teste novo e os existentes verdes.

- [ ] **Step 5: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/PlayerMini.tsx apps/desktop/src/components/PlayerMini.test.tsx
git commit -m "feat: emit song_played analytics event"
```

---

## Task 7: Emitir `song_completed`

**Files:**
- Modify: `apps/desktop/src/components/PlayerMini.tsx` (dentro de `handleSongEnd`)
- Test: `apps/desktop/src/components/PlayerMini.test.tsx`

`song_completed` é emitido quando uma música chega ao fim, com `played_seconds` no metadata.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `PlayerMini.test.tsx`, no `describe('analytics events', ...)`:

```ts
  it('emite song_completed quando a música termina', async () => {
    // renderiza + toca uma música, depois dispara o fim (onEnd do playSong
    // mockado, ou o caminho de detecção pos >= duration). Seguir o padrão
    // de simulação de fim já usado pelos testes existentes de "próxima faixa".
    expect(trackEventMock).toHaveBeenCalledWith(
      'song_completed',
      expect.objectContaining({
        songId: expect.any(String),
        metadata: expect.objectContaining({ played_seconds: expect.any(Number) }),
      }),
    )
  })
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd apps/desktop && pnpm vitest run src/components/PlayerMini.test.tsx -t "emite song_completed"`
Expected: FAIL.

- [ ] **Step 3: Localizar `handleSongEnd` e emitir o evento**

Em `apps/desktop/src/components/PlayerMini.tsx`, localizar a definição da função `handleSongEnd` (referenciada nos `onEnd` do `playSong` e no detector `pos >= chosen - 0.25`). Logo no início do corpo de `handleSongEnd`, antes da lógica de avanço/repeat, adicionar:

```ts
    if (currentSong) {
      trackEvent('song_completed', {
        songId: currentSong.id,
        playlistId: currentPlaylist?.id,
        metadata: { played_seconds: Math.round(duration) },
      })
    }
```

> `duration` é o state do componente com a duração escolhida (DB ou Howl). Como `song_completed` só dispara no fim natural da faixa, `duration` ≈ tempo tocado — suficiente como proxy. Se `handleSongEnd` não tiver `currentSong`/`currentPlaylist`/`duration` no escopo (closure stale), ler via `usePlayerStore.getState()` seguindo o padrão já usado em `playNext`.

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd apps/desktop && pnpm vitest run src/components/PlayerMini.test.tsx`
Expected: PASS — teste novo e existentes verdes.

- [ ] **Step 5: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/PlayerMini.tsx apps/desktop/src/components/PlayerMini.test.tsx
git commit -m "feat: emit song_completed analytics event on track end"
```

---

## Task 8: Emitir `download_succeeded` / `download_failed`

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

A música é considerada baixada quando o fluxo de confirmação do `AddSongModal` insere a `song` com sucesso. O `download_failed` cobre a falha desse fluxo.

- [ ] **Step 1: Adicionar o import**

Em `apps/desktop/src/components/AddSongModal.tsx`, adicionar:

```ts
import { trackEvent } from '../lib/analytics.js'
```

- [ ] **Step 2: Emitir `download_succeeded` no sucesso**

Localizar o handler de confirmação do download — o trecho perto da linha ~1365 onde aparecem os `toastSuccess('Música adicionada...')`. Logo após o `songId` da música recém-inserida estar disponível e o sucesso confirmado (antes ou junto do `toastSuccess`), adicionar:

```ts
      trackEvent('download_succeeded', { songId })
```

> Usar a variável `songId` que o fluxo de insert já produz. Se houver múltiplos `toastSuccess` (com/sem backup), emitir uma única vez no ponto comum logo após o insert da song bem-sucedido — não duplicar por ramo.

- [ ] **Step 3: Emitir `download_failed` na falha**

Localizar o `catch` externo do handler de confirmação (o que envolve todo o fluxo de download+insert — perto da linha ~1396, `catch (err)` com `captureException(err, { feature: 'add-song', step: 'confirm-file-upload' })`). Dentro desse `catch`, após o `captureException` existente, adicionar:

```ts
      trackEvent('download_failed')
```

> Não passar `songId` — na falha pode não existir. Se o `catch` tiver acesso à URL/título do YouTube, pode incluir em `metadata` (ex: `{ metadata: { reason: 'confirm-failed' } }`), mas sem dados sensíveis.

- [ ] **Step 4: Verificar typecheck**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar os testes do AddSongModal**

Run: `cd apps/desktop && pnpm vitest run src/components/AddSongModal.test.tsx`
Expected: PASS — testes existentes continuam verdes (o mock de `../lib/analytics.js` pode precisar ser adicionado se o teste falhar por import não resolvido; nesse caso, adicionar `vi.mock('../lib/analytics.js', () => ({ trackEvent: vi.fn(), flushAnalyticsQueue: vi.fn() }))`).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat: emit download_succeeded and download_failed analytics events"
```

---

## Task 9: Verificação final

**Files:** nenhum — só verificação.

- [ ] **Step 1: Rodar a suíte completa**

Run: `cd apps/desktop && pnpm test`
Expected: PASS — toda a suíte verde, incluindo `analytics.test.ts` e `PlayerMini.test.tsx`.

- [ ] **Step 2: Typecheck completo**

Run: `cd apps/desktop && pnpm build`
Expected: `tsc && vite build` sem erros.

- [ ] **Step 3: Verificar emissão real no app dev**

Run: `cd apps/desktop && pnpm tauri dev` (com `supabase start` ativo)
Verificação manual:
- Abrir o app logado → conferir 1 linha `app_opened` em `analytics_events` no Supabase.
- Tocar uma música de um culto → conferir `song_played` (com `playlist_id` quando em modo culto).
- Deixar a música terminar → conferir `song_completed` com `played_seconds`.
- Verificar que `analytics_queue` local fica vazia após o flush (drenou).

Run pra inspecionar o Supabase:
`psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "SELECT event_type, count(*) FROM analytics_events GROUP BY event_type;"`
Expected: contagens por tipo de evento batendo com as ações feitas.

- [ ] **Step 4: Commit final (se houver ajustes)**

Só se a verificação manual exigir correções. Caso contrário, o trabalho já está commitado por task.

---

## Notas de execução

- **Branch:** todo o trabalho numa branch `feat/event-tracking-app` a partir de `dev` (Git workflow do CLAUDE.md). PR pra `dev`.
- **Migration espelho:** `analytics_events` (Supabase) **não** precisa de espelho em SQLite — não é sincronizada. `analytics_queue` (SQLite) não precisa de espelho no Supabase — é puramente local. Confirmado pelo PRD.
- **Retrocompatibilidade:** tudo aditivo. App antigo sem instrumentação continua funcionando — só não emite eventos.
- **Sem histórico retroativo:** eventos são prospectivos. Métricas só terão dado após esta release propagar via auto-update.
- **Dashboard `/admin`:** fora deste plano — será implementado depois (fase 5 do PRD).
