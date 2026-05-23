# PRD — Dashboard Administrativo Leviticus

| | |
|---|---|
| **Produto** | Leviticus — dashboard interno de métricas |
| **Rota** | `/admin` (em `apps/landing`, domínio `www.leviticus.app.br`) |
| **Status** | Implementado e em produção |
| **Autor** | João Sipauba |
| **Última atualização** | 21/05/2026 |

---

## 1. Visão geral

Dashboard administrativo **privado** que consolida, num só lugar, as métricas
de saúde e crescimento do Leviticus. Reúne três fontes de dados independentes
— tráfego da landing page, uso real do app e estabilidade em produção — para
responder, sem precisar abrir três painéis diferentes, três perguntas:

1. **Estamos atraindo e convertendo visitantes?** (Landing)
2. **As igrejas estão usando de verdade e voltando?** (Produto)
3. **O app está estável em produção?** (Saúde)

O dashboard é uma ferramenta interna de uma pessoa só (o mantenedor), não um
produto voltado ao usuário final.

---

## 2. Contexto e motivação

Antes deste dashboard, acompanhar o projeto exigia:

- Abrir o painel da Vercel para ver tráfego da landing;
- Rodar queries manuais no Supabase para contar usuários, igrejas, músicas;
- Abrir o Sentry para checar erros.

Não havia visão de **série temporal** (crescimento ao longo do tempo),
**padrão de uso** (horários/dias de pico) nem **cruzamento** entre as fontes.
O dashboard elimina esse trabalho manual e dá uma leitura única e periódica.

---

## 3. Requisitos do solicitante

Especificações dadas pelo solicitante ao longo da concepção:

| # | Requisito | Decisão |
|---|---|---|
| R1 | Dashboard com métricas detalhadas do projeto | Implementado |
| R2 | Ver dias e horários de maior uso | Heatmap hora × dia da semana |
| R3 | Seletor de período com presets **e** intervalo específico | Hoje / 7d / 30d / 90d + range custom |
| R4 | Dividir o dashboard em seções por fonte | Seções Landing, Produto e Saúde |
| R5 | Incluir métricas do Sentry | Seção Saúde |
| R6 | Sentry deve mostrar **somente produção** | Filtro fixo `environment=production` |
| R7 | Dashboard **privado** — só o mantenedor acessa | Login por senha + middleware |
| R8 | Layout das seções **empilhado** (rolar pra baixo), não em abas | Seções verticais numa página única |
| R9 | Usar gráficos que a indústria padrão usa | Recharts: área, barras, linha, heatmap |

### 3.1. Não-objetivos (fora de escopo)

- Multiusuário, papéis ou permissões granulares — é ferramenta de um operador só.
- Edição de dados — o dashboard é estritamente leitura.
- Alertas/notificações automáticas (e-mail, push) sobre métricas.
- Exportação de relatórios (CSV/PDF) — pode entrar no backlog.
- App mobile do dashboard.

---

## 4. Arquitetura e stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Hospedagem | Rota `/admin` dentro de `apps/landing` (Next.js 15, Vercel) | Zero infra nova; já tem deploy e conexão com Supabase |
| Renderização | Server Components (dados) + Client Components (gráficos) | Tokens secretos nunca chegam ao browser |
| Gráficos | **Recharts** | Padrão de mercado em React; área/barra/linha |
| Heatmap | Grade CSS custom | Nenhuma lib traz heatmap hora×dia pronto |
| Dados do produto | Supabase via **service role key** (server-side) | Bypassa RLS para agregar; key nunca exposta |
| Dados da landing | API interna do Vercel Web Analytics | Já temos tráfego coletado pela Vercel |
| Dados de saúde | API do Sentry (org `leviticus-p6`) | Erros já capturados pelo SDK |
| Autenticação | Middleware Next.js + cookie de sessão HMAC | Simples, sem banco de sessão |
| Atualização | `revalidate = 0` na página; cache de 10 min nos fetches externos | Sempre fresco, sem martelar APIs externas |

### 4.1. Variáveis de ambiente (server-side, nunca `NEXT_PUBLIC_`)

| Variável | Uso |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Leitura agregada do banco do produto |
| `ADMIN_PASSWORD` | Senha de acesso + segredo de assinatura do token de sessão |
| `VERCEL_ANALYTICS_TOKEN` | Token da API de Web Analytics |
| `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` | Identificam o projeto da landing |
| `SENTRY_API_TOKEN` | Token de leitura da API do Sentry |
| `SENTRY_ORG` | Slug da organização no Sentry |

---

## 5. Seletor de período (R3)

Controle global no topo do dashboard. Define a janela `[from, to]` aplicada
às métricas de fluxo.

**Presets:** `Hoje` · `7 dias` · `30 dias` · `90 dias`
**Custom:** dois seletores de data (início/fim) para qualquer intervalo.

O período é carregado via *search param* na URL (`?period=7d` ou
`?from=…&to=…`) — recarrega no servidor e gera URLs compartilháveis.

### 5.1. Snapshot vs. Fluxo

Distinção central do dashboard, sinalizada visualmente:

- **Snapshot** — foto do *agora*. Não muda com o período (ex.: "total de
  igrejas"). Exibido com o rótulo *total*.
- **Fluxo** — contável dentro da janela (ex.: "novos cadastros"). Responde ao
  seletor. Exibido com o rótulo *no período*.

Métricas **independentes do período** por natureza de "trajetória"/"padrão":
crescimento acumulado (sempre 90 d) e heatmap de uso (sempre histórico
completo).

---

## 6. Seção 1 — Landing

**Pergunta:** estamos atraindo e convertendo visitantes?
**Fonte:** Vercel Web Analytics.

### 6.1. KPIs

| Métrica | Definição | Tipo | Visualização |
|---|---|---|---|
| Visitantes únicos | Dispositivos distintos no período | Fluxo | Card |
| Pageviews | Total de visualizações de página | Fluxo | Card |
| Taxa de rejeição | % de sessões de página única — média **ponderada por visitantes** no período | Fluxo | Card |

> A taxa de rejeição é ponderada por visitantes (não média simples dos dias),
> senão dias sem tráfego distorceriam o número.

### 6.2. Gráficos

| Visualização | Conteúdo |
|---|---|
| Linha | Pageviews e visitantes por dia |
| Lista com barras | Origem do tráfego (direto, Google, redes…) |
| Lista com barras | Países dos visitantes |

### 6.3. Disponível na fonte, ainda não usado

- **Eventos customizados** (cliques em "Baixar") — permitiria fechar o funil
  `visita → clique em baixar → download`.
- Quebra por navegador / SO / cidade — a API interna retorna `BAD_REQUEST`
  para esses agrupamentos hoje.

---

## 7. Seção 2 — Produto

**Pergunta:** as igrejas estão usando de verdade e voltando?
**Fonte:** Supabase (tabelas `auth.users`, `organizations`, `songs`,
`playlists`, `organization_members`).

### 7.1. KPIs

| Métrica | Definição | Tipo |
|---|---|---|
| Usuários | Total de contas registradas | Snapshot + delta no período |
| Igrejas | Total de organizações | Snapshot + delta no período |
| Músicas | Total de músicas no acervo | Snapshot + delta no período |
| Cultos | Total de playlists/cultos montados | Snapshot + delta no período |

### 7.2. Faixa de insights

- **Igrejas ativas no período** — orgs com música ou culto criado/atualizado
  dentro da janela.
- **Profundidade de uso** — média de músicas por igreja e cultos por igreja.

### 7.3. Gráficos

| Visualização | Conteúdo | Período |
|---|---|---|
| Área | Crescimento acumulado de usuários, músicas e cultos | Fixo 90 d |
| Barras | Novos itens por dia, por tipo | No período |
| Heatmap | Atividade por hora × dia da semana (BRT) — **R2** | Histórico completo |
| Lista com barras | Top igrejas por tamanho de acervo | Histórico |
| Tabela | Atividade recente (criações) | No período |

### 7.4. Disponível na fonte, ainda não usado

- **Retenção por coorte** (cohort heatmap) — % de igrejas que voltam semana
  após semana. Faz sentido quando houver mais volume.
- **DAU/WAU/MAU e stickiness** — exige um conceito mais fino de "sessão"; hoje
  "igrejas ativas" é o proxy de atividade.
- **Funil de ativação** — cadastro → primeira música → primeiro culto.
- Eventos de produto (música tocada, tempo de uso) — exigiria *event
  tracking* no app desktop (tabela `analytics_events` própria).

---

## 8. Seção 3 — Saúde

**Pergunta:** o app está estável em produção?
**Fonte:** Sentry, organização `leviticus-p6`. **Filtro fixo
`environment=production`** — ambiente `devlocal` é sempre ignorado (R6).

### 8.1. KPIs

| Métrica | Definição | Tipo |
|---|---|---|
| Erros no período | Eventos de erro capturados na janela | Fluxo |
| Issues não resolvidas | Issues abertas (`is:unresolved`) | Snapshot |
| Usuários afetados | Soma de usuários impactados pelas issues | Fluxo |

### 8.2. Gráficos

| Visualização | Conteúdo |
|---|---|
| Área | Erros por dia no período — estado verde explícito quando zero |
| Tabela | Top issues por frequência, com nível e link direto pro Sentry |

### 8.3. Disponível na fonte, ainda não usado

- **Crash-free rate / release health** — exige *session tracking* configurado
  no SDK.
- **Erros por release e por plataforma** (macOS vs. Windows) — permitiria
  apontar qual versão regrediu.
- Performance / Web Vitals do SDK.

---

## 9. Segurança e acesso (R7)

- Rota `/admin` protegida por **middleware** — sem sessão válida, redireciona
  para `/admin/login`.
- Login valida a senha (`ADMIN_PASSWORD`) e emite um **token de sessão HMAC
  assinado**: `${emitidoEm}.${HMAC(senha, emitidoEm)}`.
  - A senha **nunca** vai para o cookie nem para o client.
  - Token expira em 7 dias.
  - Trocar `ADMIN_PASSWORD` invalida todas as sessões (rotação/revogação).
- Cookie `httpOnly`, `secure` (produção), `sameSite=lax`.
- Middleware usa **allowlist explícita** de rotas públicas — endpoints novos
  sob `/admin` nascem protegidos por padrão.
- Rota fora do `robots.txt` e do `sitemap.xml`; `metadata.robots = noindex`.
- Todo acesso a dados sensíveis é **server-side** — service role key e tokens
  nunca são enviados ao browser.

---

## 10. Decisões de design

| Decisão | Racional |
|---|---|
| Seções empilhadas, não abas (R8) | Leitura corrida; comparar as 3 fontes numa rolada |
| Snapshot vs. fluxo sinalizados | Evita interpretar "total" como se respondesse ao período |
| Crescimento sempre 90 d | É trajetória — "hoje" como janela não faz sentido aqui |
| Heatmap sempre histórico completo | Padrão de uso precisa de todo o dado para ter sinal |
| Recharts em vez de shadcn/Tremor | A landing não usa Tailwind; Recharts integra direto |
| Dados via queries agregadas, sem tabela de eventos | Volume atual não justifica ClickHouse/Tinybird |
| Reaproveita design system da landing | Consistência visual; tema escuro já pronto |

---

## 11. Backlog / evolução futura

Priorizado por valor:

1. **Funil de conversão da landing** — rastrear clique em "Baixar agora" via
   evento customizado do Vercel Analytics; fecha `visita → download → cadastro`.
2. **Retenção por coorte** — cohort heatmap na seção Produto quando houver
   volume de igrejas suficiente.
3. **Erros por release/plataforma** na seção Saúde.
4. **Exportação** de um snapshot do período (CSV/PDF).
5. **Event tracking no app** (`analytics_events`) — destrava métricas
   comportamentais: músicas tocadas, tempo de sessão, features mais usadas.
6. Resolver issue **#124** — `release-bump` não deve buildar o desktop em
   mudanças que são só da landing.

---

## 12. Apêndice — referência rápida de métricas

| Métrica | Seção | Fonte | Tipo |
|---|---|---|---|
| Visitantes únicos | Landing | Vercel | Fluxo |
| Pageviews | Landing | Vercel | Fluxo |
| Taxa de rejeição | Landing | Vercel | Fluxo |
| Origem do tráfego | Landing | Vercel | Fluxo |
| Países | Landing | Vercel | Fluxo |
| Usuários (total) | Produto | Supabase | Snapshot |
| Igrejas (total) | Produto | Supabase | Snapshot |
| Músicas (total) | Produto | Supabase | Snapshot |
| Cultos (total) | Produto | Supabase | Snapshot |
| Novos usuários/igrejas/músicas/cultos | Produto | Supabase | Fluxo |
| Igrejas ativas | Produto | Supabase | Fluxo |
| Profundidade de uso (médias) | Produto | Supabase | Snapshot |
| Crescimento acumulado | Produto | Supabase | Trajetória (90 d) |
| Atividade diária | Produto | Supabase | Fluxo |
| Heatmap hora × dia | Produto | Supabase | Padrão (histórico) |
| Top igrejas | Produto | Supabase | Snapshot |
| Atividade recente | Produto | Supabase | Fluxo |
| Erros no período | Saúde | Sentry | Fluxo |
| Issues não resolvidas | Saúde | Sentry | Snapshot |
| Usuários afetados | Saúde | Sentry | Fluxo |
| Erros por dia | Saúde | Sentry | Fluxo |
| Top issues | Saúde | Sentry | Snapshot |
