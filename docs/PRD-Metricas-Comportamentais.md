# PRD — Métricas comportamentais (event tracking)

| | |
|---|---|
| **Produto** | Leviticus — dashboard interno de métricas |
| **Escopo** | App desktop (emissão de eventos) + Supabase (tabela de eventos) + `/admin` (novas visualizações) |
| **Status** | Proposto |
| **Autor** | João Sipauba |
| **Última atualização** | 22/05/2026 |
| **Relacionado** | [PRD-Dashboard-Admin.md](PRD-Dashboard-Admin.md), [PRD-Metricas-Landing.pdf](../PRD-Metricas-Landing.pdf) |

---

## 1. Problema

As métricas atuais do produto — músicas baixadas, cultos criados, membros novos —
são todas de **aquisição/criação**. Elas contam coisas sendo *cadastradas*, mas
não respondem se o app está sendo *usado* nem se as igrejas *voltam*.

Hoje é impossível distinguir:

- Uma org com 50 músicas baixadas e **0 tocadas** (em risco) de uma com 10
  baixadas e **200 tocadas** (saudável).
- Um culto **criado e nunca executado** (gap de ativação) de um culto realmente
  conduzido num domingo.
- Uma igreja que usou o app uma vez de uma que volta toda semana.

Para um produto de equipe de louvor — cujo ciclo natural é semanal (culto de
domingo) — **retenção semanal** e **uso real** são os sinais de negócio mais
fortes, e nenhum deles é mensurável com o schema atual.

A causa raiz é arquitetural: o dashboard só lê **contagens agregadas de tabelas
de domínio** (`songs`, `playlists`, `organizations`). Eventos comportamentais
(tocar, executar, abrir o app) não deixam rastro. A própria seção 7.4 do
PRD-Dashboard-Admin já registra isso como limitação conhecida.

---

## 2. Objetivo

Introduzir **event tracking** no app desktop para destravar métricas de
engajamento e retenção, e exibi-las na seção Produto do dashboard `/admin`.

Princípios:

- **Aditivo e retrocompatível** — nova tabela, nada quebra (ver Migrations
  checklist do CLAUDE.md). App antigo continua funcionando, só não emite eventos.
- **Offline-first** — eventos gerados offline (o cenário central do app) **não
  podem ser perdidos**. Fila local em SQLite, flush ao reconectar.
- **Sem PII** — eventos referenciam IDs já existentes (`song_id`, `org_id`,
  `user_id`); nenhum conteúdo de mídia, nenhuma letra, nenhum dado sensível.
- **Best-effort, não-bloqueante** — emitir evento nunca pode atrasar nem
  travar uma ação do usuário (ver "Perceived performance" no CLAUDE.md).

---

## 3. Métricas propostas

### 3.1. Já extraíveis hoje — só falta query no dashboard

Não exigem mudança no app. Basta uma query nova na seção Produto.

| Métrica | Definição | Fonte | Tipo |
|---|---|---|---|
| Novos membros por org | `organization_members.joined_at` na janela | Supabase | Fluxo |
| Tamanho médio de equipe | `count(organization_members) / count(organizations)` | Supabase | Snapshot |
| Ministérios criados | `count(groups)` total e delta | Supabase | Snapshot + Fluxo |
| Códigos de convite gerados | `org_invite_codes.created_at` na janela | Supabase | Fluxo |
| Funil parcial de ativação | cadastro → 1ª música baixada → 1º culto criado, via timestamps das tabelas | Supabase | Funil |

> O funil **completo** (incluindo "1º culto executado") depende de eventos —
> ver 3.2.

### 3.2. Exigem event tracking (tabela `analytics_events`)

São o coração deste PRD. Cada uma depende de um ou mais tipos de evento
emitidos pelo app (coluna "Evento").

| Métrica | Definição | Evento | Tipo |
|---|---|---|---|
| **Músicas tocadas** | Total de reproduções iniciadas | `song_played` | Fluxo |
| **Taxa de conclusão** | `song_completed / song_played` — proxy de qualidade do acervo | `song_played`, `song_completed` | Snapshot (%) |
| **Tempo de áudio reproduzido** | Soma de segundos efetivamente tocados | `song_completed.metadata.played_seconds` | Fluxo |
| **Cultos executados** | Cultos com ao menos uma música tocada com `occurred_at` **dentro da janela `scheduled_at`–`scheduled_end`** (janela exata) — cobre modo playlist e músicas avulsas | `song_played` (derivado) | Fluxo |
| **Cultos criados mas nunca executados** | `playlists` sem nenhum `song_played` de uma música sua dentro da janela — gap de ativação | `song_played` + `playlists` | Snapshot |
| **DAU / WAU / MAU** | Usuários distintos ativos por dia/semana/mês | `app_opened` | Fluxo |
| **Orgs ativas por semana** | Orgs distintas com qualquer evento na semana — métrica-norte | qualquer evento | Fluxo |
| **Stickiness** | DAU ÷ MAU | `app_opened` | Snapshot (%) |
| **Retenção semanal de orgs** | % de orgs ativas na semana N que voltam na semana N+1 (cohort) | qualquer evento | Trajetória |
| **Funil de ativação completo** | cadastro → 1ª música → 1º culto criado → **1º culto executado** | tabelas + `song_played` | Funil |
| **Taxa de falha de download** | `download_failed / (download_failed + download_succeeded)` | `download_succeeded`, `download_failed` | Snapshot (%) |
| **Adoção de versão** | % de instalações na versão mais recente | `app_opened.app_version` | Snapshot |

### 3.3. Fora de escopo (futuro)

- Mapa de calor de uso por hora×dia derivado de eventos (o dashboard já tem um
  baseado em `created_at` de domínio; migrar pra eventos é refinamento posterior).
- Eventos de navegação fina (abriu modal X, clicou no botão Y).
- Funil da landing (`visita → clique baixar`) — já está no backlog do outro PRD,
  é Vercel Analytics, não toca este sistema.

---

## 4. Arquitetura

```
┌─────────────────┐   trackEvent()    ┌──────────────────┐
│  App desktop    │ ────────────────▶ │ analytics_queue  │  (SQLite local)
│  (emit points)  │                   │  fila durável    │
└─────────────────┘                   └────────┬─────────┘
                                                │ flush (boot / reconexão / 1min)
                                                ▼
                                       ┌──────────────────┐
                                       │ analytics_events │  (Supabase, INSERT-only)
                                       └────────┬─────────┘
                                                │ service role (server-side)
                                                ▼
                                       ┌──────────────────┐
                                       │  /admin Produto  │  novas queries + gráficos
                                       └──────────────────┘
```

Decisão central: **fila local durável**, não fire-and-forget. O app é
offline-first; reproduções acontecem offline o tempo todo. Descartar eventos
offline subcontaria "músicas tocadas" justamente no cenário para o qual o app
foi feito. A fila vive em SQLite (mesmo banco do cache local) e é drenada
quando há rede.

Inserção **direta** em `analytics_events` via cliente Supabase (com RLS de
INSERT), sem Edge Function — o volume é baixíssimo e não justifica infra nova,
coerente com a decisão "queries agregadas, sem tabela de eventos própria pra
ClickHouse" do PRD do dashboard.

---

## 5. Mudanças no código

### 5.1. Supabase — nova migration

**`supabase/migrations/20260522000001_analytics_events.sql`**

```sql
CREATE TABLE analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id)    ON DELETE SET NULL,
  event_type  text NOT NULL CHECK (event_type IN (
    'app_opened', 'song_played', 'song_completed',
    'download_succeeded', 'download_failed'
  )),
  song_id     uuid,            -- sem FK: música pode ser deletada depois
  playlist_id uuid,            -- idem
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text,
  platform    text,            -- 'macos' | 'windows'
  occurred_at timestamptz NOT NULL,  -- capturado no cliente (vale offline)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_occurred  ON analytics_events (occurred_at);
CREATE INDEX idx_analytics_events_org       ON analytics_events (org_id, occurred_at);
CREATE INDEX idx_analytics_events_type      ON analytics_events (event_type, occurred_at);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Membro autenticado só insere evento dele, numa org da qual participa.
CREATE POLICY analytics_insert_own ON analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    ))
  );

-- Nenhum SELECT pra authenticated/anon: leitura só via service role (/admin).
```

Notas de conformidade com o **Migrations checklist** do CLAUDE.md:
- Tabela nova → aditivo, livre. Sem `NOT NULL` sem default em coluna de tabela
  pré-existente.
- `song_id`/`playlist_id` **sem FK** de propósito: o evento é um registro
  histórico imutável e deve sobreviver à deleção da música/culto. Trade-off
  consciente.
- **Não precisa de migration espelho em SQLite** — `analytics_events` não é
  sincronizada pro local. O que vai pro SQLite é a *fila* (5.3), que é tabela
  puramente local.

### 5.2. Desktop — `src/lib/analytics.ts` (novo)

API pública única:

```ts
export type AnalyticsEventType =
  | 'app_opened' | 'song_played' | 'song_completed'
  | 'download_succeeded' | 'download_failed'

// Não-bloqueante: grava na fila SQLite e retorna. Nunca lança.
export function trackEvent(
  type: AnalyticsEventType,
  payload?: { songId?: string; playlistId?: string; metadata?: Record<string, unknown> }
): void

// Drena a fila pro Supabase em lote. Chamado no boot, ao reconectar e a cada 1min.
export async function flushAnalyticsQueue(): Promise<void>
```

Comportamento:
- `trackEvent` resolve `org_id`/`user_id`/`app_version`/`platform`, carimba
  `occurred_at` com o relógio do cliente **no momento do evento** (preserva
  timestamp correto de eventos offline) e faz INSERT na fila local. Síncrono do
  ponto de vista da UI, sem `await` no caller.
- `flushAnalyticsQueue` lê lotes da fila, faz `supabase.from('analytics_events').insert(...)`,
  e **só apaga da fila após sucesso**. Falha (offline, RLS) → mantém na fila,
  re-tenta depois. Erros vão pro `captureException` com `feature: 'analytics'`.
- Cap de retenção da fila (ex.: 10.000 linhas) pra fila não crescer sem limite
  num device cronicamente offline — descarta as mais antigas ao exceder.

### 5.3. Desktop — migration SQLite local

**`apps/desktop/src-tauri/migrations/007_analytics_queue.sql`**

```sql
CREATE TABLE analytics_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL,   -- JSON serializado da linha de analytics_events
  occurred_at TEXT NOT NULL    -- ISO 8601
);
```

Tabela puramente local, sem contrapartida no Supabase. Não entra no `syncOrg()`.

### 5.4. Desktop — pontos de emissão

| Evento | Onde | Quando |
|---|---|---|
| `app_opened` | [App.tsx](../apps/desktop/src/App.tsx) — boot sequence, após resolver sessão | 1× por abertura do app |
| `song_played` | [PlayerMini.tsx](../apps/desktop/src/components/PlayerMini.tsx) | toda reprodução iniciada; carrega `playlist_id` quando em contexto de culto |
| `song_completed` | [PlayerMini.tsx](../apps/desktop/src/components/PlayerMini.tsx) `handleSongEnd()` | música chega ao fim; `metadata.played_seconds` |
| `download_succeeded` / `download_failed` | fluxo do AddSongModal / DownloadButton | fim do download |

**Cultos executados não tem evento dedicado.** Worship teams nem sempre usam o
modo playlist — às vezes tocam músicas avulsas do culto. Por isso "culto
executado" é uma métrica **derivada no dashboard**: um culto conta como
executado quando existe um `song_played` de uma música que pertence a ele
(via `playlist_songs`) com `occurred_at` dentro da janela exata
`scheduled_at`–`scheduled_end`. O app só precisa emitir `song_played` com
`song_id` e `occurred_at` — a derivação é uma query server-side, cobrindo os
dois modos de uso sem instrumentação extra.

### 5.5. Desktop — disparo do flush

- **Boot**: `flushAnalyticsQueue()` na boot sequence do App.tsx, em paralelo ao
  resto (não segura o splash).
- **Reconexão**: assinar o `useNetworkStore`/`startNetworkMonitor` de
  [lib/network.ts](../apps/desktop/src/lib/network.ts) — ao voltar `online`,
  drenar a fila.
- **Periódico**: `setInterval` de 1 min enquanto o app está aberto.

### 5.6. Dashboard `/admin` — seção Produto

Em `apps/landing`, na seção Produto (Server Component, service role key):

- **Novos KPIs/cards**: Músicas tocadas, Cultos executados, DAU/WAU/MAU,
  Taxa de conclusão.
- **Novos gráficos** (Recharts, já no projeto):
  - Linha — músicas tocadas e cultos executados por dia.
  - Funil de ativação completo (4 etapas).
  - Heatmap de retenção por coorte semanal de orgs.
  - Lista com barras — adoção de versão.
- As métricas de 3.1 (membros por org, tamanho de equipe, ministérios) entram
  como cards/listas adicionais sem depender de eventos.

Atualizar também o **Apêndice de referência** do PRD-Dashboard-Admin com as
métricas novas.

---

## 6. Privacidade e segurança

- Eventos só carregam **IDs de entidades já existentes** e metadados numéricos
  (`played_seconds`, `app_version`). Nenhuma letra, título digitado, busca, ou
  conteúdo. Coerente com a regra de não passar dado sensível ao Sentry.
- RLS de INSERT amarra `user_id = auth.uid()` e org a que o usuário pertence —
  um cliente não consegue forjar eventos de terceiros.
- Sem SELECT pra `authenticated`/`anon`: a tabela é invisível ao app. Só o
  `/admin` lê, server-side, via service role (mesmo padrão das outras métricas
  de Produto).
- Fora do `get_platform_stats()` público da landing — métricas comportamentais
  são internas, não viram prova social.

---

## 7. Faseamento

| Fase | Entrega | Destrava |
|---|---|---|
| **1** | Migration `analytics_events` + RLS | infraestrutura |
| **2** | `analytics.ts` + fila SQLite + flush | pipeline de coleta |
| **3** | Emissão de `app_opened`, `song_played`, `song_completed` | músicas tocadas, cultos executados, DAU/WAU/MAU, retenção |
| **4** | Emissão de `download_succeeded/failed` | taxa de falha de download |
| **5** | Queries + gráficos no `/admin` | visualização |
| **6** | Métricas de 3.1 (sem eventos) no `/admin` | quick win, pode ir junto da Fase 1 |

Fases 1–2 e 6 são independentes e podem ser paralelizadas. As métricas só
aparecem com dado real **depois** que a Fase 3 estiver em produção e o
auto-update propagar — eventos são prospectivos, não retroativos.

> **Importante:** nenhuma métrica de 3.2 terá histórico antes do app instrumentado
> chegar aos usuários. O dashboard deve deixar isso explícito (ex.: "coletando
> desde dd/mm") para não parecer bug.

---

## 8. Cobertura de testes (definição de pronto)

Conforme a Testing strategy do CLAUDE.md:

- **Unit** — `analytics.test.ts`: `trackEvent` enfileira corretamente; `flush`
  envia em lote, apaga só em sucesso, mantém em falha, respeita o cap da fila.
  `occurred_at` preserva o instante do evento.
- **Component** — emissão nos pontos certos: `play()` dispara `song_played`;
  `handleSongEnd` dispara `song_completed`.
- **E2E** — fora de escopo automatizado (eventos vão pro Supabase real);
  validar manualmente que a fila drena ao reconectar.

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Evento atrasa ação do usuário | `trackEvent` é síncrono-local e não-bloqueante; flush é async em background |
| Perda de eventos offline | Fila durável em SQLite, flush ao reconectar |
| Relógio do cliente errado distorce séries | `occurred_at` (cliente) + `created_at` (servidor); dashboard usa `occurred_at` mas dá pra auditar divergência |
| Fila cresce sem limite em device offline | Cap de linhas, descarte FIFO das mais antigas |
| Dashboard parece quebrado sem histórico | Rótulo "coletando desde dd/mm" nas métricas novas |
