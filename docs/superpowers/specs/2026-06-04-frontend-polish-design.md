# Frontend Polish — Design (issue #69)

Data: 2026-06-04 · Branch: `feat/frontend-polish-69` · Closes #69 (e parte de #37)

## Objetivo

Eliminar inconsistências de motion design e feedback de interação no app. Hoje
alguns modais entram suaves e outros snapam; alguns botões dão feedback de hover
e outros não; não há focus rings pra teclado nem suporte a `prefers-reduced-motion`.
Este trabalho cobre **todos os blocos A–G** da issue #69, incluindo bloco F completo
(perf perceptiva) e migração dos primitivos de botão pelo **app inteiro**.

## Princípios (régua única)

Aplicados a toda mudança deste PR:

- **Duration tiers:** 120–200ms (feedback de click/hover), 240–400ms (transições
  de página/modal), 600–1500ms (animações narrativas / completion).
- **Easing:** `ease-out` na entrada, `ease-in` na saída, `ease-in-out` em loops.
  O projeto já usa overshoot `cubic-bezier(0.34, 1.25, 0.64, 1)` — reusar.
- **Zero layout shift:** transições só mexem em `transform` e `opacity`.
- **Respeitar `prefers-reduced-motion`:** desativa animações longas (>200ms),
  mantém transições curtas de feedback.
- **Origem clara:** elementos que aparecem vêm DE algum lugar, não do vazio.
- **Reuso de vocabulário:** preferir classes `animate-*` existentes em
  `src/index.css`; só criar `@keyframes` novo no mesmo estilo quando necessário.

## Arquitetura: primitivos primeiro

A chave pra "tudo num PR" não virar 200+ edições manuais é construir os
**componentes compartilhados (bloco G) primeiro**. Eles carregam
hover/active/focus/reduced-motion de fábrica, então blocos A, B e D caem juntos
na migração.

### Componentes novos (bloco G)

Vivem em `src/components/ui/`.

**`<AnimatedModal>`** (`ui/AnimatedModal.tsx`)
- Props: `open`, `onClose`, `children`, `labelledBy?`, `closeOnBackdrop?` (default
  true), `size?` ('sm'|'md'|'lg').
- Responsabilidades: renderiza backdrop (`backdrop-fade-in`) + card
  (`animate-modal-in` / `animate-modal-out` no fechamento), gerencia Escape e
  clique-no-backdrop via `useModalDismiss` (já existe), trava scroll do body,
  foca o primeiro elemento focável (focus trap simples), respeita reduced-motion.
- Substitui o boilerplate de overlay+card repetido em ~17 modais.
- O fechamento animado usa estado `closing` interno + callback `onClose` após o
  `animate-modal-out` terminar (padrão já presente em AddSongModal/EditSongModal).

**`<Button>`** (`ui/Button.tsx`)
- Variantes: `primary` (azul #2563eb), `secondary` (branco sutil), `ghost`
  (transparente, hover bg branco 4–6%), `danger` (vermelho destrutivo).
- Tamanhos: `sm`, `md`, `lg`. Props: `loading?` (mostra `Loader2`
  `animate-spin-smooth` + desabilita), `fullWidth?`, mais todos os atributos
  nativos de `<button>`.
- Já vem com: `hover:*`, `active:scale-[0.98]` (em md/lg), `focus-visible` ring
  (`outline` 2px azul, offset), `disabled` (opacity + cursor), `transition`
  curtas (≤150ms), `motion-reduce:` neutraliza o scale.

**`<IconButton>`** (`ui/IconButton.tsx`)
- 32×32 e 40×40 (`size`). Mesmas variantes de cor + `aria-label` obrigatório.
- Mesma régua de hover/active/focus que `<Button>`.

### Migração (blocos A + B + D, app inteiro)

1. Migrar os ~17 modais pra `<AnimatedModal>` — resolve **A** (consistência de
   entrada/saída) de uma vez.
2. Substituir os ~218 `<button>` do app por `<Button>`/`<IconButton>` conforme
   variante apropriada — resolve **B** (hovers) e **D** (focus rings)
   uniformemente. Migração página por página pra revisão controlada.

## Blocos de motion (C)

- **C2 — Skeleton → conteúdo:** cross-fade 200ms ease-out. Skeleton e conteúdo
  coexistem por ~1 frame; skeleton `opacity→0` enquanto conteúdo `opacity→1`.
  Implementar como wrapper `<CrossFade loading=...>` ou classe utilitária; aplicar
  em `Library.tsx` e demais pontos com `SongCardSkeleton`/`SectionSkeleton`.
- **C1 — Tab switching:** cross-fade 120ms do conteúdo da aba ativa em
  `OrgManage`, `AddSongModal`, `AddSectionModal`. Como as abas já renderizam todas
  (`hidden`), aplicar `transition-opacity` + key na troca, sem desmontar.
- **C3 — Item add/remove:** `animate-fade-slide-in` (keyframe existente) com
  stagger sutil (cada item +30ms via `animation-delay` inline, teto ~10 itens)
  em Library (SongCard), PlaylistDetail (música adicionada) e OrgInvites (novo
  código). Remoção: fade-out antes de desmontar onde viável. Overlap com #37.
- **C4 — NavLink ativo (sidebar):** a barra vertical esquerda "salta" ao trocar
  de rota. Animar via `transition` na posição (transform translateY) de um único
  indicador absoluto compartilhado (padrão estilo `layoutId`), em vez de
  border-left por item.

## Acessibilidade (D)

- **Focus rings:** entregue via primitivos `<Button>`/`<IconButton>`
  (`focus-visible`). Onlick handlers em `<div>` que não dá pra migrar viram
  `<button>`/`role+tabindex` com focus ring.
- **`prefers-reduced-motion`:** bloco global em `index.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
  Exceção: manter transições de feedback <200ms onde a remoção piora a UX
  (avaliar caso a caso; o bloco global é o default seguro).

## Delight (E)

- **Empty states animados:** extrair `<EmptyState>` compartilhado
  (`ui/EmptyState.tsx`) com ícone lucide, título, descrição, CTA opcional e
  `animate-pop-in`/fade na entrada. Aplicar em library vazia, cultos vazios,
  invites vazios, ministério vazio.
- **Success inline pós-save:** após salvar org info, check verde inline por ~1s
  além do toast (estado local + `animate-pop-in`).
- **Splash → app:** fade-out 240ms ao invés do cut atual.
- **Drag-and-drop (PlaylistDetail):** ghost element seguindo o cursor +
  drop-zone com pulse sutil (`animate-pulse-light`). Mantém a implementação DnD
  custom atual; só adiciona feedback visual.

## Performance perceptiva (F — completo)

- **CSS containment:** `contain: layout` (via classe utilitária) em listas
  grandes — Library, OrgMembers — pra acelerar reflow em updates.
- **Prefetch on hover:** ao passar o mouse num link da sidebar, disparar o fetch
  dos dados da rota destino (warm cache). Implementar como hook `usePrefetchRoute`
  que dispara a query do react-query / leitura SQLite da rota. Idempotente, sem
  efeito colateral visual.
- **Optimistic UI no create:** hoje delete/edit são otimistas, create não.
  Adicionar inserção otimista (item aparece imediato com estado "pending") em
  criar música / criar culto / criar ministério, com rollback + toastError em
  falha. Risco mais alto do PR — coberto por testes.

## Estratégia de testes

Camada mais barata possível (regra do CLAUDE.md):

- **Component (RTL + jsdom):** `AnimatedModal` (abre/fecha, Escape, backdrop,
  reduced-motion), `Button` (variantes, loading desabilita, focus-visible),
  `IconButton` (aria-label), `EmptyState`, `CrossFade`.
- **Migração de modais:** os testes existentes de cada modal devem continuar
  verdes. Se um teste consulta estrutura de overlay que mudou, ajustar a query
  pro novo DOM do `<AnimatedModal>` — confirmando que a expectativa
  comportamental segue válida (não só "consertar o teste").
- **Optimistic create:** teste de store/lib cobrindo insert otimista + rollback.
- Rodar `pnpm test` (suíte completa) e `pnpm typecheck` antes do PR. Perguntar
  ao usuário sobre E2E antes de abrir PR pra main (regra de memória).

## Ordem de execução

1. **G1** `<AnimatedModal>` + testes.
2. **G2/G3** `<Button>` + `<IconButton>` + testes.
3. **A** migrar os ~17 modais pra `<AnimatedModal>`.
4. **B+D** migrar `<button>` do app inteiro pros primitivos (página por página).
5. **D** bloco `prefers-reduced-motion` global no `index.css`.
6. **C2** skeleton cross-fade.
7. **C1** tab switching cross-fade.
8. **C3** item add/remove + stagger.
9. **C4** indicador animado da sidebar.
10. **E** `<EmptyState>`, success inline, splash fade, drag ghost.
11. **F** `contain: layout`, prefetch on-hover, optimistic create.
12. `pnpm test` + `pnpm typecheck` verdes → PR pra `dev`.

## Escopo explícito

- **Dentro:** todos os blocos A–G, F completo, migração de botões no app inteiro.
- **Fora:** mudanças de schema/dados além do necessário pro optimistic create;
  rework da arquitetura DnD (só adiciona feedback visual, não reescreve).
- **Risco assumido:** PR grande. Mitigação — commits por bloco, primitivos com
  teste, `pnpm test` verde a cada bloco antes de avançar.
