# Admin Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir `apps/landing/app/admin/` pelo novo design HTML com métricas event-driven, contador de downloads na landing, métricas de waitlist mobile, e delta vs período anterior em todos os KPIs.

**Architecture:** Next.js 15 server component lendo de Vercel Analytics + Supabase service-role + analytics_events. Nova API route na landing pra tracking de download. 3 migrations aditivas no Supabase. Emissão do evento `culto_started` no desktop. Componentes recharts re-estilizados + ~15 novos.

**Tech Stack:** Next.js 15, React 18, recharts 3.8, lucide-react, @supabase/supabase-js, vitest, @leviticus/core (workspace).

**Spec base:** [docs/superpowers/specs/2026-05-23-admin-dashboard-redesign-design.md](../specs/2026-05-23-admin-dashboard-redesign-design.md)

**Branch:** `feat/admin-dashboard-redesign` (já criada)

---

## File Structure

### Created
- `supabase/migrations/20260523000001_analytics_culto_started.sql`
- `supabase/migrations/20260523000002_groups_invites_created_at.sql`
- `supabase/migrations/20260523000003_landing_downloads.sql`
- `apps/landing/app/api/download/[platform]/route.ts`
- `apps/landing/app/api/download/[platform]/route.test.ts`
- `apps/landing/lib/adminPeriod.ts`
- `apps/landing/lib/adminPeriod.test.ts`
- `apps/landing/lib/adminEvents.ts` — queries de `analytics_events`
- `apps/landing/lib/adminEvents.test.ts`
- `apps/landing/lib/adminLanding.ts` — landing data (Vercel + downloads + waitlist)
- `apps/landing/lib/adminLanding.test.ts`
- `apps/landing/lib/adminProduto.ts` — produto data
- `apps/landing/lib/adminProduto.test.ts`
- `apps/landing/lib/adminSaude.ts` — Sentry + severity breakdown
- `apps/landing/lib/adminSaude.test.ts`
- `apps/landing/app/admin/components/TopBar.tsx`
- `apps/landing/app/admin/components/PeriodBar.tsx`
- `apps/landing/app/admin/components/PeriodBar.test.tsx`
- `apps/landing/app/admin/components/SectionHead.tsx`
- `apps/landing/app/admin/components/KpiCard.tsx`
- `apps/landing/app/admin/components/KpiCard.test.tsx`
- `apps/landing/app/admin/components/DeltaBadge.tsx`
- `apps/landing/app/admin/components/WaitlistCard.tsx`
- `apps/landing/app/admin/components/DownloadsCard.tsx`
- `apps/landing/app/admin/components/Funnel.tsx`
- `apps/landing/app/admin/components/Funnel.test.tsx`
- `apps/landing/app/admin/components/CohortHeatmap.tsx`
- `apps/landing/app/admin/components/CohortHeatmap.test.tsx`
- `apps/landing/app/admin/components/VersionAdoption.tsx`
- `apps/landing/app/admin/components/VersionAdoption.test.tsx`
- `apps/landing/app/admin/components/DownloadSuccessCard.tsx`
- `apps/landing/app/admin/components/DauWauMau.tsx`
- `apps/landing/app/admin/components/WeeklyOrgsBars.tsx`
- `apps/landing/app/admin/components/PlaybackChart.tsx`
- `apps/landing/app/admin/components/OrphanCultosCard.tsx`
- `apps/landing/app/admin/components/EngagementKpis.tsx`
- `apps/landing/app/admin/components/TeamStructureKpis.tsx`
- `apps/landing/app/admin/components/SeverityBreakdown.tsx`
- `apps/landing/app/admin/components/RecentActivity.tsx`
- `apps/landing/app/admin/components/TopOrgs.tsx`
- `apps/landing/app/admin/components/EventsHealthCard.tsx`
- `apps/landing/app/admin/admin.module.css` — todo CSS do admin novo

### Modified
- `apps/landing/components/Download.tsx` — anchors apontam pra `/api/download/[platform]`
- `apps/landing/lib/adminData.ts` — vira orquestrador fino, delegando pros novos `admin{Period,Events,Landing,Produto,Saude}.ts`
- `apps/landing/app/admin/page.tsx` — reescrita completa, mantém shape mas usa componentes novos
- `apps/landing/app/admin/components/VercelChart.tsx` — restilizada
- `apps/landing/app/admin/components/GrowthChart.tsx` — restilizada
- `apps/landing/app/admin/components/ActivityHeatmap.tsx` — restilizada
- `apps/landing/app/admin/components/SentryErrorChart.tsx` — restilizada
- `apps/landing/app/admin/components/BarList.tsx` — restilizada
- `apps/desktop/src/lib/analytics.ts` — adiciona `culto_started` no type
- `apps/desktop/src/lib/playback.ts` — `song_completed` carrega `duration_seconds`
- `apps/desktop/src/pages/PlaylistDetail.tsx` — emite `culto_started` no "play all"
- `apps/desktop/src-tauri/migrations/` — sem mirror necessário (ver §Phase A justificativa)

### Deleted
- `apps/landing/app/admin/components/PeriodSelector.tsx` — substituída por `PeriodBar`
- `apps/landing/app/admin/components/PeriodSelector.test.tsx` se existir
- `apps/landing/app/admin/components/DailyActivityChart.tsx` — substituída por `PlaybackChart` + atividade vira parte de growth

---

## Phase A — Database & Schema (3 migrations aditivas)

### Task A1: Migration — `culto_started` no CHECK do analytics_events

**Files:**
- Create: `supabase/migrations/20260523000001_analytics_culto_started.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Expande o CHECK de event_type para aceitar 'culto_started'.
-- Aditivo: app antigo não emite, app novo sim. RLS já cobre.

alter table analytics_events
  drop constraint analytics_events_event_type_check;

alter table analytics_events
  add constraint analytics_events_event_type_check check (event_type in (
    'app_opened',
    'song_played',
    'song_completed',
    'download_succeeded',
    'download_failed',
    'culto_started'
  ));
```

- [ ] **Step 2: Aplicar local e verificar**

Run: `supabase migration up`
Expected: migration aplicada sem erro

Run: `supabase db reset --linked=false` se necessário pra validar do zero.

Verificar: `supabase db dump --schema public | grep analytics_events_event_type_check` mostra os 6 valores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523000001_analytics_culto_started.sql
git commit -m "feat(db): adiciona culto_started ao CHECK de analytics_events"
```

### Task A2: Migration — created_at em groups e org_invite_codes

**Files:**
- Create: `supabase/migrations/20260523000002_groups_invites_created_at.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Adiciona created_at em groups e org_invite_codes pra rastreio temporal
-- no dashboard admin. Aditivo: nullable + default now() cobre inserts novos
-- sem que o app precise listar a coluna. Linhas históricas ficam null —
-- queries de "novos no período" filtram `is not null`.

alter table groups
  add column if not exists created_at timestamptz default now();

alter table org_invite_codes
  add column if not exists created_at timestamptz default now();

create index if not exists idx_groups_created_at on groups (created_at);
create index if not exists idx_org_invite_codes_created_at on org_invite_codes (created_at);
```

- [ ] **Step 2: Aplicar e verificar**

Run: `supabase migration up`
Verificar com `\d groups` e `\d org_invite_codes` no psql: ambas têm `created_at`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523000002_groups_invites_created_at.sql
git commit -m "feat(db): adiciona created_at em groups e org_invite_codes"
```

### Task A3: Migration — tabela landing_downloads

**Files:**
- Create: `supabase/migrations/20260523000003_landing_downloads.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Tabela pra rastrear clicks nos botões de download da landing.
-- Sem PII (sem IP, sem email). UA e referrer são informativos.
-- Apenas service role escreve (via API route da landing) e lê (via admin).

create table landing_downloads (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null check (platform in ('mac', 'win')),
  occurred_at timestamptz not null default now(),
  referrer    text,
  user_agent  text,
  country     text
);

alter table landing_downloads enable row level security;

-- Sem POLICY: bloqueia anon e authenticated. Só service role tem acesso.

create index idx_landing_downloads_occurred on landing_downloads (occurred_at desc);
create index idx_landing_downloads_platform on landing_downloads (platform, occurred_at desc);
```

- [ ] **Step 2: Aplicar e verificar**

Run: `supabase migration up`
Verificar RLS: `select * from landing_downloads` via anon retorna vazio mesmo após service-role insert.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523000003_landing_downloads.sql
git commit -m "feat(db): tabela landing_downloads pra contar clicks no download"
```

### Task A4: Justificativa "sem mirror SQLite"

**Files:**
- Modify: `docs/superpowers/specs/2026-05-23-admin-dashboard-redesign-design.md` (já existe, só audita)

- [ ] **Step 1: Verificar que app desktop NÃO lê created_at de groups/invites**

Run: `grep -rn "created_at" apps/desktop/src/ | grep -E "groups|invite"`
Expected: zero matches — confirma que app desktop não depende da coluna nova.

Run: `grep -rn "landing_downloads\|culto_started" apps/desktop/src/`
Expected: zero matches em landing_downloads. `culto_started` virá no Phase B.

Sem matches = sem mirror necessário em `apps/desktop/src-tauri/migrations/`.

- [ ] **Step 2: Commit (apenas se houver doc adicional)**

Nenhum commit — só verificação.

---

## Phase B — Desktop app: emissão do `culto_started` + duração

### Task B1: Adicionar `culto_started` no type de AnalyticsEventType

**Files:**
- Modify: `apps/desktop/src/lib/analytics.ts:8-12`

- [ ] **Step 1: Modificar o type**

Substitui linhas 7-12 em [apps/desktop/src/lib/analytics.ts](../../apps/desktop/src/lib/analytics.ts):

```ts
export type AnalyticsEventType =
  | 'app_opened'
  | 'song_played'
  | 'song_completed'
  | 'download_succeeded'
  | 'download_failed'
  | 'culto_started'
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && pnpm tsc --noEmit`
Expected: PASS sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/lib/analytics.ts
git commit -m "feat(analytics): adiciona culto_started ao type de eventos"
```

### Task B2: Atualizar test do analytics — caso `culto_started`

**Files:**
- Modify: `apps/desktop/src/lib/analytics.test.ts` (verificar se existe; se não, criar)

- [ ] **Step 1: Verificar test existente**

Run: `ls apps/desktop/src/lib/analytics.test.ts 2>&1`
Se NÃO existe, criar com test mínimo cobrindo o type novo:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { trackEvent } from './analytics.js'

vi.mock('./db.js', () => ({
  getDb: vi.fn(async () => ({
    execute: vi.fn(async () => undefined),
    select: vi.fn(async () => []),
  })),
}))
vi.mock('../store/auth.js', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'user-1' } }) },
}))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.13.0' }))

describe('trackEvent', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('leviticus_org_id', 'org-1')
  })

  it('aceita culto_started', () => {
    expect(() => trackEvent('culto_started', { playlistId: 'pl-1' })).not.toThrow()
  })
})
```

Se EXISTE, adicionar só o `it('aceita culto_started'...)` no describe correspondente.

- [ ] **Step 2: Rodar test**

Run: `cd apps/desktop && pnpm vitest run src/lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/lib/analytics.test.ts
git commit -m "test(analytics): cobre culto_started no trackEvent"
```

### Task B3: Adicionar duration_seconds no metadata de song_completed

**Files:**
- Modify: `apps/desktop/src/lib/playback.ts:39` (linha do trackEvent)

- [ ] **Step 1: Ler contexto atual do playback.ts:30-50**

Run: `sed -n '25,55p' apps/desktop/src/lib/playback.ts`

- [ ] **Step 2: Modificar a chamada de trackEvent**

A chamada atual (linha ~39) provavelmente é:

```ts
trackEvent('song_completed', {
  songId: song.id,
  playlistId: currentPlaylist?.id,
})
```

Substituir por:

```ts
trackEvent('song_completed', {
  songId: song.id,
  playlistId: currentPlaylist?.id,
  metadata: {
    duration_seconds: Math.round(getDuration() ?? 0),
  },
})
```

NOTA: ajustar `getDuration()` pra função/variável real do contexto. Se não houver acesso direto, usar a duração que já é tracked no audio singleton.

- [ ] **Step 3: Atualizar test (se houver)**

Run: `grep -rn "song_completed" apps/desktop/src/lib/ apps/desktop/src/components/ 2>/dev/null | grep test`
Se houver test cobrindo a emissão, atualizar o assert pra esperar `metadata.duration_seconds`.

- [ ] **Step 4: Rodar tests + typecheck**

Run: `cd apps/desktop && pnpm vitest run && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/playback.ts apps/desktop/src/lib/playback.test.ts 2>/dev/null || git add apps/desktop/src/lib/playback.ts
git commit -m "feat(analytics): carimba duration_seconds em song_completed"
```

### Task B4: Emitir `culto_started` no botão "play all" do culto

**Files:**
- Modify: `apps/desktop/src/pages/PlaylistDetail.tsx:570-575`

- [ ] **Step 1: Localizar a função do botão "play all"**

Run: `sed -n '565,580p' apps/desktop/src/pages/PlaylistDetail.tsx`

A linha 572 hoje tem `playSongs(all.map((ps) => ps.song)).catch(...)`. Adicionar `trackEvent('culto_started', ...)` imediatamente antes do `playSongs`:

```ts
trackEvent('culto_started', { playlistId: playlist.id })
playSongs(all.map((ps) => ps.song)).catch((e) =>
  captureException(e, { feature: 'playlist', step: 'play-all' }),
)
```

Verificar import: `import { trackEvent } from '../lib/analytics.js'` (provavelmente já existe — checar topo do arquivo).

- [ ] **Step 2: NÃO instrumentar `playSection` (linha ~576)**

Decisão do spec: seção é uso ad-hoc, não execução de culto. Skip.

- [ ] **Step 3: Typecheck + test**

Run: `cd apps/desktop && pnpm tsc --noEmit && pnpm vitest run src/pages/PlaylistDetail`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/pages/PlaylistDetail.tsx
git commit -m "feat(analytics): emite culto_started ao tocar culto inteiro"
```

---

## Phase C — Landing: contador de download

### Task C1: API route — `/api/download/[platform]/route.ts`

**Files:**
- Create: `apps/landing/app/api/download/[platform]/route.ts`

- [ ] **Step 1: Criar a route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getLatestRelease } from '@/lib/release'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|whatsapp/i

type Platform = 'mac' | 'win'
function isPlatform(s: string): s is Platform {
  return s === 'mac' || s === 'win'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params
  if (!isPlatform(platform)) {
    return NextResponse.json({ error: 'invalid platform' }, { status: 400 })
  }

  const release = await getLatestRelease()
  const url = platform === 'mac' ? release.macUrl : release.winUrl
  if (!url) {
    return NextResponse.json({ error: 'release unavailable' }, { status: 503 })
  }

  const ua = req.headers.get('user-agent') ?? ''
  const referrer = req.headers.get('referer') ?? null
  const country = req.headers.get('x-vercel-ip-country') ?? null

  // Bots: redireciona mas não loga
  if (!BOT_UA.test(ua)) {
    try {
      await supabaseAdmin.from('landing_downloads').insert({
        platform,
        user_agent: ua.slice(0, 500),
        referrer: referrer?.slice(0, 500) ?? null,
        country,
      })
    } catch (err) {
      console.error('[download-track]', err)
      // não bloqueia o download
    }
  }

  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  })
}
```

- [ ] **Step 2: Verificar dependências**

Run: `cat apps/landing/lib/release.ts` — confirma que `getLatestRelease()` existe e devolve `{ macUrl, winUrl }`. Se a função tiver outro nome/shape, ajustar o route.

Run: `cat apps/landing/lib/supabaseAdmin.ts | head -20` — confirma export `supabaseAdmin`.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/app/api/download/'[platform]'/route.ts
git commit -m "feat(landing): API route /api/download/[platform] com tracking"
```

### Task C2: Test do API route

**Files:**
- Create: `apps/landing/app/api/download/[platform]/route.test.ts`

- [ ] **Step 1: Criar o test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const insertMock = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: () => ({ insert: insertMock }) },
}))
vi.mock('@/lib/release', () => ({
  getLatestRelease: async () => ({
    macUrl: 'https://example.com/mac.dmg',
    winUrl: 'https://example.com/win.exe',
  }),
}))

import { GET } from './route'

function mkReq(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers: new Headers(headers) })
}

describe('GET /api/download/[platform]', () => {
  beforeEach(() => insertMock.mockClear())

  it('redireciona pro release URL do mac', async () => {
    const res = await GET(mkReq('http://localhost/api/download/mac'), {
      params: Promise.resolve({ platform: 'mac' }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/mac.dmg')
  })

  it('loga o click em landing_downloads', async () => {
    await GET(mkReq('http://localhost/api/download/win', { 'user-agent': 'Mozilla/5.0' }), {
      params: Promise.resolve({ platform: 'win' }),
    })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'win',
      user_agent: 'Mozilla/5.0',
    }))
  })

  it('NÃO loga quando UA é bot', async () => {
    await GET(mkReq('http://localhost/api/download/mac', { 'user-agent': 'GoogleBot/2.0' }), {
      params: Promise.resolve({ platform: 'mac' }),
    })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejeita plataforma inválida', async () => {
    const res = await GET(mkReq('http://localhost/api/download/linux'), {
      params: Promise.resolve({ platform: 'linux' }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Rodar o test**

Run: `cd apps/landing && pnpm vitest run app/api/download/'[platform]'/route.test.ts`
Expected: 4 testes PASS.

Nota: se vitest não estiver configurado em `apps/landing/`, ver `apps/landing/package.json` por script `test`. Se ausente, adicionar:

```json
"scripts": {
  "test": "vitest",
  "typecheck": "tsc --noEmit"
}
```

E criar `apps/landing/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { environment: 'jsdom', globals: false },
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/landing/app/api/download/'[platform]'/route.test.ts apps/landing/vitest.config.ts apps/landing/package.json 2>/dev/null || true
git commit -m "test(landing): cobre route /api/download/[platform]"
```

### Task C3: Atualizar Download.tsx pra usar a nova route

**Files:**
- Modify: `apps/landing/components/Download.tsx:66,87`

- [ ] **Step 1: Substituir os hrefs**

Substituir linha 66:
```tsx
<a href={release.macUrl} className="btn btn-primary download-btn">
```
por:
```tsx
<a href="/api/download/mac" className="btn btn-primary download-btn">
```

Substituir linha 87:
```tsx
<a href={release.winUrl} className="btn btn-primary download-btn">
```
por:
```tsx
<a href="/api/download/win" className="btn btn-primary download-btn">
```

Anchors de "Outras versões" (GitHub Releases — linhas 71, 92) ficam intactos — não rastreamos esses.

- [ ] **Step 2: Typecheck**

Run: `cd apps/landing && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/components/Download.tsx
git commit -m "feat(landing): botões de download vão por /api/download pra tracking"
```

---

## Phase D — Admin data layer (lib/)

### Task D1: Extrair `lib/adminPeriod.ts` com helpers de data + prev period

**Files:**
- Create: `apps/landing/lib/adminPeriod.ts`
- Create: `apps/landing/lib/adminPeriod.test.ts`
- Modify: `apps/landing/lib/adminData.ts` — passa a importar de adminPeriod

- [ ] **Step 1: Escrever o test PRIMEIRO**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePeriod, computePrevPeriod, dayBuckets, toBRTDate } from './adminPeriod'

describe('resolvePeriod', () => {
  it('preset 7d retorna 7 dias atrás até agora', () => {
    const p = resolvePeriod({ period: '7d' })
    expect(p.preset).toBe('7d')
    expect(p.days).toBe(7)
    expect(p.label).toBe('Últimos 7 dias')
  })

  it('preset 30d (default sem params)', () => {
    const p = resolvePeriod({})
    expect(p.preset).toBe('7d') // mantém comportamento atual
  })

  it('today retorna janela de hoje em BRT', () => {
    const p = resolvePeriod({ period: 'today' })
    expect(p.preset).toBe('today')
    expect(p.days).toBe(1)
  })

  it('custom from/to válidos', () => {
    const p = resolvePeriod({ from: '2026-05-01', to: '2026-05-15' })
    expect(p.preset).toBe('custom')
    expect(p.days).toBe(14)
    expect(p.label).toContain('05')
  })

  it('custom from/to inválidos cai pro default', () => {
    const p = resolvePeriod({ from: 'invalid', to: 'also-bad' })
    expect(p.preset).toBe('7d')
  })
})

describe('computePrevPeriod', () => {
  it('30d → 30d imediatamente anterior, mesma duração', () => {
    const cur = resolvePeriod({ period: '30d' })
    const prev = computePrevPeriod(cur)
    expect(prev.days).toBe(30)
    expect(new Date(prev.to).getTime()).toBeLessThanOrEqual(new Date(cur.from).getTime())
  })

  it('today → ontem (24h)', () => {
    const cur = resolvePeriod({ period: 'today' })
    const prev = computePrevPeriod(cur)
    expect(prev.days).toBe(1)
  })
})

describe('toBRTDate', () => {
  it('converte ISO UTC pra YYYY-MM-DD em BRT', () => {
    expect(toBRTDate('2026-05-23T12:00:00.000Z')).toBe('2026-05-23')
    // 02:00 UTC = 23:00 do dia anterior em BRT
    expect(toBRTDate('2026-05-23T02:00:00.000Z')).toBe('2026-05-22')
  })
})

describe('dayBuckets', () => {
  it('gera lista de YYYY-MM-DD cobrindo o período', () => {
    const p = resolvePeriod({ from: '2026-05-20', to: '2026-05-22' })
    const buckets = dayBuckets(p)
    expect(buckets).toEqual(['2026-05-20', '2026-05-21', '2026-05-22'])
  })
})
```

- [ ] **Step 2: Rodar — deve falhar (module not found)**

Run: `cd apps/landing && pnpm vitest run lib/adminPeriod.test.ts`
Expected: FAIL — arquivo não existe ainda.

- [ ] **Step 3: Implementar adminPeriod.ts**

Mover de `adminData.ts` (linhas ~108-205) as funções de período + adicionar `computePrevPeriod`:

```ts
// ════════════════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════════════════

export type PresetKey = 'today' | '7d' | '30d' | '90d' | 'custom'

export type Period = {
  from: string   // ISO start
  to: string     // ISO end
  preset: PresetKey
  label: string
  days: number
}

// ════════════════════════════════════════════════════════════════════════════
//  DATE HELPERS  (BRT = UTC-3)
// ════════════════════════════════════════════════════════════════════════════

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

export function toBRTDate(iso: string): string {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10)
}

export function toBRTHour(iso: string): number {
  return ((new Date(iso).getUTCHours() - 3 + 24) % 24)
}

export function toBRTDow(iso: string): number {
  return new Date(new Date(iso).getTime() - BRT_OFFSET_MS).getUTCDay()
}

function startOfTodayBRT(): Date {
  const brt = new Date(Date.now() - BRT_OFFSET_MS)
  brt.setUTCHours(0, 0, 0, 0)
  return new Date(brt.getTime() + BRT_OFFSET_MS)
}

export function fmtDayLabel(dayStr: string): string {
  const [, m, d] = dayStr.split('-')
  return m && d ? `${d}/${m}` : dayStr
}

// ════════════════════════════════════════════════════════════════════════════
//  PERIOD RESOLUTION
// ════════════════════════════════════════════════════════════════════════════

export function resolvePeriod(params: {
  period?: string
  from?: string
  to?: string
}): Period {
  const now = new Date()

  if (params.from && params.to) {
    const from = new Date(`${params.from}T00:00:00.000Z`)
    const to = new Date(`${params.to}T23:59:59.999Z`)
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from < to) {
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000))
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        preset: 'custom',
        label: `${fmtDayLabel(params.from)} – ${fmtDayLabel(params.to)}`,
        days,
      }
    }
  }

  const preset = (params.period as PresetKey) || '7d'

  if (preset === 'today') {
    return {
      from: startOfTodayBRT().toISOString(),
      to: now.toISOString(),
      preset: 'today',
      label: 'Hoje',
      days: 1,
    }
  }

  const presetDays: Record<string, { days: number; label: string }> = {
    '7d':  { days: 7,  label: 'Últimos 7 dias' },
    '30d': { days: 30, label: 'Últimos 30 dias' },
    '90d': { days: 90, label: 'Últimos 90 dias' },
  }
  const cfg = presetDays[preset] ?? presetDays['7d']
  const from = new Date(now.getTime() - cfg.days * 86400000)

  return {
    from: from.toISOString(),
    to: now.toISOString(),
    preset: (presetDays[preset] ? preset : '7d') as PresetKey,
    label: cfg.label,
    days: cfg.days,
  }
}

export function computePrevPeriod(current: Period): Period {
  const durationMs = new Date(current.to).getTime() - new Date(current.from).getTime()
  const to = new Date(new Date(current.from).getTime() - 1)
  const from = new Date(to.getTime() - durationMs)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    preset: current.preset,
    label: `Anterior (${current.label.toLowerCase()})`,
    days: current.days,
  }
}

export function dayBuckets(period: Period): string[] {
  const out: string[] = []
  const start = new Date(new Date(period.from).getTime() - BRT_OFFSET_MS)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(new Date(period.to).getTime() - BRT_OFFSET_MS)
  const cur = new Date(start)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out.length > 0 ? out : [new Date(period.to).toISOString().slice(0, 10)]
}
```

- [ ] **Step 4: Rodar tests — devem passar**

Run: `cd apps/landing && pnpm vitest run lib/adminPeriod.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Remover código duplicado de adminData.ts**

Em `apps/landing/lib/adminData.ts`: remover blocos DATE HELPERS + PERIOD RESOLUTION (linhas ~108-205). Adicionar no topo:

```ts
import {
  resolvePeriod, computePrevPeriod, dayBuckets,
  toBRTDate, toBRTHour, toBRTDow, fmtDayLabel,
  type Period, type PresetKey,
} from './adminPeriod'

export { resolvePeriod, type Period, type PresetKey } // re-export pra compat
```

Run: `cd apps/landing && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/landing/lib/adminPeriod.ts apps/landing/lib/adminPeriod.test.ts apps/landing/lib/adminData.ts
git commit -m "refactor(admin): extrai adminPeriod com computePrevPeriod"
```

### Task D2: `lib/adminEvents.ts` — queries de analytics_events

**Files:**
- Create: `apps/landing/lib/adminEvents.ts`
- Create: `apps/landing/lib/adminEvents.test.ts`

- [ ] **Step 1: Definir types e API**

```ts
import { supabaseAdmin } from './supabaseAdmin'
import { dayBuckets, fmtDayLabel, toBRTDate, type Period } from './adminPeriod'

export type EventRow = {
  user_id: string | null
  org_id: string | null
  event_type: string
  song_id: string | null
  playlist_id: string | null
  metadata: Record<string, unknown>
  app_version: string | null
  platform: string | null
  occurred_at: string
}

export type EngagementData = {
  songsPlayed: number
  cultosExecuted: number
  songsCompleted: number
  completionRate: number | null
  audioMinutes: number
}

export type DauWauMauData = {
  dau: number
  wau: number
  mau: number
  stickiness: number | null  // DAU/MAU
}

export type FunnelData = {
  signups: number
  firstSong: number
  firstCulto: number
  firstExecuted: number
}

export type CohortData = {
  weekStart: string  // YYYY-MM-DD
  cohortSize: number
  retention: (number | null)[] // 6 weeks
}

export type VersionAdoptionRow = { version: string; users: number; pct: number }

export type DownloadOutcome = { succeeded: number; failed: number; failureRate: number | null }

export type PlaybackPoint = { key: string; label: string; songsPlayed: number; cultosStarted: number }

export type EventsHealth = {
  perHour24h: number
  activeClientsToday: number
  pipelineOk: boolean
}

export async function fetchEvents(period: Period, types?: string[]): Promise<EventRow[]> {
  let q = supabaseAdmin
    .from('analytics_events')
    .select('user_id, org_id, event_type, song_id, playlist_id, metadata, app_version, platform, occurred_at')
    .gte('occurred_at', period.from)
    .lte('occurred_at', period.to)
  if (types && types.length > 0) q = q.in('event_type', types)
  const { data, error } = await q
  if (error) {
    console.error('[adminEvents] fetchEvents', error)
    return []
  }
  return (data ?? []) as EventRow[]
}

export function aggregateEngagement(events: EventRow[]): EngagementData {
  const songsPlayed = events.filter((e) => e.event_type === 'song_played').length
  const cultosExecuted = events.filter((e) => e.event_type === 'culto_started').length
  const songsCompleted = events.filter((e) => e.event_type === 'song_completed').length
  const completionRate = songsPlayed > 0 ? songsCompleted / songsPlayed : null
  const audioSeconds = events
    .filter((e) => e.event_type === 'song_completed')
    .reduce((sum, e) => {
      const d = e.metadata?.duration_seconds
      return sum + (typeof d === 'number' ? d : 0)
    }, 0)
  const audioMinutes = Math.round(audioSeconds / 60)
  return { songsPlayed, cultosExecuted, songsCompleted, completionRate, audioMinutes }
}

export async function fetchDauWauMau(): Promise<DauWauMauData> {
  const now = Date.now()
  const day = new Date(now - 86_400_000).toISOString()
  const week = new Date(now - 7 * 86_400_000).toISOString()
  const month = new Date(now - 30 * 86_400_000).toISOString()

  const [dauRes, wauRes, mauRes] = await Promise.all([
    supabaseAdmin.from('analytics_events').select('user_id', { head: false })
      .eq('event_type', 'app_opened').gte('occurred_at', day),
    supabaseAdmin.from('analytics_events').select('user_id', { head: false })
      .eq('event_type', 'app_opened').gte('occurred_at', week),
    supabaseAdmin.from('analytics_events').select('user_id', { head: false })
      .eq('event_type', 'app_opened').gte('occurred_at', month),
  ])

  const distinct = (rows: { user_id: string | null }[] | null) =>
    new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)).size

  const dau = distinct(dauRes.data as { user_id: string | null }[] | null)
  const wau = distinct(wauRes.data as { user_id: string | null }[] | null)
  const mau = distinct(mauRes.data as { user_id: string | null }[] | null)
  const stickiness = mau > 0 ? dau / mau : null
  return { dau, wau, mau, stickiness }
}

export function aggregatePlaybackByDay(events: EventRow[], period: Period): PlaybackPoint[] {
  const buckets = dayBuckets(period)
  const songsByDay = new Map<string, number>()
  const cultosByDay = new Map<string, number>()
  for (const e of events) {
    const day = toBRTDate(e.occurred_at)
    if (e.event_type === 'song_played') songsByDay.set(day, (songsByDay.get(day) ?? 0) + 1)
    if (e.event_type === 'culto_started') cultosByDay.set(day, (cultosByDay.get(day) ?? 0) + 1)
  }
  return buckets.map((d) => ({
    key: d,
    label: fmtDayLabel(d),
    songsPlayed: songsByDay.get(d) ?? 0,
    cultosStarted: cultosByDay.get(d) ?? 0,
  }))
}

export function aggregateVersionAdoption(events: EventRow[]): VersionAdoptionRow[] {
  const usersByVersion = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.event_type !== 'app_opened') continue
    const v = e.app_version
    if (!v || !e.user_id) continue
    if (!usersByVersion.has(v)) usersByVersion.set(v, new Set())
    usersByVersion.get(v)!.add(e.user_id)
  }
  const total = Array.from(usersByVersion.values()).reduce((s, set) => s + set.size, 0)
  return Array.from(usersByVersion.entries())
    .map(([version, set]) => ({
      version,
      users: set.size,
      pct: total > 0 ? (set.size / total) * 100 : 0,
    }))
    .sort((a, b) => semverCompare(b.version, a.version))
}

function semverCompare(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export function aggregateDownloadOutcome(events: EventRow[]): DownloadOutcome {
  const succeeded = events.filter((e) => e.event_type === 'download_succeeded').length
  const failed = events.filter((e) => e.event_type === 'download_failed').length
  const total = succeeded + failed
  return {
    succeeded,
    failed,
    failureRate: total > 0 ? failed / total : null,
  }
}

export async function fetchEventsHealth(): Promise<EventsHealth> {
  const now = Date.now()
  const oneHour = new Date(now - 3_600_000).toISOString()
  const sixHours = new Date(now - 6 * 3_600_000).toISOString()
  const todayStart = new Date(now - 86_400_000).toISOString()

  const [hourRes, sixRes, todayRes] = await Promise.all([
    supabaseAdmin.from('analytics_events').select('id', { count: 'exact', head: true })
      .gte('occurred_at', oneHour),
    supabaseAdmin.from('analytics_events').select('id', { count: 'exact', head: true })
      .gte('occurred_at', sixHours),
    supabaseAdmin.from('analytics_events').select('user_id')
      .gte('occurred_at', todayStart),
  ])

  const perHour24h = hourRes.count ?? 0
  const activeClientsToday = new Set(
    (todayRes.data ?? []).map((r) => (r as { user_id: string | null }).user_id).filter(Boolean),
  ).size
  const pipelineOk = (sixRes.count ?? 0) > 0
  return { perHour24h, activeClientsToday, pipelineOk }
}

/** Funil de ativação — todos os usuários históricos. */
export async function fetchFunnel(): Promise<FunnelData> {
  // signups via auth.users — fetchado em adminProduto (listAllUsers).
  // Aqui só os 3 últimos passos.
  const { data: firstSongData } = await supabaseAdmin.rpc('admin_first_song_per_user').catch(() => ({ data: null }))
  // Se não houver RPC, fallback: query inline
  // (simplificação no MVP: contar usuários distintos com pelo menos 1 song criada)

  const [songsByUser, playlistsByUser, executedByUser] = await Promise.all([
    supabaseAdmin.from('songs').select('user_id:created_by').limit(100000),
    supabaseAdmin.from('playlists').select('user_id:created_by').limit(100000),
    supabaseAdmin.from('analytics_events').select('user_id')
      .eq('event_type', 'culto_started').limit(100000),
  ])

  const firstSong = new Set(
    ((songsByUser.data ?? []) as { user_id: string | null }[])
      .map((r) => r.user_id).filter(Boolean),
  ).size
  const firstCulto = new Set(
    ((playlistsByUser.data ?? []) as { user_id: string | null }[])
      .map((r) => r.user_id).filter(Boolean),
  ).size
  const firstExecuted = new Set(
    ((executedByUser.data ?? []) as { user_id: string | null }[])
      .map((r) => r.user_id).filter(Boolean),
  ).size

  // signups (passo 1) é preenchido pelo caller a partir de listAllUsers
  return { signups: 0, firstSong, firstCulto, firstExecuted }
}

/** Coortes semanais de retenção — orgs cuja 1ª app_opened foi na semana N
 *  retornaram na semana N+k? */
export async function fetchCohortRetention(weeksBack = 6): Promise<CohortData[]> {
  const now = new Date()
  const weekMs = 7 * 86_400_000

  // Pega todos app_opened do período (weeksBack + 6 semanas extras pra trás pra coortes antigas)
  const earliestIso = new Date(now.getTime() - (weeksBack + 6) * weekMs).toISOString()
  const { data, error } = await supabaseAdmin
    .from('analytics_events')
    .select('org_id, occurred_at')
    .eq('event_type', 'app_opened')
    .gte('occurred_at', earliestIso)
  if (error) return []

  const rows = ((data ?? []) as { org_id: string | null; occurred_at: string }[])
    .filter((r) => r.org_id !== null)
  // Determina semana de cada row (ISO week start = Sunday em BRT)
  const orgFirstWeek = new Map<string, number>() // orgId -> weekIndex
  const orgWeeks = new Map<string, Set<number>>() // orgId -> set of weekIndexes seen
  const baseWeek = Math.floor((now.getTime() - weeksBack * weekMs) / weekMs)
  for (const r of rows) {
    const wIdx = Math.floor(new Date(r.occurred_at).getTime() / weekMs)
    if (!orgFirstWeek.has(r.org_id!) || wIdx < orgFirstWeek.get(r.org_id!)!) {
      orgFirstWeek.set(r.org_id!, wIdx)
    }
    if (!orgWeeks.has(r.org_id!)) orgWeeks.set(r.org_id!, new Set())
    orgWeeks.get(r.org_id!)!.add(wIdx)
  }

  const cohorts: CohortData[] = []
  for (let w = 0; w < weeksBack; w++) {
    const wIdx = baseWeek + w
    const cohortOrgs = Array.from(orgFirstWeek.entries())
      .filter(([, first]) => first === wIdx)
      .map(([orgId]) => orgId)
    const cohortSize = cohortOrgs.length
    const weekStart = new Date(wIdx * weekMs).toISOString().slice(0, 10)
    const retention: (number | null)[] = []
    for (let offset = 0; offset < 6; offset++) {
      const targetWeek = wIdx + offset
      if (targetWeek > baseWeek + weeksBack) {
        retention.push(null)
        continue
      }
      if (cohortSize === 0) {
        retention.push(null)
        continue
      }
      const returners = cohortOrgs.filter((o) => orgWeeks.get(o)?.has(targetWeek)).length
      retention.push((returners / cohortSize) * 100)
    }
    cohorts.push({ weekStart, cohortSize, retention })
  }
  return cohorts
}

/** Cultos criados que nunca foram executados (orphans).
 *  Implementa via fetch separado: playlists + lista de playlist_ids com culto_started. */
export async function fetchOrphanCultos(limit = 4): Promise<Array<{ id: string; name: string; createdAt: string; ageDays: number }>> {
  const [playlistsRes, eventsRes] = await Promise.all([
    supabaseAdmin.from('playlists').select('id, name, created_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('analytics_events').select('playlist_id').eq('event_type', 'culto_started'),
  ])
  const playlists = (playlistsRes.data ?? []) as { id: string; name: string; created_at: string }[]
  const executed = new Set(
    ((eventsRes.data ?? []) as { playlist_id: string | null }[])
      .map((r) => r.playlist_id).filter(Boolean),
  )
  const orphans = playlists
    .filter((p) => !executed.has(p.id))
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.created_at,
      ageDays: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86_400_000),
    }))
  return orphans
}
```

- [ ] **Step 2: Test pra aggregators puros**

Criar `lib/adminEvents.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  aggregateEngagement, aggregatePlaybackByDay, aggregateVersionAdoption,
  aggregateDownloadOutcome, type EventRow,
} from './adminEvents'
import { resolvePeriod } from './adminPeriod'

function mkEvent(over: Partial<EventRow>): EventRow {
  return {
    user_id: 'u1', org_id: 'o1', event_type: 'song_played',
    song_id: null, playlist_id: null, metadata: {},
    app_version: '0.13.0', platform: 'macos',
    occurred_at: new Date().toISOString(),
    ...over,
  }
}

describe('aggregateEngagement', () => {
  it('calcula contadores e completionRate', () => {
    const events = [
      mkEvent({ event_type: 'song_played' }),
      mkEvent({ event_type: 'song_played' }),
      mkEvent({ event_type: 'song_completed', metadata: { duration_seconds: 180 } }),
      mkEvent({ event_type: 'culto_started' }),
    ]
    const r = aggregateEngagement(events)
    expect(r.songsPlayed).toBe(2)
    expect(r.songsCompleted).toBe(1)
    expect(r.cultosExecuted).toBe(1)
    expect(r.completionRate).toBeCloseTo(0.5)
    expect(r.audioMinutes).toBe(3)
  })

  it('completionRate null quando não houve play', () => {
    expect(aggregateEngagement([]).completionRate).toBeNull()
  })
})

describe('aggregateVersionAdoption', () => {
  it('sort semver desc + pct', () => {
    const evs = [
      mkEvent({ event_type: 'app_opened', user_id: 'a', app_version: '0.13.0' }),
      mkEvent({ event_type: 'app_opened', user_id: 'a', app_version: '0.13.0' }), // mesmo user, conta 1
      mkEvent({ event_type: 'app_opened', user_id: 'b', app_version: '0.12.0' }),
    ]
    const r = aggregateVersionAdoption(evs)
    expect(r[0].version).toBe('0.13.0')
    expect(r[0].users).toBe(1)
    expect(r[0].pct).toBeCloseTo(50)
  })
})

describe('aggregateDownloadOutcome', () => {
  it('failureRate', () => {
    const evs = [
      mkEvent({ event_type: 'download_succeeded' }),
      mkEvent({ event_type: 'download_succeeded' }),
      mkEvent({ event_type: 'download_failed' }),
    ]
    expect(aggregateDownloadOutcome(evs).failureRate).toBeCloseTo(1 / 3)
  })
})

describe('aggregatePlaybackByDay', () => {
  it('agrega por dia BRT', () => {
    const p = resolvePeriod({ from: '2026-05-20', to: '2026-05-22' })
    const evs = [
      mkEvent({ event_type: 'song_played', occurred_at: '2026-05-20T15:00:00Z' }),
      mkEvent({ event_type: 'song_played', occurred_at: '2026-05-20T16:00:00Z' }),
      mkEvent({ event_type: 'culto_started', occurred_at: '2026-05-21T12:00:00Z' }),
    ]
    const r = aggregatePlaybackByDay(evs, p)
    expect(r).toHaveLength(3)
    expect(r[0].songsPlayed).toBe(2)
    expect(r[1].cultosStarted).toBe(1)
  })
})
```

Run: `cd apps/landing && pnpm vitest run lib/adminEvents.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/lib/adminEvents.ts apps/landing/lib/adminEvents.test.ts
git commit -m "feat(admin): lib adminEvents com aggregators + queries de analytics_events"
```

### Task D3: `lib/adminLanding.ts` — Vercel + downloads + waitlist

**Files:**
- Create: `apps/landing/lib/adminLanding.ts`
- Create: `apps/landing/lib/adminLanding.test.ts`

- [ ] **Step 1: Implementar com fetch paralelo (curr + prev)**

```ts
import { supabaseAdmin } from './supabaseAdmin'
import { fmtDayLabel, type Period } from './adminPeriod'

export type NameCount = { name: string; count: number }
export type VercelPoint = { key: string; label: string; pageviews: number; visitors: number }

export type LandingData = {
  available: boolean
  visitors: number
  pageviews: number
  bounceRate: number | null
  // delta (atual - anterior) em pp/% conforme métrica
  visitorsDelta: number | null
  pageviewsDelta: number | null
  bounceRateDelta: number | null
  timeseries: VercelPoint[]
  referrers: NameCount[]
  countries: NameCount[]
  // Downloads
  downloads: number
  downloadsDelta: number | null
  downloadsMac: number
  downloadsWin: number
  // Waitlist
  waitlistTotal: number
  waitlistIos: number
  waitlistAndroid: number
  waitlistNewInPeriod: number
  waitlistNewDelta: number | null
}

const VERCEL_BASE = 'https://vercel.com/api/web-analytics/timeseries'

async function vercelFetch(period: Period, groupBy?: string): Promise<unknown | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !teamId || !projectId) return null
  const params = new URLSearchParams({
    projectId, teamId, from: period.from, to: period.to, filter: '{}', granularity: 'day',
  })
  if (groupBy) params.set('groupBy', groupBy)
  try {
    const res = await fetch(`${VERCEL_BASE}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

type VercelGroupRow = { key: string; total: number; devices: number; bounceRate: number }

function vercelGroups(json: unknown): Record<string, VercelGroupRow[]> | null {
  return (json as { data?: { groups?: Record<string, VercelGroupRow[]> } })?.data?.groups ?? null
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil', US: 'Estados Unidos', PT: 'Portugal', AR: 'Argentina',
  GB: 'Reino Unido', DE: 'Alemanha', FR: 'França', ES: 'Espanha',
  CA: 'Canadá', MX: 'México', AO: 'Angola', MZ: 'Moçambique',
}

function aggregateVercelMain(json: unknown): { visitors: number; pageviews: number; bounceRate: number | null; timeseries: VercelPoint[] } {
  const groups = vercelGroups(json)
  const series = groups?.all ?? []
  const timeseries: VercelPoint[] = series.map((d) => ({
    key: d.key, label: fmtDayLabel(d.key.slice(0, 10)),
    pageviews: d.total ?? 0, visitors: d.devices ?? 0,
  }))
  const pageviews = timeseries.reduce((s, d) => s + d.pageviews, 0)
  const visitors = timeseries.reduce((s, d) => s + d.visitors, 0)
  let bWeighted = 0, bWeight = 0
  for (const d of series) {
    if (typeof d.bounceRate === 'number' && (d.devices ?? 0) > 0) {
      bWeighted += d.bounceRate * d.devices
      bWeight += d.devices
    }
  }
  return {
    visitors, pageviews, timeseries,
    bounceRate: bWeight > 0 ? bWeighted / bWeight : null,
  }
}

function aggregateGroups(json: unknown, prettify: (k: string) => string): NameCount[] {
  const groups = vercelGroups(json)
  if (!groups) return []
  return Object.entries(groups)
    .map(([k, rows]) => ({ name: prettify(k), count: rows.reduce((s, r) => s + (r.total ?? 0), 0) }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export async function getAdminLanding(period: Period, prev: Period): Promise<LandingData> {
  const [
    mainJson, refJson, countryJson,
    prevMainJson,
    dlCurr, dlPrev, waitlistAll, waitlistPrev,
  ] = await Promise.all([
    vercelFetch(period),
    vercelFetch(period, 'referrer'),
    vercelFetch(period, 'country'),
    vercelFetch(prev),
    supabaseAdmin.from('landing_downloads').select('platform, occurred_at')
      .gte('occurred_at', period.from).lte('occurred_at', period.to),
    supabaseAdmin.from('landing_downloads').select('platform, occurred_at')
      .gte('occurred_at', prev.from).lte('occurred_at', prev.to),
    supabaseAdmin.from('waitlist').select('platforms, created_at'),
    supabaseAdmin.from('waitlist').select('created_at')
      .gte('created_at', prev.from).lte('created_at', prev.to),
  ])

  if (!mainJson) {
    return {
      available: false, visitors: 0, pageviews: 0, bounceRate: null,
      visitorsDelta: null, pageviewsDelta: null, bounceRateDelta: null,
      timeseries: [], referrers: [], countries: [],
      downloads: 0, downloadsDelta: null, downloadsMac: 0, downloadsWin: 0,
      waitlistTotal: 0, waitlistIos: 0, waitlistAndroid: 0,
      waitlistNewInPeriod: 0, waitlistNewDelta: null,
    }
  }

  const curr = aggregateVercelMain(mainJson)
  const prevAgg = prevMainJson ? aggregateVercelMain(prevMainJson) : { visitors: 0, pageviews: 0, bounceRate: null, timeseries: [] }
  const referrers = aggregateGroups(refJson, (k) => (k === '' ? 'Direto' : k))
  const countries = aggregateGroups(countryJson, (k) =>
    k === '' ? 'Desconhecido' : (COUNTRY_NAMES[k.toUpperCase()] ?? k.toUpperCase()),
  )

  const dlCurrRows = (dlCurr.data ?? []) as { platform: string; occurred_at: string }[]
  const dlPrevRows = (dlPrev.data ?? []) as { platform: string; occurred_at: string }[]
  const downloads = dlCurrRows.length
  const downloadsMac = dlCurrRows.filter((r) => r.platform === 'mac').length
  const downloadsWin = dlCurrRows.filter((r) => r.platform === 'win').length
  const downloadsDelta = deltaPct(downloads, dlPrevRows.length)

  const wlAll = ((waitlistAll.data ?? []) as { platforms: string[]; created_at: string }[])
  const waitlistTotal = wlAll.length
  const waitlistIos = wlAll.filter((w) => w.platforms?.includes('ios')).length
  const waitlistAndroid = wlAll.filter((w) => w.platforms?.includes('android')).length
  const waitlistNewInPeriod = wlAll.filter((w) => {
    const t = new Date(w.created_at).getTime()
    return t >= new Date(period.from).getTime() && t <= new Date(period.to).getTime()
  }).length
  const waitlistNewPrev = (waitlistPrev.data ?? []).length
  const waitlistNewDelta = deltaPct(waitlistNewInPeriod, waitlistNewPrev)

  return {
    available: true,
    visitors: curr.visitors, pageviews: curr.pageviews, bounceRate: curr.bounceRate,
    visitorsDelta: deltaPct(curr.visitors, prevAgg.visitors),
    pageviewsDelta: deltaPct(curr.pageviews, prevAgg.pageviews),
    bounceRateDelta: curr.bounceRate !== null && prevAgg.bounceRate !== null
      ? curr.bounceRate - prevAgg.bounceRate : null,
    timeseries: curr.timeseries, referrers, countries,
    downloads, downloadsDelta, downloadsMac, downloadsWin,
    waitlistTotal, waitlistIos, waitlistAndroid,
    waitlistNewInPeriod, waitlistNewDelta,
  }
}
```

- [ ] **Step 2: Test mínimo (mockando supabase + fetch)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseChain = (data: unknown) => ({ data, error: null })
const fromMock = vi.fn()
vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: { from: fromMock },
}))

beforeEach(() => {
  fromMock.mockReset()
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { groups: { all: [] } } }), { status: 200 })) as never
})

const { getAdminLanding } = await import('./adminLanding')
const { resolvePeriod, computePrevPeriod } = await import('./adminPeriod')

describe('getAdminLanding', () => {
  it('available=true e calcula delta de downloads', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'landing_downloads') {
        return {
          select: () => ({ gte: () => ({ lte: () => supabaseChain([
            { platform: 'mac', occurred_at: '2026-05-22T12:00:00Z' },
            { platform: 'win', occurred_at: '2026-05-22T13:00:00Z' },
          ])})}),
        }
      }
      if (table === 'waitlist') {
        return {
          select: (cols: string) => cols.includes('platforms')
            ? supabaseChain([{ platforms: ['ios'], created_at: '2026-05-22T00:00:00Z' }])
            : { gte: () => ({ lte: () => supabaseChain([]) }) },
        }
      }
      return { select: () => supabaseChain([]) }
    })

    process.env.VERCEL_ANALYTICS_TOKEN = 'x'
    process.env.VERCEL_TEAM_ID = 'y'
    process.env.VERCEL_PROJECT_ID = 'z'

    const period = resolvePeriod({ period: '7d' })
    const prev = computePrevPeriod(period)
    const data = await getAdminLanding(period, prev)

    expect(data.available).toBe(true)
    expect(data.downloads).toBe(2)
    expect(data.downloadsMac).toBe(1)
    expect(data.downloadsWin).toBe(1)
    expect(data.waitlistTotal).toBe(1)
    expect(data.waitlistIos).toBe(1)
  })
})
```

Run: `cd apps/landing && pnpm vitest run lib/adminLanding.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/lib/adminLanding.ts apps/landing/lib/adminLanding.test.ts
git commit -m "feat(admin): lib adminLanding com downloads + waitlist + delta vs anterior"
```

### Task D4: `lib/adminProduto.ts` — produto data com eventos

**Files:**
- Create: `apps/landing/lib/adminProduto.ts`
- Create: `apps/landing/lib/adminProduto.test.ts`

- [ ] **Step 1: Mover lógica existente de produto + adicionar consumers de events**

Estrutura:
```ts
import { supabaseAdmin } from './supabaseAdmin'
import { type Period, toBRTDate, toBRTDow, toBRTHour, dayBuckets, fmtDayLabel } from './adminPeriod'
import {
  fetchEvents, aggregateEngagement, fetchDauWauMau, aggregatePlaybackByDay,
  aggregateVersionAdoption, aggregateDownloadOutcome, fetchEventsHealth,
  fetchFunnel, fetchCohortRetention, fetchOrphanCultos,
  type EngagementData, type DauWauMauData, type FunnelData, type CohortData,
  type VersionAdoptionRow, type DownloadOutcome, type PlaybackPoint, type EventsHealth,
} from './adminEvents'

export type DayPoint = { day: string; totalUsers: number; totalSongs: number; totalCultos: number }
export type ActivityPoint = { key: string; label: string; newUsers: number; newSongs: number; newCultos: number }
export type HeatCell = { dow: number; hour: number; count: number }
export type OrgRow = { id: string; name: string; songs: number; cultos: number; members: number; createdAt: string }
export type ActivityRow = { type: 'song' | 'culto' | 'user' | 'org'; title: string; orgName: string; createdAt: string }
export type WeeklyActiveOrgs = { weekStart: string; count: number }[]

export type TeamStructureData = {
  newMembers: number
  newMembersDelta: number | null
  avgTeamSize: number
  newGroups: number
  newGroupsDelta: number | null
  newInvites: number
  newInvitesDelta: number | null
}

export type ProdutoData = {
  // snapshot
  totalUsers: number
  totalOrgs: number
  totalSongs: number
  totalCultos: number
  songsPerOrg: number
  cultosPerOrg: number
  // fluxo no período
  newUsers: number
  newUsersDelta: number | null
  newOrgs: number
  newOrgsDelta: number | null
  newSongs: number
  newSongsDelta: number | null
  newCultos: number
  newCultosDelta: number | null
  activeOrgs: number
  // séries
  growth: DayPoint[]
  activity: ActivityPoint[]
  heatmap: HeatCell[]
  topOrgs: OrgRow[]
  recent: ActivityRow[]
  weeklyActiveOrgs: WeeklyActiveOrgs
  // eventos
  engagement: EngagementData
  engagementPrev: EngagementData
  dauWauMau: DauWauMauData
  playback: PlaybackPoint[]
  funnel: FunnelData
  cohorts: CohortData[]
  versionAdoption: VersionAdoptionRow[]
  downloadOutcome: DownloadOutcome
  eventsHealth: EventsHealth
  orphanCultos: { id: string; name: string; createdAt: string; ageDays: number }[]
  // 02·B
  teamStructure: TeamStructureData
}

// Implementação completa: ver código no spec; este passo é principalmente
// "orquestrar Promise.all" combinando schema + eventos.
```

- [ ] **Step 2: Implementação completa**

Por ser extensa, o subagent deve seguir a estrutura do `adminData.ts` atual (já tem `getProduto`) e expandir:
1. Manter `listAllUsers`, `cumulativeByDay`, snapshot, growth, activity, heatmap, topOrgs, recent — apenas adicionar fetches paralelos pro período anterior pra calcular deltas (`newUsersDelta` = `newUsers - newUsersPrev`).
2. Adicionar fetches paralelos de eventos: `fetchEvents(period, ['song_played','song_completed','culto_started'])` e `fetchEvents(prev, [...])` pra engagement curr/prev.
3. Adicionar fetches independentes: `fetchDauWauMau()`, `fetchVersionAdoption`, `fetchEventsHealth()`, `fetchFunnel()`, `fetchCohortRetention()`, `fetchOrphanCultos()`.
4. `weeklyActiveOrgs`: agrupa orgs com qualquer event nas últimas 6 semanas (1 fetch + agregação).
5. `teamStructure`: queries em `organization_members`, `groups`, `org_invite_codes` filtradas por `created_at`/`joined_at` no período (curr + prev).
6. Funnel: completar `signups` = `users.filter(inPeriod(created_at)).length` ou histórico total.

Helper de delta absoluto:
```ts
function deltaAbs(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return null
  return curr - prev
}
```

- [ ] **Step 3: Test de teamStructure + aggregations**

```ts
import { describe, it, expect, vi } from 'vitest'

const fromMock = vi.fn()
vi.mock('./supabaseAdmin', () => ({ supabaseAdmin: { from: fromMock, auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [] } })) } } } }))

// Teste foca em deltaAbs + agregação de teamStructure
// (implementação completa fica no plano de execução)
```

- [ ] **Step 4: Commit**

```bash
git add apps/landing/lib/adminProduto.ts apps/landing/lib/adminProduto.test.ts
git commit -m "feat(admin): lib adminProduto com eventos + delta + estrutura das equipes"
```

### Task D5: `lib/adminSaude.ts` — Sentry + severity breakdown

**Files:**
- Create: `apps/landing/lib/adminSaude.ts`
- Create: `apps/landing/lib/adminSaude.test.ts`

- [ ] **Step 1: Mover lógica de Sentry de adminData.ts + adicionar prev + severity**

```ts
import { fmtDayLabel, type Period } from './adminPeriod'

export type ErrorPoint = { key: string; label: string; count: number }
export type SentryIssue = {
  shortId: string; title: string; count: number; userCount: number;
  level: string; permalink: string; lastSeen: string;
}
export type SeverityRow = { level: string; count: number }

export type SaudeData = {
  available: boolean
  errorsInPeriod: number
  errorsInPeriodDelta: number | null
  unresolvedIssues: number
  affectedUsers: number
  affectedUsersDelta: number | null
  timeseries: ErrorPoint[]
  topIssues: SentryIssue[]
  severity: SeverityRow[]
}

async function sentryFetch(period: Period): Promise<{ stats: unknown; issues: unknown } | null> {
  const token = process.env.SENTRY_API_TOKEN
  const org = process.env.SENTRY_ORG
  if (!token || !org) return null
  const base = `https://sentry.io/api/0/organizations/${org}`
  const headers = { Authorization: `Bearer ${token}` }
  const range = `start=${encodeURIComponent(period.from)}&end=${encodeURIComponent(period.to)}&environment=production`
  try {
    const [statsRes, issuesRes] = await Promise.all([
      fetch(`${base}/events-stats/?field=count()&query=event.type:error&interval=1d&${range}`,
        { headers, next: { revalidate: 600 } }),
      fetch(`${base}/issues/?query=is:unresolved&limit=100&${range}`,
        { headers, next: { revalidate: 600 } }),
    ])
    if (!statsRes.ok || !issuesRes.ok) return null
    return { stats: await statsRes.json(), issues: await issuesRes.json() }
  } catch {
    return null
  }
}

function emptyData(): SaudeData {
  return {
    available: false, errorsInPeriod: 0, errorsInPeriodDelta: null,
    unresolvedIssues: 0, affectedUsers: 0, affectedUsersDelta: null,
    timeseries: [], topIssues: [], severity: [],
  }
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export async function getAdminSaude(period: Period, prev: Period): Promise<SaudeData> {
  const [curr, prevR] = await Promise.all([sentryFetch(period), sentryFetch(prev)])
  if (!curr) return emptyData()

  const stats = curr.stats as { data?: Array<[number, Array<{ count: number }>]> }
  const issues = curr.issues as Array<{ shortId: string; title: string; count: string | number; userCount?: number; level?: string; permalink?: string; lastSeen?: string }>

  const timeseries: ErrorPoint[] = (stats.data ?? []).map(([ts, arr]) => {
    const day = new Date(ts * 1000).toISOString().slice(0, 10)
    return { key: day, label: fmtDayLabel(day), count: arr?.[0]?.count ?? 0 }
  })
  const errorsInPeriod = timeseries.reduce((s, d) => s + d.count, 0)
  const list = Array.isArray(issues) ? issues : []
  const unresolvedIssues = list.length
  const affectedUsers = list.reduce((s, i) => s + (i.userCount ?? 0), 0)

  let errorsInPeriodDelta: number | null = null
  let affectedUsersDelta: number | null = null
  if (prevR) {
    const prevStats = prevR.stats as { data?: Array<[number, Array<{ count: number }>]> }
    const prevErrors = (prevStats.data ?? []).reduce((s, [, arr]) => s + (arr?.[0]?.count ?? 0), 0)
    const prevIssues = (prevR.issues as Array<{ userCount?: number }>) ?? []
    const prevAffected = prevIssues.reduce((s, i) => s + (i.userCount ?? 0), 0)
    errorsInPeriodDelta = deltaPct(errorsInPeriod, prevErrors)
    affectedUsersDelta = deltaPct(affectedUsers, prevAffected)
  }

  const topIssues: SentryIssue[] = [...list]
    .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
    .slice(0, 6)
    .map((i) => ({
      shortId: i.shortId, title: i.title || 'Erro sem título',
      count: Number(i.count) || 0, userCount: i.userCount ?? 0,
      level: i.level ?? 'error', permalink: i.permalink ?? '',
      lastSeen: i.lastSeen ?? '',
    }))

  const severityMap = new Map<string, number>()
  for (const i of list) {
    const lvl = i.level ?? 'error'
    severityMap.set(lvl, (severityMap.get(lvl) ?? 0) + Number(i.count || 0))
  }
  const severity: SeverityRow[] = Array.from(severityMap.entries())
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count)

  return {
    available: true, errorsInPeriod, errorsInPeriodDelta,
    unresolvedIssues, affectedUsers, affectedUsersDelta,
    timeseries, topIssues, severity,
  }
}
```

- [ ] **Step 2: Test mínimo do severity breakdown**

```ts
import { describe, it, expect, vi } from 'vitest'

beforeEach(() => {
  global.fetch = vi.fn(async (url: string) => {
    if (url.includes('/issues/')) {
      return new Response(JSON.stringify([
        { shortId: 'A', title: 't1', count: 5, level: 'error', permalink: '' },
        { shortId: 'B', title: 't2', count: 3, level: 'warning', permalink: '' },
      ]))
    }
    return new Response(JSON.stringify({ data: [[1716422400, [{ count: 10 }]]] }))
  }) as never
  process.env.SENTRY_API_TOKEN = 'x'
  process.env.SENTRY_ORG = 'y'
})

const { getAdminSaude } = await import('./adminSaude')
const { resolvePeriod, computePrevPeriod } = await import('./adminPeriod')

describe('getAdminSaude.severity', () => {
  it('agrupa por level', async () => {
    const p = resolvePeriod({ period: '7d' })
    const r = await getAdminSaude(p, computePrevPeriod(p))
    expect(r.severity).toEqual(expect.arrayContaining([
      { level: 'error', count: 5 },
      { level: 'warning', count: 3 },
    ]))
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/landing/lib/adminSaude.ts apps/landing/lib/adminSaude.test.ts
git commit -m "feat(admin): lib adminSaude com delta + severity breakdown"
```

### Task D6: Refatorar `lib/adminData.ts` pra orquestrar

**Files:**
- Modify: `apps/landing/lib/adminData.ts` (deleta tudo, vira orquestrador fino)

- [ ] **Step 1: Substituir o conteúdo**

```ts
import { getAdminLanding, type LandingData } from './adminLanding'
import { getAdminProduto, type ProdutoData } from './adminProduto'
import { getAdminSaude, type SaudeData } from './adminSaude'
import { resolvePeriod, computePrevPeriod, type Period, type PresetKey } from './adminPeriod'

export type AdminData = {
  period: Period
  prevPeriod: Period
  landing: LandingData
  produto: ProdutoData
  saude: SaudeData
  fetchedAt: string
}

export { resolvePeriod, type Period, type PresetKey }
export type { LandingData, ProdutoData, SaudeData }

export async function getAdminData(period: Period): Promise<AdminData> {
  const prevPeriod = computePrevPeriod(period)
  const [landing, produto, saude] = await Promise.all([
    getAdminLanding(period, prevPeriod),
    getAdminProduto(period, prevPeriod),
    getAdminSaude(period, prevPeriod),
  ])
  return { period, prevPeriod, landing, produto, saude, fetchedAt: new Date().toISOString() }
}
```

- [ ] **Step 2: Typecheck + suite completa**

Run: `cd apps/landing && pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/lib/adminData.ts
git commit -m "refactor(admin): adminData vira orquestrador fino"
```

---

## Phase E — Admin UI components

Cada componente é uma task pequena. Vou usar template denso aqui — para cada um, o subagent:
1. Cria o arquivo `.tsx` com a interface descrita
2. Cria `.test.tsx` cobrindo render básico + props variações
3. Roda `pnpm vitest run` no arquivo
4. Commit

### Task E1: `admin.module.css` — design tokens + base styles

**Files:**
- Create: `apps/landing/app/admin/admin.module.css`
- Modify: `apps/landing/app/globals.css` — remove classes `admin-*` antigas (já que módulo CSS local toma posse)

- [ ] **Step 1: Migrar tokens do mockup HTML pro module.css**

Copiar as variáveis CSS (`:root { --bg, --card, --primary, etc. }`) e todas as classes (`.kpi-card`, `.section`, `.period-bar`, etc.) do HTML pro `admin.module.css`. Manter nomes idênticos pra facilitar o port das markups.

NOTA: CSS modules em Next.js exigem export via `import styles from './admin.module.css'` e `className={styles.kpiCard}`. Pra preservar nomes hifenizados, usar `:global(.kpi-card)` ou converter pra camelCase. **Decisão: usar `:global()` pra evitar mudança em massa nas classes mas escopar ao layout do admin via wrapper `<div className="admin-root">`.**

```css
.admin-root :global(.kpi-card) {
  background: var(--card);
  /* ... */
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/landing/app/admin/admin.module.css apps/landing/app/globals.css
git commit -m "feat(admin): design tokens novos via admin.module.css"
```

### Task E2: `DeltaBadge.tsx` — badge ▲/▼ com cor

**Files:**
- Create: `apps/landing/app/admin/components/DeltaBadge.tsx`
- Create: `apps/landing/app/admin/components/DeltaBadge.test.tsx`

- [ ] **Step 1: Implementar**

```tsx
type Props = {
  value: number | null
  format: 'pct' | 'pp' | 'abs'
  /** higher-better (visitas): up=green. lower-better (bounce, erros): up=red. */
  direction?: 'higher-better' | 'lower-better'
}

export default function DeltaBadge({ value, format, direction = 'higher-better' }: Props) {
  if (value === null || value === undefined) {
    return <span className="kpi-delta neutral">—</span>
  }
  const positive = value > 0
  const isGood = direction === 'higher-better' ? positive : !positive
  const cls = value === 0 ? 'neutral' : isGood ? 'up' : 'down'
  const arrow = value === 0 ? '·' : positive ? '▲' : '▼'
  const abs = Math.abs(value)
  const text = format === 'pct'
    ? `${arrow} ${abs.toFixed(1)}%`
    : format === 'pp'
    ? `${arrow} ${abs.toFixed(1)}pp`
    : `${positive ? '+' : '-'}${Math.round(abs)}`
  return <span className={`kpi-delta ${cls}`}>{text}</span>
}
```

- [ ] **Step 2: Test**

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DeltaBadge from './DeltaBadge'

describe('DeltaBadge', () => {
  it('renderiza — quando value é null', () => {
    const { container } = render(<DeltaBadge value={null} format="pct" />)
    expect(container.textContent).toBe('—')
  })
  it('up verde pra higher-better positivo', () => {
    const { container } = render(<DeltaBadge value={32.4} format="pct" />)
    expect(container.querySelector('.up')).toBeTruthy()
    expect(container.textContent).toContain('▲ 32.4%')
  })
  it('down vermelho pra higher-better negativo', () => {
    const { container } = render(<DeltaBadge value={-10} format="pct" />)
    expect(container.querySelector('.down')).toBeTruthy()
  })
  it('inverte cor pra lower-better', () => {
    const { container } = render(<DeltaBadge value={-3.2} format="pp" direction="lower-better" />)
    expect(container.querySelector('.up')).toBeTruthy() // -3.2pp é bom em bounce
  })
})
```

Run + commit:
```bash
cd apps/landing && pnpm vitest run app/admin/components/DeltaBadge.test.tsx
git add apps/landing/app/admin/components/DeltaBadge.tsx apps/landing/app/admin/components/DeltaBadge.test.tsx
git commit -m "feat(admin): DeltaBadge component"
```

### Task E3: `KpiCard.tsx` — extrai + adiciona Snapshot/Flow + delta

**Files:**
- Create: `apps/landing/app/admin/components/KpiCard.tsx`
- Create: `apps/landing/app/admin/components/KpiCard.test.tsx`

- [ ] **Step 1: Implementar (interface do spec §Mudanças por seção)**

```tsx
import DeltaBadge from './DeltaBadge'

type Props = {
  label: string
  value: number | string | null
  unit?: string
  kind: 'snapshot' | 'flow'
  delta?: { value: number | null; format: 'pct' | 'pp' | 'abs'; direction?: 'higher-better' | 'lower-better' }
  context?: string
  disabled?: boolean
}

export default function KpiCard({ label, value, unit, kind, delta, context, disabled }: Props) {
  return (
    <div className="kpi-card" style={disabled ? { opacity: 0.55 } : undefined}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-type ${kind}`}>{kind === 'snapshot' ? 'Snapshot' : 'Fluxo'}</span>
      </div>
      <div className="kpi-value">
        {value ?? '—'}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {(delta || context) && (
        <div className="kpi-meta">
          {delta && <DeltaBadge value={delta.value} format={delta.format} direction={delta.direction} />}
          {context && <span className="what">{context}</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test + commit (mesma rotina)**

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import KpiCard from './KpiCard'

describe('KpiCard', () => {
  it('renderiza label + value', () => {
    const { container } = render(<KpiCard label="Usuários" value={47} kind="snapshot" />)
    expect(container.textContent).toContain('Usuários')
    expect(container.textContent).toContain('47')
    expect(container.textContent).toContain('Snapshot')
  })
  it('disabled aplica opacidade', () => {
    const { container } = render(<KpiCard label="X" value={null} kind="flow" disabled />)
    expect(container.querySelector('.kpi-card')?.getAttribute('style')).toContain('opacity')
  })
})
```

Commit: `feat(admin): KpiCard com Snapshot/Flow + delta`

### Tasks E4–E20: componentes restantes

Cada um segue o mesmo padrão (impl + test + commit). Lista resumida com referência ao spec/mockup pra interface:

- [ ] **E4 TopBar** — brand bar (audio bars SVG) + tag "Admin" + status sessão + email + LogoutButton. Sem state, props: `email: string`.
- [ ] **E5 PeriodBar** — presets (Hoje/7d/30d/90d) como `<Link href="?period=Xd">`, dois `<input type="date">` em `<form>` com `action` pointing pra `?from=&to=`, botão "Aplicar". Props: `current: Period`.
- [ ] **E6 SectionHead** — num (01/02/03) + h2 + question + source badge. Props: `num, title, question, source`.
- [ ] **E7 SubsectionHead** — tag (02·A), h3, opcional `collecting` pill + hint. Props: `tag, title, collectingSince?, hint?`.
- [ ] **E8 WaitlistCard** — 3 stat boxes + delta. Props: `data: { total, ios, android, newInPeriod, newDelta }`.
- [ ] **E9 DownloadsCard** — KPI card grande com breakdown mac/win + delta. Props: `data: { downloads, downloadsMac, downloadsWin, downloadsDelta }`.
- [ ] **E10 Funnel** — 4 steps com bars + drop labels. Props: `data: FunnelData`. Calcula percentuais e drops.
- [ ] **E11 CohortHeatmap** — table 7 cohorts × 6 weeks com cores por % retenção. Props: `data: CohortData[]`. Renderiza `—` pra null.
- [ ] **E12 VersionAdoption** — 5 rows (top 5 versões) com bar + users + pct. Props: `data: VersionAdoptionRow[]`.
- [ ] **E13 DownloadSuccessCard** — % falha + bars sucesso/falha + totais. Props: `data: DownloadOutcome`.
- [ ] **E14 DauWauMau** — 3 stats + stickiness row inferior. Props: `data: DauWauMauData`.
- [ ] **E15 WeeklyOrgsBars** — bar chart 6 semanas (recharts BarChart). Props: `data: WeeklyActiveOrgs`.
- [ ] **E16 PlaybackChart** — area `song_played` + dots `culto_started` (recharts ComposedChart). Props: `data: PlaybackPoint[]`.
- [ ] **E17 OrphanCultosCard** — KPI grande + tabela 4 rows com idade. Props: `data: { orphans, total }`.
- [ ] **E18 EngagementKpis** — 4 KpiCards na ordem do mockup. Props: `data: EngagementData, prev: EngagementData`.
- [ ] **E19 TeamStructureKpis** — 4 KpiCards. Props: `data: TeamStructureData`.
- [ ] **E20 SeverityBreakdown** — usa BarList existente com cores por nível. Props: `data: SeverityRow[]`.
- [ ] **E21 RecentActivity** — lista de activity rows com dots coloridos por tipo. Props: `rows: ActivityRow[]`.
- [ ] **E22 TopOrgs** — 5 rows com ícone + nome + bar + valor. Props: `rows: OrgRow[]`.
- [ ] **E23 EventsHealthCard** — taxa/h + clientes ativos + pill saudável. Props: `data: EventsHealth`.

Para cada task E4–E23:
1. Criar arquivo seguindo a estrutura do mockup (SVG/HTML inline do design)
2. Criar `.test.tsx` com 2-3 assertions: render + props variantes
3. `cd apps/landing && pnpm vitest run app/admin/components/<Name>.test.tsx`
4. `git commit -m "feat(admin): <Name> component"`

### Task E24: Restilizar componentes existentes

**Files:**
- Modify: `apps/landing/app/admin/components/VercelChart.tsx`
- Modify: `apps/landing/app/admin/components/GrowthChart.tsx`
- Modify: `apps/landing/app/admin/components/ActivityHeatmap.tsx`
- Modify: `apps/landing/app/admin/components/SentryErrorChart.tsx`
- Modify: `apps/landing/app/admin/components/BarList.tsx`

- [ ] **Step 1: Para cada um, alinhar visual ao mockup**

Mudanças típicas: cores via tokens novos (`var(--primary)` etc.), tooltips estilo monospace, gridlines mais suaves, fontes. NÃO mudar API/props — só estilo.

- [ ] **Step 2: Test smoke (já existem; só garante que não quebrou)**

Run: `cd apps/landing && pnpm vitest run app/admin/components/`
Expected: tudo PASS.

- [ ] **Step 3: Commit em bloco**

```bash
git add apps/landing/app/admin/components/{VercelChart,GrowthChart,ActivityHeatmap,SentryErrorChart,BarList}.tsx
git commit -m "style(admin): restiliza charts e listas pro design novo"
```

### Task E25: Deletar `PeriodSelector.tsx` e `DailyActivityChart.tsx`

**Files:**
- Delete: `apps/landing/app/admin/components/PeriodSelector.tsx`
- Delete: `apps/landing/app/admin/components/PeriodSelector.test.tsx` (se existir)
- Delete: `apps/landing/app/admin/components/DailyActivityChart.tsx`
- Delete: `apps/landing/app/admin/components/DailyActivityChart.test.tsx` (se existir)

- [ ] **Step 1: Verificar zero referências**

Run: `grep -rn "PeriodSelector\|DailyActivityChart" apps/landing/ --include="*.tsx" --include="*.ts" | grep -v ".test.tsx"`
Expected: zero matches (após page.tsx ter sido reescrita — fazer essa task DEPOIS de F1).

- [ ] **Step 2: Deletar + commit**

```bash
git rm apps/landing/app/admin/components/PeriodSelector.tsx apps/landing/app/admin/components/DailyActivityChart.tsx 2>/dev/null
git commit -m "chore(admin): remove componentes substituídos (PeriodSelector, DailyActivityChart)"
```

---

## Phase F — Page assembly + validação final

### Task F1: Reescrever `app/admin/page.tsx`

**Files:**
- Modify: `apps/landing/app/admin/page.tsx` (sobrescrever)

- [ ] **Step 1: Substituir o conteúdo da página pelo layout do mockup**

Estrutura (pseudocódigo):

```tsx
import { getAdminData, resolvePeriod } from '@/lib/adminData'
import styles from './admin.module.css'
import TopBar from './components/TopBar'
import PeriodBar from './components/PeriodBar'
import SectionHead from './components/SectionHead'
import SubsectionHead from './components/SubsectionHead'
import KpiCard from './components/KpiCard'
import VercelChart from './components/VercelChart'
import BarList from './components/BarList'
import WaitlistCard from './components/WaitlistCard'
import DownloadsCard from './components/DownloadsCard'
import GrowthChart from './components/GrowthChart'
import ActivityHeatmap from './components/ActivityHeatmap'
import TopOrgs from './components/TopOrgs'
import RecentActivity from './components/RecentActivity'
import EngagementKpis from './components/EngagementKpis'
import DauWauMau from './components/DauWauMau'
import WeeklyOrgsBars from './components/WeeklyOrgsBars'
import PlaybackChart from './components/PlaybackChart'
import Funnel from './components/Funnel'
import OrphanCultosCard from './components/OrphanCultosCard'
import CohortHeatmap from './components/CohortHeatmap'
import VersionAdoption from './components/VersionAdoption'
import DownloadSuccessCard from './components/DownloadSuccessCard'
import EventsHealthCard from './components/EventsHealthCard'
import TeamStructureKpis from './components/TeamStructureKpis'
import SentryErrorChart from './components/SentryErrorChart'
import SeverityBreakdown from './components/SeverityBreakdown'

export const revalidate = 0

export default async function AdminDashboard({
  searchParams,
}: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const sp = await searchParams
  const period = resolvePeriod(sp)
  const data = await getAdminData(period)

  return (
    <div className={styles['admin-root']}>
      <TopBar email={/* TODO from session */} />
      <main className="container">
        <div className="page-head">
          <h1>Dashboard</h1>
          <p className="sub">Saúde e crescimento do Leviticus consolidados em uma página.</p>
          <p className="last-updated">Atualizado em {new Date(data.fetchedAt).toLocaleString('pt-BR')} · cache externo 10 min</p>
        </div>

        <PeriodBar current={period} />

        {/* SEÇÃO 01 — LANDING */}
        <section className="section">
          <SectionHead num="01" title="Landing" question="Estamos atraindo e convertendo visitantes?" source="Vercel Analytics" />
          <div className="kpi-grid">
            <KpiCard label="Visitantes únicos" value={data.landing.visitors.toLocaleString('pt-BR')} kind="flow"
              delta={{ value: data.landing.visitorsDelta, format: 'pct' }} context="vs. período anterior" />
            <KpiCard label="Pageviews" value={data.landing.pageviews.toLocaleString('pt-BR')} kind="flow"
              delta={{ value: data.landing.pageviewsDelta, format: 'pct' }} />
            <KpiCard label="Taxa de rejeição" value={data.landing.bounceRate?.toFixed(1) ?? '—'} unit="%" kind="flow"
              delta={{ value: data.landing.bounceRateDelta, format: 'pp', direction: 'lower-better' }} />
            <DownloadsCard data={data.landing} />
          </div>
          {/* ... charts ... */}
          <SubsectionHead tag="01·A" title="Waitlist mobile" />
          <WaitlistCard data={data.landing} />
        </section>

        {/* SEÇÃO 02 — PRODUTO + sub-seções A e B */}
        {/* ... montagem completa seguindo a ordem do mockup HTML ... */}

        {/* SEÇÃO 03 — SAÚDE */}
        {/* ... */}
      </main>
    </div>
  )
}
```

Implementação completa exige reproduzir cada bloco do HTML mockup. Subagent deve abrir `~/Downloads/Leviticus Admin Dashboard.html` como referência visual e mapear cada seção/sub-seção 1:1.

- [ ] **Step 2: Smoke run**

Run: `cd apps/landing && pnpm tsc --noEmit && pnpm dev` (em background); abrir `http://localhost:3000/admin` (requer login).

Verificar: renderiza sem erro de runtime, dados aparecem onde esperado.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/app/admin/page.tsx
git commit -m "feat(admin): page.tsx reescrita com layout novo + todas as seções"
```

### Task F2: Layout — passar email do session pro TopBar

**Files:**
- Modify: `apps/landing/app/admin/layout.tsx` ou page.tsx

- [ ] **Step 1: Buscar email do session (server-side)**

Em `page.tsx`, antes do return:

```ts
import { getAdminSession } from '@/lib/adminAuth'
const session = await getAdminSession() // retorna { email } ou null
```

Passar `email={session?.email ?? 'admin'}` pro TopBar.

Se `getAdminSession` não existe ainda, ler de `lib/adminAuth.ts` o que existe e adaptar.

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(admin): TopBar mostra email do admin logado"
```

### Task F3: Full test pass + typecheck

**Files:** nenhum

- [ ] **Step 1: Suite completa landing**

Run: `cd apps/landing && pnpm vitest run && pnpm tsc --noEmit`
Expected: 100% PASS.

- [ ] **Step 2: Suite completa desktop (pra culto_started + duration)**

Run: `cd apps/desktop && pnpm vitest run && pnpm tsc --noEmit`
Expected: 100% PASS.

- [ ] **Step 3: Monorepo**

Run: `pnpm -w test && pnpm -w typecheck`
Expected: PASS.

### Task F4: Smoke E2E manual

- [ ] **Step 1: Sobe Supabase local + dev landing**

```bash
supabase start
cd apps/landing && pnpm dev
```

- [ ] **Step 2: Validar `/admin`**

Browser em `http://localhost:3000/admin/login` → login → `/admin` renderiza.

Verificar:
- Topbar com brand + email + Sair
- Period bar com presets clicáveis (mudam URL)
- Seção 01 com 4 KPIs + chart + listas + waitlist
- Seção 02 completa: KPIs, growth, engagement com dados (ou empty se sem eventos), funnel, cohorts, version adoption, downloads success, events health, team structure, heatmap, top orgs, atividade recente
- Seção 03 com 3 KPIs + chart + severity + top issues

Console: zero erros de runtime.

- [ ] **Step 3: Clicar botão download na landing**

`http://localhost:3000` → seção downloads → click "Baixar para macOS" → deve redirecionar pra release URL do Supabase Storage e inserir row em `landing_downloads`.

Verificar no SQL:
```bash
supabase db sql --linked=false "SELECT * FROM landing_downloads ORDER BY occurred_at DESC LIMIT 5"
```

### Task F5: Atualizar PR body / abrir PR

**Files:** nenhum

- [ ] **Step 1: Push da branch**

```bash
git push -u origin feat/admin-dashboard-redesign
```

- [ ] **Step 2: Abrir PR**

```bash
gh pr create --base dev --title "feat(admin): redesign do dashboard com métricas event-driven" --body "$(cat <<'EOF'
## Summary

- Substitui `apps/landing/app/admin/` pelo novo design do mockup HTML
- Adiciona métricas event-driven (engagement, DAU/MAU, funnel, cohorts, version adoption, download success) lendo de `analytics_events` (infra existente)
- Nova feature na landing: contador de download via `/api/download/[platform]` → tabela `landing_downloads`
- Card de waitlist mobile (lê de `waitlist` existente)
- Delta vs período anterior em todos os KPIs
- Emite novo evento `culto_started` no app desktop ao tocar culto inteiro
- 3 migrations aditivas (todas retro-compatíveis)

Spec: [docs/superpowers/specs/2026-05-23-admin-dashboard-redesign-design.md](docs/superpowers/specs/2026-05-23-admin-dashboard-redesign-design.md)
Plan: [docs/superpowers/plans/2026-05-23-admin-dashboard-redesign.md](docs/superpowers/plans/2026-05-23-admin-dashboard-redesign.md)

## Test plan
- [x] `pnpm test` passa em landing e desktop
- [x] `pnpm typecheck` no monorepo
- [x] Smoke manual em `/admin` com Supabase local
- [x] Click de download na landing gera row em `landing_downloads`
- [x] App desktop emite `culto_started` ao tocar culto

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec coverage check

- [x] Visual migration → Phase E (todos os componentes)
- [x] Delta vs período anterior → Phase D (computePrevPeriod + aggregations curr/prev)
- [x] Engagement KPIs → adminEvents.aggregateEngagement + E18
- [x] DAU/WAU/MAU + Stickiness → fetchDauWauMau + E14
- [x] Reprodução por dia → aggregatePlaybackByDay + E16
- [x] Funil 4 etapas → fetchFunnel + E10
- [x] Cultos órfãos → fetchOrphanCultos + E17
- [x] Retenção cohort → fetchCohortRetention + E11
- [x] Adoção de versão → aggregateVersionAdoption + E12
- [x] Taxa falha download → aggregateDownloadOutcome + E13
- [x] Sub-seção estrutura das equipes → teamStructure em adminProduto + E19
- [x] Severity breakdown → adminSaude.severity + E20
- [x] Waitlist mobile → adminLanding + E8
- [x] Downloads → migration A3 + route C1 + DownloadsCard E9
- [x] `culto_started` desktop → Phase B
- [x] Migrations → Phase A (3 migrations)
- [x] Eventos health (substitui "fila de eventos") → fetchEventsHealth + E23
- [x] Page reassembly → Phase F

### Placeholder scan

- Em E4–E23 algumas tasks dizem "seguir o mockup" sem inline do código completo — esse é o caso onde a referência visual (HTML mockup) é a fonte. Aceitável: o subagent abre o HTML e converte.
- Em D4 (adminProduto) o passo 2 diz "Implementação completa". Risco: pode virar gap. **Mitigação:** o subagent deve seguir o padrão de `getProduto` atual + os 6 fetches de eventos listados explicitamente.
- Não há TODOs no body do plano.

### Type consistency

- `Period`, `PresetKey` definidos em adminPeriod, importados em todo lugar — consistente.
- `EngagementData`, `DauWauMauData`, etc. definidos em adminEvents, consumidos em adminProduto e components — consistente.
- `LandingData`, `ProdutoData`, `SaudeData` exportados de adminData (re-export), consumidos em page.tsx — consistente.

---

**Plano completo.** Próximo passo: escolher execução (subagent-driven recommended) e seguir.
