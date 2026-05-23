# Admin Dashboard — Redesign visual + métricas event-driven

**Data:** 2026-05-23
**Autor:** Claude (sob direção de João)
**Branch:** `feat/admin-dashboard-redesign`
**Origem:** mockup HTML em `~/Downloads/Leviticus Admin Dashboard.html` gerado no Claude Designer

## Contexto

O admin atual em [apps/landing/app/admin/page.tsx](../../../apps/landing/app/admin/page.tsx) já é um Next.js 15 App Router server component com:
- Auth + middleware (`lib/adminAuth.ts`)
- Fetch agregado em [lib/adminData.ts](../../../apps/landing/lib/adminData.ts) cobrindo Vercel Analytics, Supabase service-role e Sentry
- Componentes recharts (`VercelChart`, `GrowthChart`, `DailyActivityChart`, `ActivityHeatmap`, `SentryErrorChart`, `BarList`)

O mockup novo expande significativamente a riqueza de informação: numeração de seções (01/02/03), badges Snapshot/Flow, delta vs período anterior em todos os KPIs, sub-seções tematizadas, e várias visualizações novas (funil de ativação, retenção por coorte, adoção de versão, taxa de falha de download, fila de eventos).

A descoberta-chave que destrava o escopo: a infra de eventos **já está em produção**.
- Tabela `analytics_events` em [supabase/migrations/20260522000001_analytics_events.sql](../../../supabase/migrations/20260522000001_analytics_events.sql) com RLS
- Fila local SQLite (`analytics_queue`) + flush em batch em [apps/desktop/src/lib/analytics.ts](../../../apps/desktop/src/lib/analytics.ts)
- Eventos sendo emitidos hoje: `app_opened`, `song_played`, `song_completed`, `download_succeeded`, `download_failed` — todos com `app_version` e `platform`
- Pontos de emissão verificados: `App.tsx`, `PlayerMini.tsx`, `playback.ts`, `store/downloads.ts`

Falta apenas `culto_started` no rol de eventos.

## Objetivos

Substituir `apps/landing/app/admin/page.tsx` (e componentes) pelo design novo, com **todos os dados reais** vindos do schema + `analytics_events`, num único PR.

Non-goals:
- Inventar novos eventos além do `culto_started`
- Mudar comportamento de auth/middleware (já funcionando)
- Tocar landing fora de `/admin`
- Manter compatibilidade com o admin antigo (substitui)

## Arquitetura

### Visão geral

```
apps/landing/
  app/admin/
    page.tsx                  ← reescrita (server component)
    layout.tsx                ← inalterado
    login/, api/              ← inalterados
    components/
      PeriodBar.tsx           ← NOVO (substitui PeriodSelector)
      KpiCard.tsx             ← NOVO (extraído de page.tsx)
      SectionHead.tsx         ← NOVO
      TopBar.tsx              ← NOVO
      Funnel.tsx              ← NOVO
      CohortHeatmap.tsx       ← NOVO
      VersionAdoption.tsx     ← NOVO
      DownloadSuccessCard.tsx ← NOVO
      DauWauMau.tsx           ← NOVO
      WeeklyOrgsBars.tsx      ← NOVO
      PlaybackChart.tsx       ← NOVO (substitui DailyActivityChart parcialmente)
      OrphanCultosCard.tsx    ← NOVO
      EngagementKpis.tsx      ← NOVO
      TeamStructureKpis.tsx   ← NOVO
      SeverityBreakdown.tsx   ← NOVO
      VercelChart.tsx         ← restilizada (mesmo recharts)
      GrowthChart.tsx         ← restilizada
      ActivityHeatmap.tsx     ← restilizada
      SentryErrorChart.tsx    ← restilizada
      BarList.tsx             ← restilizada
      LogoutButton.tsx        ← inalterada
      PeriodSelector.tsx      ← DELETADA (substituída por PeriodBar)
  lib/
    adminData.ts              ← expandida (queries de events + struct)
    adminPeriod.ts            ← NOVO (extraído de adminData)
```

Separação: `adminPeriod.ts` isola resolução de período + helpers de data (BRT) que hoje vivem em `adminData.ts`. Mantém `adminData.ts` focado em fetching.

### Data flow

1. Page recebe `searchParams` (`period`, `from`, `to`).
2. `resolvePeriod(sp)` em `adminPeriod.ts` retorna `Period` + calcula período anterior equivalente (para delta).
3. `getAdminData(period, prevPeriod)` faz fetch paralelo de 4 fontes:
   - **Vercel** (atual + anterior)
   - **Supabase** (snapshot + atual + anterior)
   - **Sentry** (atual + anterior)
   - **Analytics events** (atual + anterior, mesma janela; cohort retention usa janela maior)
4. Retorna `AdminData` com `current`, `prev`, `delta` calculado.
5. Page renderiza seções; cada componente recebe slice tipado de `AdminData`.

### Delta vs período anterior

Período anterior = janela do mesmo comprimento imediatamente antes da janela atual.
- 30d atual: 21 abr → 21 mai → 30d anterior: 22 mar → 21 abr
- Custom: mesma duração, deslocada pra trás
- `today`: período anterior = ontem (00:00 → 24:00)

Para cada KPI:
- Absolutos (visitantes, pageviews, erros): `delta = (current - prev) / prev * 100` (em pp para taxas)
- Snapshot (totalUsers, totalOrgs): delta = diferença absoluta no período (`newUsers` já é isso)

Componente `KpiCard` aceita `delta?: { value: number; format: 'pct' | 'pp' | 'abs'; direction: 'higher-better' | 'lower-better' }` e renderiza cor/seta apropriada.

## Mudanças por seção

### Topbar + Page head + Period bar

- `TopBar`: brand bar (audio bars SVG inline) + tag "Admin" + indicador de sessão ativa + email + botão Sair
- Page head: título "Dashboard" + subtítulo + "Última atualização há Xs · cache externo 10 min" (calculado a partir de `fetchedAt`, hidrata client-side com `setInterval` se quisermos contador vivo — caso contrário renderiza só no SSR e atualiza no refresh; **opta por SSR-only no PR1**, viver dinâmico fica pra depois)
- Period bar: presets (Hoje/7d/30d/90d) + dois date inputs com calendário + "Aplicar" + URL hint `?period=30d` (informacional, server-side fact)
  - Presets viram links com `?period=Xd` (SSR fetch)
  - Date inputs em form submetendo `?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Sem JS extra: tudo via navegação. Coerente com SSR.

### Seção 01 — Landing (Vercel + Supabase)

Mantém VercelChart + BarList (referrers/países), mas adiciona:
- **Delta nos 3 KPIs principais** (visitantes, pageviews, bounce rate)
- **4º KPI "Downloads" REAL** — substitui o placeholder do mockup. Lê de nova tabela `landing_downloads` (ver §Landing — contador de download). Total no período + delta + breakdown mac/win.
- Badges Snapshot/Flow em cada KPI (todos Flow nesta seção)
- Visual: cards/typography do design novo

#### Sub-seção 01·A — Waitlist mobile

Card novo (não estava no mockup original — adição). Mostra interesse declarado em versão mobile:

| Métrica | Query |
|---|---|
| Total na waitlist | `count(*) from waitlist` |
| Aguardando iOS | `count where 'ios' = any(platforms)` |
| Aguardando Android | `count where 'android' = any(platforms)` |
| Aguardando ambos | `count where 'ios' = any(platforms) and 'android' = any(platforms)` |
| Novos no período | `count where created_at in period` + delta vs anterior |

Componente `WaitlistCard` — uma row com 3 stat boxes (total, iOS, Android) + delta de novos no período. Layout similar ao `triple-stat` do mockup.

Fonte: `waitlist` table já existe ([supabase/migrations/20260513000001_waitlist.sql](../../../supabase/migrations/20260513000001_waitlist.sql)). Service role lê sem RLS — perfeito para admin server-side.

#### Sub-seção 01·B — Contador de downloads (nova feature na landing)

**Por que:** hoje os botões em [apps/landing/components/Download.tsx](../../../apps/landing/components/Download.tsx) apontam direto pro Supabase Storage (`<a href={release.macUrl}>`). Não temos visibilidade nenhuma de clicks.

**Design:**

1. **Nova tabela `landing_downloads`** (migration aditiva):
   ```sql
   create table landing_downloads (
     id           uuid primary key default gen_random_uuid(),
     platform     text not null check (platform in ('mac', 'win')),
     occurred_at  timestamptz not null default now(),
     referrer     text,        -- request header, opcional
     user_agent   text,        -- raw UA pra futura segmentação
     country      text         -- da request header (Vercel injeta x-vercel-ip-country)
   );
   alter table landing_downloads enable row level security;
   create index idx_landing_downloads_occurred on landing_downloads (occurred_at);
   create index idx_landing_downloads_platform on landing_downloads (platform, occurred_at);
   -- Sem policy de INSERT/SELECT: apenas service role escreve (via API route do landing)
   --                                e lê (via admin server component). Anon não toca.
   ```

   Sem PII: não loga IP nem email. UA é útil mas serializa em texto livre — sem fingerprinting.

2. **Nova API route** `apps/landing/app/api/download/[platform]/route.ts`:
   - Recebe `GET /api/download/mac` ou `/win`
   - Insere row em `landing_downloads` via `supabaseAdmin` (service role)
   - Resolve URL do release atual (já está em `lib/release.ts`)
   - Retorna `302` redirect pro Supabase Storage
   - Falha de log NÃO bloqueia download — `try/catch` silencioso, captureException no Sentry
   - Robusto a bot: filtra UAs de bot conhecidos (`bot|crawl|spider|preview` regex) — não loga, mas redirect funciona
   - Cache: `Cache-Control: no-store` (evita CDN servir 302 cached)

3. **Atualizar `Download.tsx`** — troca `href={release.macUrl}` por `href="/api/download/mac"` (idem Windows). Botões de "Outras versões" (GitHub Releases) ficam direto, sem track.

4. **Card no admin** — usa dados de `landing_downloads`:
   - "Downloads" KPI principal (Seção 01, 4º card): `count where occurred_at in period` + delta
   - Breakdown mac/win em row pequena abaixo

**Trade-off conhecido:** redirect adiciona ~50-100ms ao click. Aceitável — usuário não percebe na transição pro download.

**Backward compat:** durante deploy, anchors antigos no cache do browser/Google podem usar URL direto do Supabase. OK — só perdemos os primeiros dias de tracking de quem cacheou a landing. Sem quebra.

### Seção 02 — Produto (Supabase + Analytics Events)

#### Bloco principal (snapshot + crescimento)
- 4 KPIs com delta (Usuários/Igrejas/Músicas/Cultos) — Snapshot
- "Igrejas ativas no período" (14 de 18) — cálculo já existe
- "Profundidade de uso" (músicas/igreja, cultos/igreja) — já existe
- Growth chart 90d — já existe (visual atualizado)
- Atividade diária bar chart — já existe
- Top igrejas — já existe (visual com ícones coloridos)

#### Sub-seção 02·A — Engajamento (analytics_events)

Reutiliza eventos já fluindo:

| Métrica | Query |
|---|---|
| Músicas tocadas | `count(*) where event_type='song_played' and occurred_at in period` |
| Cultos executados | `count(*) where event_type='culto_started' and occurred_at in period` — **novo evento, ver §Desktop** |
| Taxa de conclusão | `count(song_completed) / count(song_played)` no período |
| Tempo de áudio | sum de `metadata->>'duration_seconds'` em `song_completed` — **requer carimbar no event** |

**Gap identificado:** `song_completed` hoje não carrega `duration_seconds` no metadata. Decisão: instrumentar a emissão pra incluir duração ou cair de "tempo de áudio" pra "músicas completadas no período" (sem horas). Vou pelo **incluir duração no metadata** (mudança pequena em `playback.ts`).

#### DAU / WAU / MAU + Stickiness

```sql
-- DAU
select count(distinct user_id) from analytics_events
where event_type='app_opened' and occurred_at > now() - interval '1 day';
-- WAU = 7d, MAU = 30d
```

Stickiness = DAU/MAU. Card já mockado no design.

#### Orgs ativas por semana

Bar chart das últimas 6 semanas; "ativa" = qualquer event com `org_id` na semana. Aggregation server-side.

#### Reprodução por dia (combinação)

Linha de `song_played` por dia + pontos de `culto_started` por dia, sobrepostos. Substitui `DailyActivityChart` que hoje só mostra cadastros (que vão pra outro card abaixo de "atividade diária" snapshot).

Decisão: **renomear** card atual "Novos itens por dia" pra ficar coerente com o design (manter, mas em layout grid junto com o "reprodução por dia").

#### Funil de ativação (4 etapas)

| Etapa | Fonte |
|---|---|
| Cadastro | `auth.users.created_at` |
| 1ª música baixada | min(`songs.created_at`) por `org_id` |
| 1º culto criado | min(`playlists.created_at`) por `org_id` |
| 1º culto executado | min(`occurred_at`) de `culto_started` por `org_id` |

Conta usuários únicos que atingiram cada etapa (drop-off acumulativo). Componente `Funnel` renderiza 4 cards com setas e drop labels.

#### Cultos órfãos

Playlists onde `created_at` existe mas não há `culto_started` correspondente (left join + null). Lista as 4 mais antigas com idade em dias.

#### Retenção por coorte semanal

Coorte = orgs cuja primeira `app_opened` foi naquela semana. Retorna nas semanas seguintes = ao menos 1 event na semana N.

Como `analytics_events` começou em 22 mai 2026, as coortes mais antigas vão ter no máximo 1-2 semanas de dados. Componente `CohortHeatmap` renderiza naturalmente células vazias ("—") para semanas futuras. Aceitar isso — vai preencher com o tempo.

#### Adoção de versão

```sql
select app_version, count(distinct user_id) as users
from analytics_events
where occurred_at > now() - interval '7 days'
group by app_version order by users desc;
```

Componente `VersionAdoption` renderiza barras com cor (latest=verde, antigas=laranja). Latest = MAX(version) por sort semver.

#### Taxa de falha de download

```sql
select event_type, count(*) from analytics_events
where event_type in ('download_succeeded','download_failed')
  and occurred_at in period
group by event_type;
```

Card mostra %, barra dual, totais absolutos.

#### Fila de eventos status

A fila é local em cada cliente — não é visível server-side. **Substituir o card por:**
- "Eventos recebidos / hora" (taxa nas últimas 24h)
- "Clientes ativos hoje" (distinct user_id com event hoje)
- "Pipeline saudável" se taxa > 0 nas últimas 6h

#### Sub-seção 02·B — Estrutura das equipes (schema)

| KPI | Fonte | Gap |
|---|---|---|
| Novos membros | `count(organization_members.joined_at in period)` | ✅ joined_at existe |
| Tamanho médio de equipe | `count(members) / count(orgs)` | ✅ |
| Ministérios criados | `count(groups where ?? in period)` | ⚠️ `groups` não tem `created_at`, só `updated_at` |
| Convites gerados | `count(org_invite_codes where ?? in period)` | ⚠️ `org_invite_codes` não tem `created_at` |
| Convites usados | inferir de `organization_members.joined_at` matching código | ⚠️ sem rastreamento direto |

**Gaps de schema:** decisão = adicionar migration aditiva com `created_at timestamptz default now()` em `groups` e `org_invite_codes`. Aditivo, retro-compat, app antigo continua escrevendo (default cobre). Linhas históricas terão null — métrica "novos no período" filtra `where created_at is not null and created_at in period`. Documenta limitação em comentário no spec do card.

"Convites usados" cai do escopo no PR1 — sem coluna de redemption, inferir é frágil. Card mostra só "convites gerados" com nota.

#### Heatmap (hora × dia)

Já existe `ActivityHeatmap` lendo de songs.created_at + cultos.created_at. Visual atualizado pra match design (gradient mais suave, hover scale).

#### Atividade recente

Já existe. Visual: linhas com dots coloridos por tipo. Tipos suportados: song/culto/user/org.

### Seção 03 — Saúde (Sentry)

Mantém 3 KPIs + chart + top issues. Adiciona:
- Delta nos 3 KPIs
- **Card "Distribuição por nível"** — derivado da lista `issues` já fetchada. Agrupa por `level` (error/warning/info), renderiza `BarList`.

## Mudanças no app desktop

### Migration: adicionar `culto_started` ao CHECK do analytics_events

`supabase/migrations/20260523000001_analytics_culto_started.sql`:

```sql
alter table analytics_events
  drop constraint analytics_events_event_type_check;

alter table analytics_events
  add constraint analytics_events_event_type_check check (event_type in (
    'app_opened', 'song_played', 'song_completed',
    'download_succeeded', 'download_failed',
    'culto_started'
  ));
```

Aditivo: app antigo não emite, app novo emite. RLS já cobre.

### Migration: tabela landing_downloads

Ver §Sub-seção 01·B acima. Resumo: tabela nova, RLS ativa, sem policy de SELECT/INSERT (só service role).

### Migration: created_at em groups e org_invite_codes

`supabase/migrations/20260523000002_groups_invites_created_at.sql`:

```sql
alter table groups
  add column if not exists created_at timestamptz default now();

alter table org_invite_codes
  add column if not exists created_at timestamptz default now();
```

Nullable + default. Inserts existentes do app não listam essas colunas → default aplica. Reads do app não dependem dessas colunas.

### Emissão de `culto_started`

[apps/desktop/src/pages/PlaylistDetail.tsx](../../../apps/desktop/src/pages/PlaylistDetail.tsx:572) tem `playSongs(all.map(...))` no botão "play all" do culto. Instrumentar lá:

```ts
trackEvent('culto_started', { playlistId: playlist.id })
playSongs(all.map((ps) => ps.song))
```

Idem para `playSection` (linha 576) — mas esse é "tocar uma seção", não o culto inteiro. **Decisão: emitir só no botão "play all" do culto** (representa execução do culto). Seção é uso ad-hoc.

### Duração no metadata de `song_completed`

[apps/desktop/src/lib/playback.ts:39](../../../apps/desktop/src/lib/playback.ts) hoje emite só `songId/playlistId`. Adicionar `metadata: { duration_seconds: Math.round(audio.duration ?? 0) }`. Backward-compat: rows antigas sem esse campo, query agrega só onde existe.

## Testes

Stack: vitest + RTL conforme CLAUDE.md. Camadas:

### Unit (lib/)
- `adminPeriod.test.ts` — resolução de período + cálculo do prev period (today, 7d, 30d, custom)
- `adminData.test.ts` — agregações server-side com mock do Supabase client; foco em delta correto, cohort buckets, version semver sort, funnel drop calculation
- `apps/desktop/src/lib/analytics.test.ts` — já existe; adicionar caso `culto_started`

### Component (components/)
- `KpiCard.test.tsx` — render com/sem delta, cores up/down/neutral por direction
- `Funnel.test.tsx` — render etapas + drop labels corretos
- `CohortHeatmap.test.tsx` — células vazias, hover, cores por bucket
- `VersionAdoption.test.tsx` — sort semver, label latest/antiga
- `PeriodBar.test.tsx` — presets viram links corretos, date form posta `?from=&to=`

### E2E
Não há E2E pro admin hoje (E2E é só do desktop). PR não adiciona.

### Cobertura — checklist CLAUDE.md
- Toda mudança em `lib/adminData.ts` tem unit test
- Toda nova component tem render test
- `pnpm test` deve passar isolado **e** na suíte completa antes do commit

## Erros e feedback

Per CLAUDE.md:
- Fetch falha em qualquer fonte → seção mostra empty state amigável ("Dados indisponíveis"). Já é o padrão atual.
- `captureException` em todo catch de fetch (Vercel/Sentry/Supabase queries individuais)
- Console.error antes de show-em-fallback
- Sem toasts (admin é server component, sem interação)

## Migration checklist (CLAUDE.md)

Para as 3 migrations novas (`culto_started`, `groups+invites.created_at`, `landing_downloads`):

- [x] **Aditiva?** Sim — novo CHECK item + novas colunas nullable com default
- [x] **Mirror SQLite?** Não aplicável — `analytics_events` é só remote (insert via supabase client). `groups` e `org_invite_codes` são sincronizadas via `sync.ts` mas as colunas adicionadas não são lidas pelo app desktop ainda (só pelo admin server-side)
- [x] **App em prod continua funcionando?** Sim — app antigo não emite `culto_started`; inserts em `groups`/`org_invite_codes` listam colunas explicitamente sem `created_at` → default cobre
- [x] **`select('*')` quebra?** Não — admin lista colunas explicitamente

## Telemetria, observabilidade

- Sentry init no admin via `instrumentation-client.ts`? Verificar se a landing já tem; se não, fora de escopo.
- Sem novos breadcrumbs (server components)
- Cache: manter `next: { revalidate: 600 }` em fetches externos. Queries Supabase em server component são per-request sem cache (correto pra admin).

## Performance

Queries pesadas potenciais:
- `listAllUsers()` (paginação) — já existe
- `analytics_events` queries no período: índices `idx_analytics_events_type` + `idx_analytics_events_org` cobrem. Para 30d com volume baixo (~5k events estimados), tudo client-aggregable. Se crescer, mover pra RPC.
- Cohort retention requer cross-join semana × org — limitar a 6 semanas máx, ~50 orgs = ~300 cells. Trivial.

Decisão: **manter agregação client-side em TypeScript** (em `adminData.ts`). Quando volume justificar, migrar pra Postgres RPCs.

## Out of scope (futuros PRs)

- Convites usados — falta coluna de redemption em `org_invite_codes`
- Atualização viva do "última atualização há Xs" — exige client hook, fora do PR1
- Sentry init no admin landing — verificar se já existe; se não, separar
- Substituir agregação client-side por RPCs Postgres (otimização prematura hoje)

## Risk register

| Risco | Mitigação |
|---|---|
| Tempo de fetch alto (5+ fontes paralelas) | Promise.all + cache externo 600s nos tokens externos |
| Sentry rate limit em prev-period fetch | Cache + erro silencioso (seção mostra empty) |
| Cohort retention com janela < 6 semanas (dado novo) | Renderiza células `—` naturalmente, sem crash |
| Migration `created_at` cria nulls históricos | Queries filtram `is not null` |
| Visual regression em landing fora de /admin | `app/admin/` é isolado; `globals.css` compartilhado mas só adicionamos classes prefixadas |

## Acceptance criteria

- [ ] `/admin` renderiza idêntico ao mockup HTML (com dados reais, sem dados mock)
- [ ] Todos os KPIs mostram delta vs período anterior (exceto os explicitamente sem delta)
- [ ] Migrations aplicam clean no Supabase local
- [ ] `culto_started` é emitido ao tocar "play all" no culto
- [ ] `pnpm test` passa em `apps/landing/` e `apps/desktop/`
- [ ] `pnpm typecheck` passa no monorepo
- [ ] Admin antigo (`PeriodSelector`) deletado, sem código morto
- [ ] Botões de download em `Download.tsx` usam `/api/download/[platform]` e geram rows em `landing_downloads`
- [ ] Card de waitlist mostra totais por plataforma com delta
- [ ] PR body cita `Closes #<issue>` se houver issue rastreando

## Open questions (resolver no plan, não bloqueante)

- O componente `BrandBar` (logo de audio bars do design) vale extrair pra `components/brand/` no landing ou inline na TopBar?
- Date pickers: nativo `<input type="date">` (simples, sem dep) ou react-day-picker? Provavelmente nativo no PR1.
- Card "fila de eventos" — manter o que propus (taxa/hora + ativos) ou cortar até decidir UX?
