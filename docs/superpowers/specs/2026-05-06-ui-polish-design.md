# UI Polish — Design Spec

## Goal

Evoluir o visual do Leviticus de um protótipo funcional para uma interface polida, acessível e consistente. Público-alvo: 12–70 anos.

## Design System

### Tipografia
- Fonte: **Inter** (Google Fonts), carregada via `@fontsource/inter` ou CDN no Tailwind config
- Tamanho mínimo de corpo: **14px**; títulos de músicas: **15px**; headings de página: **18px**
- Peso: 400 (body), 500 (labels), 600–700 (headings e botões)

### Paleta de Cores

| Token | Valor | Uso |
|---|---|---|
| `bg-app` | `#09090f` | Fundo da aplicação |
| `bg-sidebar` | `#0d0d16` | Sidebar |
| `bg-card` | `linear-gradient(135deg, #13131f, #161625)` | Cards de músicas |
| `bg-card-active` | `linear-gradient(135deg, #1a2540, #141e36)` | Card tocando atualmente |
| `bg-input` | `rgba(255,255,255,0.04)` | Inputs e campos |
| `border-subtle` | `rgba(255,255,255,0.05)` | Bordas de cards |
| `border-card` | `rgba(255,255,255,0.08)` | Bordas de inputs |
| `accent` | `#2563eb` | Botões primários, fundo player mini |
| `accent-ring` | `#3b82f6` | Focus ring, seek bar, borda sidebar ativa |
| `text-primary` | `#f3f4f6` | Títulos e texto principal |
| `text-secondary` | `#9ca3af` | Labels e texto de suporte |
| `text-muted` | `#4b5563` | Texto desabilitado, timestamps |
| `success` | `#22c55e` | Ícone de download concluído |
| `error` | `#ef4444` | Mensagens de erro |
| `info-bg` | `rgba(30,58,138,0.15)` | Banner informativo |
| `info-border` | `rgba(59,130,246,0.2)` | Borda de banner informativo |

### Ícones
- Biblioteca: **lucide-react**
- Estilo: stroke padrão (`strokeWidth={2}`, `strokeLinecap="round"`, `strokeLinejoin="round"`)
- Exceção: ícone **Pause usa fill** (`fill="currentColor"`, sem stroke, `rx="1.5"` nos retângulos)
- Tamanhos: 13px (inline pequeno), 15–16px (sidebar/toolbar), 18px (controles player mini), 20–22px (player expandido)

### Spinner de Loading
- Ícone `Loader2` do lucide-react com animação CSS:
```css
@keyframes spin { to { transform: rotate(360deg); } }
.animate-spin-smooth {
  animation: spin 0.9s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
}
```
- Usar `transform-box: fill-box` obrigatório para SVG inline funcionar em qualquer tamanho

### Alvos de Toque (Acessibilidade)
- Todos os botões interativos: mínimo `44×44px`
- Botões circulares do player: `34px` (mini) e `52px` (expandido) — aceitáveis pois são usados com mouse
- Inputs: `min-height: 44px` com padding vertical `11px`

### Border Radius
- Cards de música: `border-radius: 12px`
- Inputs e botões: `border-radius: 10px`
- Thumbnails: `border-radius: 8px`
- Botões de ação circulares: `border-radius: 50%`
- Thumbnail do player expandido: `border-radius: 18px`

---

## Componentes

### Sidebar (`components/Sidebar.tsx`)
- Fundo `#0d0d16`, borda direita `rgba(255,255,255,0.04)`
- Item ativo: `background: rgba(30,58,138,0.19)`, `border-left: 3px solid #3b82f6`, cor `#eff6ff`
- Item inativo: `color: #9ca3af`, sem fundo
- Ícone Lucide à esquerda de cada item (16px)
- Ícone `LogOut` no item Sair
- **Badge de organização ativa** no rodapé, acima do botão Sair:
  - Container: `background: rgba(255,255,255,0.03)`, `border: 1px solid rgba(255,255,255,0.06)`, `border-radius: 9px`, `padding: 9px 12px`, `margin: 0 8px 6px`
  - Ícone da org: quadrado 24×24, gradiente azul (`#1e3a8a → #2563eb`), `border-radius: 6px`, ícone `Home` (11px, `#93c5fd`)
  - Nome da org: `font-size: 12px`, `font-weight: 600`, `color: #e5e7eb`, truncado com ellipsis
  - Dados: lidos do `localStorage.getItem('leviticus_org_id')` e nome buscado do store ou localStorage

### SongCard (`components/SongCard.tsx`)
- Card com gradiente sutil + borda translúcida
- Card ativo (tocando): gradiente azulado + borda `rgba(59,130,246,0.25)`
- Thumbnail: 44×44, `border-radius: 8px`; placeholder com ícone `Music` cinza quando sem imagem
- Botão play: circular `btn-icon-ghost` (fundo `rgba(255,255,255,0.05)`, borda `rgba(255,255,255,0.1)`)
- Botão pause (ativo): circular `btn-icon` (fundo `#2563eb`) com **ícone Pause fill**
- Botão download (não baixado): circular ghost com ícone `Download` em `#3b82f6`, borda `rgba(59,130,246,0.25)`

### PlayerMini (`components/PlayerMini.tsx`)
- Fundo `linear-gradient(to right, #0f172a, #0d1322)`, borda top `rgba(255,255,255,0.06)`
- Ícones: `SkipBack`, **Pause fill** / `Play`, `SkipForward` (18px)
- Botão central: circular `btn-icon` (34px)
- Volume: ícone `Volume2` (15px) + range slider nativo com cor azul

### PlayerExpanded (`components/PlayerExpanded.tsx`)
- Overlay `#09090f`, sem bg translúcido
- Thumbnail: 200×200, `border-radius: 18px`, `box-shadow: 0 24px 64px rgba(37,99,235,0.17)`
- Botão central: `btn-icon` 52px com `box-shadow: 0 4px 20px rgba(37,99,235,0.31)`, **Pause fill**
- Seek bar: track `rgba(255,255,255,0.09)`, fill `#3b82f6`, thumb círculo branco 13px
- Volume: mesma estrutura do PlayerMini
- Botão fechar: quadrado `32×32`, `border-radius: 8px`, ícone `X`

### DownloadButton (`components/DownloadButton.tsx`)
- Estado idle: ícone `Download` + texto "Baixar"
- Estado downloading: spinner `Loader2` + percentual
- Estado error: ícone `AlertCircle` vermelho + texto "Tentar novamente"
- Estado done: ícone `CheckCircle` verde

### Layout e Loading States

**Biblioteca (`pages/Library.tsx`)**
- Estado loading: flex centralizado na área de conteúdo, container quadrado `48×48` com ícone `Loader2` (22px, azul), título "Carregando biblioteca…" + subtítulo "Buscando suas músicas"
- Estado vazio: ícone `Music` grande, texto "Nenhuma música ainda" + link para adicionar

**AddSong (`pages/AddSong.tsx`) — Etapa 1**
- Botão "Buscar": durante fetch do yt-dlp, desabilita botão, substitui texto por spinner `Loader2` + "Buscando metadados…"
- Banner informativo azul abaixo do botão: ícone `Info` + "Isso pode levar alguns segundos"

**AddSong — Etapa 2 (Confirmar)**
- Botões "Cancelar" (ghost) e "Baixar" (primary) lado a lado

**AddSong — Etapa 3 (Baixando)**
- Spinner `Loader2` inline à esquerda do label "Baixando…"
- Percentual em `#3b82f6` bold à direita
- Thumbnail com `box-shadow: 0 12px 40px rgba(37,99,235,0.19)`

### Login (`pages/Login.tsx`)
- Subtítulo "Bem-vindo de volta" abaixo do título
- Labels de campo visíveis acima dos inputs
- Link "Criar conta" / "Já tenho conta" como texto inline colorido (`#3b82f6`), não botão separado
- Botão principal `min-height: 46px`, `font-size: 15px`

### OrgSelect (`pages/OrgSelect.tsx`)
- Mesma estrutura, substituir emojis por ícones Lucide: `Building2` (org), `Hash` (código), `Plus` (criar)

### Ministérios (`pages/Ministries.tsx`) — tela nova
- Nomenclatura: **Ministérios** (não "Grupos") — cobre departamentos, vocais, ministérios de louvor, infantil, jovens etc.
- Sidebar item: ícone `LayoutGrid` (16px), label "Ministérios"
- Cabeçalho: título "Ministérios" + subtítulo "Organize por departamento ou ministério" + botão "+ Novo" (`#2563eb`, border-radius 10px)
- Grid 2 colunas de cards; cada card: gradiente sutil, ícone colorido 40×40 (`border-radius: 10px`), nome do ministério (14px 600), contagem de músicas (12px `#6b7280`), chevron direito
- Estado vazio: ícone `LayoutGrid` centralizado + "Nenhum ministério ainda" + botão "Criar primeiro ministério"
- **Modal "Novo ministério"**: overlay escuro `rgba(0,0,0,0.6)`, card `#13131f` 280px, border-radius 16px
  - Campo Nome (obrigatório, input padrão)
  - Seletor de cor: 6 swatches predefinidos (azul, verde, roxo, laranja, rosa, ciano), borda de seleção visível
  - Botões Cancelar (ghost) + Criar (primary)

### Cultos (`pages/Services.tsx`) — tela nova
- Nomenclatura: **Cultos** (não "Playlists") — setlists organizados por data de culto
- Sidebar item: ícone `CalendarDays` (16px), label "Cultos"
- Cabeçalho: título "Cultos" + subtítulo "Setlists por data de culto" + botão "Novo culto" (`#2563eb`)
- Lista vertical de cards; cada card: ícone colorido 42×42, nome do culto (14px 600), data + status de downloads
  - Culto completo: ícone verde com `Check`, badge verde "X/X baixadas"
  - Culto incompleto: ícone laranja com `Download`, badge laranja "X/X baixadas" + barra de progresso (3px, `#f59e0b`)
  - Sem data: ícone cinza, texto "Sem data · X/X baixadas"
- Estado vazio: ícone `CalendarDays` centralizado + "Nenhum culto ainda" + botão "Criar primeiro culto"
- **Modal "Novo culto"**: mesmo estilo do modal de ministério
  - Campo Nome (obrigatório)
  - Campo Data (opcional, formato DD/MM/AAAA)
  - Select Ministério (opcional) — lista os ministérios cadastrados
  - Botões Cancelar (ghost) + Criar (primary)

### CultoDetail (`pages/ServiceDetail.tsx`) — stub
- Placeholder elegante: ícone `CalendarDays` centralizado, "Em breve", subtítulo explicativo
- Mantém sidebar ativo em "Cultos"

---

## Instalação

```bash
pnpm --filter desktop add lucide-react @fontsource/inter
```

Tailwind config — adicionar Inter como `fontFamily.sans`:
```js
theme: {
  extend: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
    },
  },
},
```

`index.css` — importar fonte:
```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
```

E adicionar utilitário de spinner:
```css
@keyframes spin-smooth { to { transform: rotate(360deg); } }
.animate-spin-smooth {
  animation: spin-smooth 0.9s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
}
```

---

## Arquivos Modificados

| Arquivo | Operação |
|---|---|
| `apps/desktop/package.json` | Adicionar `lucide-react`, `@fontsource/inter` |
| `apps/desktop/tailwind.config.js` | Adicionar `fontFamily.sans` |
| `apps/desktop/src/index.css` | Importar Inter, adicionar `.animate-spin-smooth` |
| `apps/desktop/src/components/Sidebar.tsx` | Ícones Lucide, estilo ativo com borda |
| `apps/desktop/src/components/SongCard.tsx` | Gradiente card, pause fill, thumb placeholder |
| `apps/desktop/src/components/PlayerMini.tsx` | Gradiente footer, pause fill, ícones Lucide |
| `apps/desktop/src/components/PlayerExpanded.tsx` | Pause fill, seek thumb, box-shadow |
| `apps/desktop/src/components/DownloadButton.tsx` | Ícones Lucide nos 4 estados |
| `apps/desktop/src/pages/Library.tsx` | Loading centralizado, estado vazio |
| `apps/desktop/src/pages/AddSong.tsx` | Loading no buscar, banner info, botão cancelar |
| `apps/desktop/src/pages/Login.tsx` | Subtítulo, labels, link em linha |
| `apps/desktop/src/pages/OrgSelect.tsx` | Ícones Lucide nos modos |
| `apps/desktop/src/pages/Ministries.tsx` | Criar tela nova — grid de ministérios + modal de criação |
| `apps/desktop/src/pages/Services.tsx` | Criar tela nova — lista de cultos + modal de criação |
| `apps/desktop/src/pages/ServiceDetail.tsx` | Criar stub elegante "em breve" |
| `apps/desktop/src/components/Sidebar.tsx` | Adicionar itens Ministérios e Cultos na navegação |
| `apps/desktop/src/App.tsx` | Adicionar rotas `/ministries`, `/services`, `/services/:id` |
