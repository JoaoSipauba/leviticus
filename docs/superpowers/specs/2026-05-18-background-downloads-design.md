# Downloads em background + redesign do fluxo de adicionar música

**Data:** 2026-05-18
**Status:** Spec aprovada — pendente plano de implementação

## Contexto

Hoje o usuário fica preso na step 3 do `AddSongModal` enquanto o download do YouTube acontece. Não é possível enfileirar várias músicas, e quando algo falha o feedback é só um toast efêmero — sem ação de retry visível depois. Adicionalmente, montar um culto exige ping-pong: sair do culto → biblioteca → adicionar → esperar → voltar → adicionar ao culto.

Esta spec ataca dois eixos relacionados:

1. **Downloads viram background reais com fila.** Confirmar uma adição não bloqueia mais; o usuário acompanha pelo card e por um dock no rodapé.
2. **Adicionar música nova direto do culto.** Sem sair da tela.

A arquitetura aproveita o que já existe (`useDownloadsStore`, `DownloadBadge`, `AddSongModal`, `AddSongToPlaylistModal`) e adiciona dois componentes novos focados em comunicar estado.

### Referências da indústria consultadas

- **Spotify / YouTube Music**: per-item + dock agregado (modelo escolhido)
- **Apple Music**: per-item only — descartado por falta de visão global
- **Steam / Epic**: painel global — descartado por desconectar do contexto
- **Chrome downloads**: dock fixo no rodapé — inspiração direta pro `DownloadDock`

## Decisões de design

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| Q1 | Local do indicador de progresso | **Híbrido** — per-item nos cards + dock agregado no rodapé | Padrão validado por Spotify/YouTube Music; aproveita store existente; usuário vê estado onde clicou + visão geral |
| Q2 | Comportamento do `AddSongModal` ao confirmar | **Fecha imediatamente + toast** | Mínima fricção; padrão Slack uploads; dock cobre o feedback contínuo |
| Q3 | Tratamento de erro | **Card mostra erro + dock agrega + auto-retry transitório** | Erro visível mesmo se usuário sair da página; retry silencioso pra falhas de rede |
| Q4 | Adicionar música nova direto do culto | **Modal único com tabs** ("Da biblioteca" / "Nova música") | Um caminho mental; contexto da seção preservado entre tabs; reaproveita ambos os modais |
| Q5 | Redesign dos cards | **Linha de status inline** (`SongStatusRow`) | Mensagem clara ("Baixando 45%" vs só ícone); CTA inline em caso de erro; funciona em grid e em linhas compactas |

## Arquitetura

### Diagrama de fluxo

```
[Usuário confirma adição em AddSongModal]
         ↓
  1. INSERT em songs (Supabase)
  2. (opcional) RPC add_song_to_playlist se origem = culto
  3. useDownloadsStore.enqueue(songId, source)
  4. toastSuccess("Adicionada · baixando em background")
  5. Modal fecha
         ↓
[Card aparece na biblioteca/culto com SongStatusRow: "Na fila"]
         ↓
[useDownloadsStore.processNext() inicia o próximo da fila]
         ↓
  SongStatusRow: "Baixando 45% ▬▬░░"
  DownloadDock: "↓ 1 baixando · 0 na fila"
         ↓
   ┌─────────────────┬─────────────────┐
   ↓                 ↓                 ↓
[Sucesso]      [Erro transitório]  [Erro permanente]
✓ pop animado   auto-retry 2x        SongStatusRow: "Falhou — tentar"
SongStatusRow   "Tentando (2/3)"     Dock: "1 falhou" (badge vermelho)
some            ↓                    Toast: "Falha em X" (4s)
                Se esgotar → erro
                permanente
```

### Componentes

#### Novos

**`DownloadDock`** — `src/components/DownloadDock.tsx`
- Barra fixa no rodapé, acima do `PlayerMini`, abaixo de tudo mais. Z-index alinhado com toasts.
- **Visibilidade**: aparece quando `byId` não é vazio OU há falhas pendentes. Some quando tudo limpo.
- **Estado colapsado** (default): `↓ {N} baixando · {M} na fila · {K} falhou` + chevron.
- **Estado expandido**: lista vertical de items com thumb, título, status individual, botões cancel/retry. Max-height com scroll.
- **Acessibilidade**: `role="status"` no contador, `aria-live="polite"` pras mudanças, `aria-expanded` no chevron.
- **Selector**: usa `useDownloadsStore` (deriva contagens de `byId`).

**`SongStatusRow`** — `src/components/SongStatusRow.tsx`
- Faixa inline renderizada condicionalmente quando estado != idle/completed.
- **States visuais**:
  - `queued` → background amarelo sutil + texto "Na fila"
  - `downloading` → background azul + texto "Baixando {pct}%" + barra de progresso fininha (2px)
  - `retrying` → background amarelo + texto "Tentando de novo ({n}/{max})"
  - `error` → background vermelho + texto da mensagem + botão "Tentar de novo" (acessibilidade: button real, não span)
- **Modo compacto** (prop `compact`): substitui o subtítulo (artista/duração) ao invés de empilhar — usado dentro do PlaylistDetail.

#### Modificados

**`useDownloadsStore`** — `src/store/downloads.ts`
- Estender `DownloadState`: adicionar `'retrying'` ao tipo, manter `'error'` como terminal.
- Adicionar campo `retryCount: number` no entry.
- Classificar erro ao falhar:
  - **Transitório** (mensagens incluem: `network`, `timeout`, `fetch`, `ECONN`, `ENETDOWN`, código de saída por sinal): permite retry automático
  - **Permanente** (`vídeo indisponível`, `unavailable`, `404`, `forbidden`, `unsupported format`): vai direto pra `error`
- Auto-retry: se transitório E `retryCount < 2`, agendar `processNext` após backoff (2s, depois 8s); incrementa `retryCount`; estado vira `retrying` durante o backoff.
- Mantém: `onCompleted`, `onCanceled` subscribers; `cancel()` apaga arquivo.
- **Novo selector**: `selectAggregate()` retorna `{ downloading: number; queued: number; failed: number; entries: SongDownloadStatus[] }` pro `DownloadDock` consumir sem assinar `byId` inteiro.
- **Persistência**: store atual é in-memory; manter assim (não persistir fila entre sessions na primeira versão — adicionar issue se necessário depois).

**`DownloadBadge`** — `src/components/DownloadBadge.tsx`
- Adicionar estado `'retrying'` visual (ícone retry com pulso).
- Refinar estado `'error'` (já existe internamente mas não está nas props): cor vermelha, ícone `!`, click = retry.

**`AddSongModal`** — `src/components/AddSongModal.tsx`
- **Remover step 3 (loading bloqueante)**. O fluxo passa de:
  ```
  step 1 (busca) → step 2 (metadados) → step 3 (download bloqueia) → step 4 (sucesso)
  ```
  para:
  ```
  step 1 (busca) → step 2 (metadados) → confirm → fecha
  ```
- `handleConfirm` ao final:
  1. INSERT song no Supabase com `download_status: 'pending'`
  2. INSERT song_groups (se aplicável)
  3. (opcional) RPC `add_song_to_playlist` se contexto = culto
  4. `enqueueDownload(songId, source)` com source = `{ kind: 'youtube', url }` ou `{ kind: 'upload', filePath }`
  5. `toastSuccess('Adicionada — baixando em background')`
  6. `syncOrg(orgId)` em background (não aguardar)
  7. `onClose()`
- Remover refs a `setDownloading()` do `usePlayerStore` (substituído pelo dock).
- Em caso de upload (não YouTube), enqueue com source `{ kind: 'upload', filePath, originalFormat }`.

**`AddSongToPlaylistModal`** — `src/components/AddSongToPlaylistModal.tsx`
- Adicionar tabs no topo: **"Da biblioteca"** (default) e **"Nova música"**.
- Tab "Da biblioteca": comportamento atual intacto.
- Tab "Nova música": renderiza o conteúdo do `AddSongModal` numa versão embedded. Passa contexto `{ playlistId, sectionId, groupId, sectionLabel }` pra que o confirm encadeie:
  - Insert song → RPC `add_song_to_playlist` → enqueue download → toast → fecha modal
- Refator: extrair conteúdo do `AddSongModal` em um componente puro `AddSongFlow` (steps 1-2) que aceita `onComplete(songData)` pra que o `AddSongToPlaylistModal` consiga reaproveitá-lo sem renderizar o modal wrapper.

**`SongCard`** — `src/components/SongCard.tsx`
- Adicionar `<SongStatusRow songId={song.id} />` abaixo do bloco de metadados (ou no slot apropriado conforme variant).
- **Remover lógica local de `drivePct`**: hoje a Drive usa state local; passar a usar o mesmo store de downloads (estende para aceitar `source.kind === 'drive'`).
- Manter a animação `justCompleted` (pop verde 800ms) — coexiste com `SongStatusRow` que some no mesmo instante.

**`PlaylistDetail`** — `src/pages/PlaylistDetail.tsx`
- Nas linhas de música da seção, inserir `<SongStatusRow songId={ps.song.id} compact />` (modo compacto: substitui o artista/duração quando status ativo).
- Quando adicionar via tab "Nova música" do modal, garantir que a UI já mostra a entrada com status "Na fila" imediatamente após o modal fechar (otimismo via syncOrg + push direto no estado local da página).

**`Layout`** — `src/components/Layout.tsx`
- Montar `<DownloadDock />` global, logo acima do `<PlayerMini />`.
- Cuidar do espaçamento: quando o dock está visível, empurra o conteúdo (ou usa floating overlay com sombra superior — escolha: **floating overlay** com `position: fixed; bottom: {playerHeight}px`).

### Estrutura de dados

#### Store: `DownloadEntry` estendido

```ts
type DownloadSource =
  | { kind: 'youtube'; url: string }
  | { kind: 'upload'; filePath: string; originalFormat: string }
  | { kind: 'drive'; cloudFileId: string }

type DownloadEntry = {
  songId: string
  state: 'queued' | 'downloading' | 'retrying' | 'error'
  source: DownloadSource
  progress: number          // 0..1
  retryCount: number        // 0, 1, 2
  errorMessage?: string     // só quando state === 'error'
  errorKind?: 'transient' | 'permanent'
  startedAt?: number        // timestamp do início da tentativa atual
}
```

#### Aggregate selector

```ts
type DownloadAggregate = {
  downloading: number       // count em 'downloading' | 'retrying'
  queued: number            // count em 'queued'
  failed: number            // count em 'error'
  totalProgress: number     // média ponderada pro dock collapsed
  entries: DownloadEntry[]  // pra modo expandido
}
```

### Classificação de erro

Em `useDownloadsStore`, ao receber rejection da promise:

```ts
function classifyError(message: string): 'transient' | 'permanent' {
  const lower = message.toLowerCase()
  const permanentPatterns = [
    'unavailable', 'indisponível', 'video unavailable',
    '404', 'not found', 'forbidden', 'private',
    'unsupported format', 'unsupported url',
    'removed', 'deleted'
  ]
  if (permanentPatterns.some(p => lower.includes(p))) return 'permanent'
  return 'transient' // default conservador: rede, timeout, etc.
}
```

Retry timing:
- 1ª tentativa de retry: após 2s
- 2ª tentativa de retry: após 8s
- Após 2 retries: vira `error` persistente

## Acessibilidade

- `DownloadDock`: `role="region"` com `aria-label="Downloads em andamento"`, chevron com `aria-expanded`, contagens com `aria-live="polite"`.
- `SongStatusRow`: erros com `role="alert"` (anúncio imediato pra leitores de tela); botão "Tentar de novo" é `<button>` real.
- Estados de cor (azul/amarelo/vermelho) sempre acompanhados de texto — não dependência de cor isolada.
- Animações respeitam `prefers-reduced-motion` (pulso do retrying vira ícone estático).

## Telemetria (Sentry)

Capturar com `captureException` em `feature: 'downloads'`:
- Falhas permanentes (após classificação)
- Falhas após esgotar retries
- Crashes inesperados no processo de fila (try/catch no `processNext`)

Breadcrumbs:
- `enqueueDownload` (mostra source kind)
- `startDownload` (início)
- `download.completed`
- `download.failed` (com kind + retryCount)
- `download.retrying` (mostra tentativa)

## Testes

### Unit (vitest)

**Store (`src/store/downloads.test.ts`)** — novo arquivo:
- Enfileira 3, processa em ordem.
- Erro transitório → retrying → completed.
- Erro transitório → 3 falhas → error persistente.
- Erro permanente (mensagem contém "unavailable") → error direto, sem retry.
- Cancel durante retrying → limpa entry e arquivo.
- `selectAggregate` retorna contagens corretas em cenários mistos.

**Classificação de erro** — funções puras testadas isoladamente.

### Component (RTL)

**`SongStatusRow`** (`src/components/SongStatusRow.test.tsx`):
- Não renderiza nada se estado idle/completed.
- Mostra progresso em downloading.
- Botão "Tentar de novo" em error chama `retry` do store.
- Modo `compact` substitui artista.

**`DownloadDock`** (`src/components/DownloadDock.test.tsx`):
- Some quando store vazio.
- Mostra contadores corretos.
- Expande/colapsa.
- Botão retry/cancel em items.

**`AddSongModal`** (`src/components/AddSongModal.test.tsx`):
- Após confirmar, store recebe enqueue + modal fecha + toast aparece.
- Não trava mais em step 3.
- Falha do INSERT não chama enqueue.

**`AddSongToPlaylistModal`** — atualizar testes existentes:
- Tab "Nova música" renderiza o flow embedded.
- Confirmar em "Nova música" insere song + chama RPC + enqueue.

### E2E

Estender [`apps/desktop/e2e/specs/`](apps/desktop/e2e/specs/):
- Spec 3 (Adicionar música): cobrir que modal fecha imediatamente + dock aparece + eventualmente song fica disponível.
- Spec novo: adicionar do culto via tab "Nova música" → música cai na seção + no dock.

## Verificação end-to-end

1. **Boot**: `supabase start` + `pnpm tauri dev` em `apps/desktop`.
2. **Cenário 1 — fila múltipla**: abrir AddSong, confirmar 3 vídeos do YouTube em sequência (a cada confirm, modal fecha). Verificar dock mostra `↓ 1 baixando · 2 na fila` e que cards na biblioteca têm SongStatusRow "Na fila" / "Baixando X%".
3. **Cenário 2 — erro permanente**: usar URL de vídeo privado/removido. Verificar que após falha o dock mostra "1 falhou" e o card mostra "Falhou — tentar de novo". Clicar retry → tenta de novo.
4. **Cenário 3 — auto-retry**: simular rede instável (DevTools throttle pra Offline durante download). Verificar que vai pra "Tentando de novo (2/3)" e eventualmente succeed após reconnect (ou falha após 3 tentativas).
5. **Cenário 4 — adicionar do culto**: abrir culto, clicar "+ Adicionar música", trocar pra tab "Nova música", colar link do YouTube, confirmar. Verificar que volta pra tela do culto com a música na seção + dock ativo.
6. **Cenário 5 — cancelar mid-download**: começar download, clicar X no card ou no dock. Verificar que arquivo parcial é apagado e fila avança.
7. **`pnpm test`** passa.
8. **`pnpm typecheck`** passa.

## Arquivos críticos (referência rápida)

| Arquivo | Tipo de mudança |
|---|---|
| `apps/desktop/src/store/downloads.ts` | Extensão (estados, retry, aggregate) |
| `apps/desktop/src/components/DownloadDock.tsx` | **Novo** |
| `apps/desktop/src/components/SongStatusRow.tsx` | **Novo** |
| `apps/desktop/src/components/DownloadBadge.tsx` | Estado retrying, refinar error |
| `apps/desktop/src/components/SongCard.tsx` | Inserir SongStatusRow, migrar drive pra store |
| `apps/desktop/src/components/AddSongModal.tsx` | Remover step 3, enfileira |
| `apps/desktop/src/components/AddSongToPlaylistModal.tsx` | Tabs + flow embedded |
| `apps/desktop/src/pages/PlaylistDetail.tsx` | SongStatusRow compact nas linhas |
| `apps/desktop/src/components/Layout.tsx` | Montar DownloadDock global |
| `apps/desktop/src/lib/ytdlp.ts` | (sem mudança — APIs já compatíveis) |

## Fora do escopo

- Persistir fila entre reinícios do app (pode virar issue futura).
- Drag-and-drop pra reordenar fila.
- Pausar/retomar downloads individuais (só cancel/retry na v1).
- Refator profundo do polling do Howler — issue #63 separada.
- Notificações nativas do sistema quando download termina.
