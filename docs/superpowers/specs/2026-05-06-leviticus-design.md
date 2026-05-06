# Leviticus — Design Spec
**Data:** 2026-05-06

## Visão Geral

App para gerenciar e reproduzir playbacks musicais na igreja. O usuário cola links do YouTube, baixa o áudio para o dispositivo, e reproduz offline. As músicas são organizadas dentro de uma organização (igreja), compartilhadas entre membros com permissões configuráveis. Um membro pode controlar remotamente a reprodução de outro dispositivo em tempo real — ex: desktop conectado à mesa de som, controlado pelo celular de qualquer lugar da igreja.

---

## Plataformas

- **Desktop:** Tauri v2 + React (Windows, macOS, Linux)
- **Mobile:** React Native / Expo (Android, iOS)
- Lógica de negócio e tipos compartilhados em TypeScript (pacote `packages/core`)

---

## Arquitetura

```
┌─────────────────────────────────────────────┐
│                  Supabase                   │
│  Auth (contas) + PostgreSQL (metadados)     │
│  Realtime (controle remoto entre devices)   │
└───────────────────┬─────────────────────────┘
                    │ HTTPS / WSS (apenas online)
        ┌───────────┴───────────┐
        │                       │
┌───────▼──────┐       ┌────────▼───────┐
│  Tauri       │       │  React Native  │
│  (Desktop)   │       │  (Mobile)      │
│              │       │                │
│  SQLite      │       │  SQLite        │
│  yt-dlp      │       │  Worker API *  │
│  local       │       │  (download)    │
└──────────────┘       └────────────────┘

* Worker: serviço mínimo (Railway ou Fly.io) com yt-dlp
  exposto como API REST. Usado apenas para download de áudio
  no mobile — o áudio nunca é armazenado no servidor.
```

### Princípio de armazenamento
- **Supabase:** metadados (músicas, grupos, playlists, org, membros)
- **SQLite local:** espelho dos metadados para acesso offline
- **Dispositivo:** arquivo de áudio (`<song_id>.mp3`) armazenado localmente
- **Servidor worker:** não persiste nenhum arquivo — processa e retorna o stream

---

## Estratégia Offline

```
Online:  Supabase → sincroniza → SQLite local → UI
Offline:                          SQLite local → UI
```

**Funciona offline:**
- Navegar pela biblioteca, grupos e playlists (dados cacheados)
- Reproduzir músicas baixadas

**Requer internet:**
- Adicionar músicas (YouTube + Supabase)
- Baixar áudio
- Controle remoto (Supabase Realtime)
- Gerenciar membros, papéis e grupos

Escrita offline não é suportada na v1. O SQLite local é sincronizado com o Supabase sempre que o app abre com conexão disponível.

- **Desktop:** SQLite via plugin Tauri
- **Mobile:** SQLite via `expo-sqlite`

---

## Modelo de Dados

### `organizations`
| campo | tipo | descrição |
|---|---|---|
| `id` | uuid | chave primária |
| `name` | text | ex: "Igreja Assembleia de Deus Área 118" |
| `owner_id` | uuid | FK → Auth |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | atualizado automaticamente |

### `organization_members`
| campo | tipo | descrição |
|---|---|---|
| `user_id` | uuid | FK → Auth |
| `org_id` | uuid | FK → organizations |
| `joined_at` | timestamp | — |

Um usuário pode pertencer a múltiplas organizações.

### `org_invite_codes`
| campo | tipo | descrição |
|---|---|---|
| `id` | uuid | chave primária |
| `org_id` | uuid | FK → organizations |
| `code` | text | código único gerado (ex: "ABC123") |
| `created_by` | uuid | FK → Auth (admin que gerou) |
| `expires_at` | timestamp \| null | se null, não expira |
| `is_active` | boolean | o admin pode desativar o código |

Um admin gera um código e o distribui. Novos usuários digitam o código no app para entrar na organização. Não há limite de usos por padrão.

### `roles`
| campo | tipo | descrição |
|---|---|---|
| `id` | uuid | chave primária |
| `org_id` | uuid | FK → organizations |
| `name` | text | ex: "Regente", "Sonoplasta" |
| `updated_at` | timestamp | atualizado automaticamente |

### `role_permissions`
| campo | tipo | descrição |
|---|---|---|
| `role_id` | uuid | FK → roles |
| `permission` | enum | ver lista abaixo |

Constraint: `UNIQUE(role_id, permission)`

**Permissões disponíveis:**
- `add_songs` — adicionar músicas novas à org (sempre global, não pode ter scope de grupo)
- `manage_songs` — editar e remover músicas (pode ter scope de grupo)
- `manage_groups` — criar, editar, remover grupos
- `manage_playlists` — criar, editar, remover playlists
- `add_songs_to_playlist` — adicionar músicas a playlists (pode ter scope de grupo)
- `manage_members` — convidar e remover membros
- `manage_roles` — criar e atribuir papéis

`add_songs` é sempre global: qualquer um com essa permissão pode adicionar músicas à org inteira. `manage_songs` com `group_id` preenchido limita edição/remoção às músicas do grupo. Uma regente típica teria `manage_songs` + `add_songs_to_playlist` ambos scoped ao seu grupo, sem `add_songs`.

### `user_role_assignments`
| campo | tipo | descrição |
|---|---|---|
| `id` | uuid | chave primária |
| `user_id` | uuid | — |
| `org_id` | uuid | — |
| `role_id` | uuid | — |
| `group_id` | uuid \| null | se preenchido, as permissões do papel valem só para esse grupo |

O escopo de grupo fica na **atribuição**, não no papel. Assim o mesmo papel "Regente" pode ser atribuído a pessoas diferentes com grupos diferentes:
- Regente A → `group_id = "Vocal de Jovens"` → gerencia só esse grupo
- Regente B → `group_id = "Vocal das Crianças"` → gerencia só esse grupo
- Regente C → duas linhas: `group_id = "Vocal de Jovens"` e `group_id = "Vocal das Crianças"` → gerencia ambos
- Sonoplasta → `group_id = null` → permissões valem para toda a org

A permissão `add_songs_to_playlist` com `group_id` preenchido permite que a regente adicione a playlists apenas músicas pertencentes ao(s) seu(s) grupo(s).

Um usuário pode ter múltiplos papéis e múltiplas atribuições na mesma organização.

### `groups`
| campo | tipo | descrição |
|---|---|---|
| `id` | uuid | chave primária |
| `org_id` | uuid | FK → organizations |
| `name` | text | ex: "Vocal de Jovens", "Ministério de Louvor" |
| `updated_at` | timestamp | atualizado automaticamente |

### `songs`
| campo | tipo | descrição |
|---|---|---|
| `id` | uuid | chave primária |
| `org_id` | uuid | FK → organizations |
| `added_by` | uuid \| null | FK → Auth (`SET NULL` se o membro sair da org) |
| `youtube_url` | text | URL original do YouTube |
| `title` | text | editável |
| `artist` | text | editável |
| `thumbnail_url` | text | capa do vídeo |
| `duration_seconds` | integer | duração |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | atualizado automaticamente |

Constraint: `UNIQUE(org_id, youtube_url)` — impede músicas duplicadas na mesma org. O app exibe aviso amigável ao tentar adicionar uma URL já existente.

### `song_groups`
| campo | tipo | descrição |
|---|---|---|
| `song_id` | uuid | — |
| `group_id` | uuid | — |

Constraint: `UNIQUE(song_id, group_id)`

Uma música pode pertencer a vários grupos simultaneamente.

**Regra de deleção:** remover uma música de um grupo exclui apenas a entrada em `song_groups`. Quando a música não pertencer a nenhum grupo, ela é automaticamente removida da org (deletada de `songs` e de todas as `playlist_songs` onde aparecia).

### `playlists`
| campo | tipo | descrição |
|---|---|---|
| `id` | uuid | chave primária |
| `org_id` | uuid | FK → organizations |
| `name` | text | ex: "Culto Domingo 10/05" |
| `scheduled_date` | date \| null | data do culto; permite ordenação cronológica |
| `created_by` | uuid | FK → Auth |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | atualizado automaticamente |

A lista de playlists é ordenada por `scheduled_date` descrescente (mais recente primeiro). Playlists sem data ficam no topo.

### `playlist_songs`
| campo | tipo | descrição |
|---|---|---|
| `playlist_id` | uuid | — |
| `song_id` | uuid | — |
| `position` | integer | ordem na playlist |

Constraint: `UNIQUE(playlist_id, song_id)`

Uma playlist pode conter músicas de múltiplos grupos.

---

## Fluxos Principais

### 1. Criar organização e adicionar membros
1. Novo usuário abre o app → vê tela de seleção de org vazia → pode criar uma org ou digitar um código de convite
2. Ao criar a org, o usuário torna-se dono automaticamente
3. Admin gera um código de convite (com ou sem data de expiração)
4. Distribui o código para os membros
5. Novo membro digita o código no app → entra na org automaticamente
6. Admin cria papéis, define permissões e os atribui aos membros

### 1b. Transferência de ownership
1. Dono acessa Gerenciar Organização → seleciona um membro → "Transferir ownership"
2. O membro selecionado torna-se o novo dono
3. O antigo dono recebe automaticamente todas as permissões disponíveis (equivalente a um papel com todas as permissões, exceto transferir ownership e deletar org)

### 2. Adicionar música
1. Usuário cola URL do YouTube
2. App consulta YouTube oEmbed API → retorna título e nome do canal
3. Campos aparecem pré-preenchidos: `title` = título do vídeo, `artist` = nome do canal (ex: "Central Gospel Music")
4. Usuário edita os campos se necessário (ex: corrigir artista para "Fernandinho") e seleciona em quais grupos a música pertence
5. Confirma → metadados salvos no Supabase
6. Download do áudio inicia automaticamente para o dispositivo atual

### 3. Download de áudio
- **Desktop:** Tauri invoca `yt-dlp` como subprocess local (binário empacotado)
- **Mobile:** App chama Worker API (`POST /download`) com o JWT do Supabase no header `Authorization: Bearer <token>` → worker valida o token antes de processar → recebe stream → salva como `<song_id>.mp3`

### 4. Biblioteca
- App lê do SQLite local (sincronizado com Supabase)
- Filtrável por grupo ou playlist
- Músicas sem arquivo local exibem ícone de download
- Toque em música baixada: reproduz; não baixada: inicia download

### 5. Controle remoto (Supabase Realtime)

O controle remoto funciona exclusivamente entre dispositivos logados na **mesma conta**. O usuário escolhe explicitamente qual dispositivo quer controlar.

**Canal Realtime:** `remote-control:{user_id}`

**Presença de dispositivos:**
Ao abrir o app, cada dispositivo se anuncia no canal:
```ts
type DevicePresence = {
  device_id: string          // uuid gerado localmente e persistido
  device_name: string        // ex: "iPhone de João", "Desktop Igreja"
  platform: 'desktop' | 'mobile'
}
```
O usuário vê a lista de dispositivos online e seleciona qual deseja controlar. Dispositivos que saem do ar somem da lista automaticamente via presença do Supabase Realtime.

**Eventos de comando** (controle → player):
```ts
type Command = {
  target_device_id: string   // device_id do player alvo
  payload:
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'seek'; position_seconds: number }
    | { type: 'set_volume'; volume: number }     // 0.0 a 1.0
    | { type: 'play_song'; song_id: string }
    | { type: 'next_in_playlist' }
    | { type: 'previous_in_playlist' }
    | { type: 'play_playlist'; playlist_id: string; position: number }
}
```

**Eventos de estado** (player → controle):
```ts
type PlayerState = {
  device_id: string
  song_id: string | null       // null quando player está ocioso
  playlist_id: string | null   // null quando tocando fora de playlist
  playlist_position: number | null // ex: 3 de 8
  playlist_total: number | null
  is_playing: boolean
  position_seconds: number
  volume: number
  is_downloading: boolean      // true quando baixando antes de reproduzir
  download_progress: number    // 0.0 a 1.0
}
```

Cada dispositivo transmite `PlayerState` a cada ~1 segundo. O controle exibe o estado do dispositivo selecionado, incluindo "música 3 de 8" quando em contexto de playlist. Se receber `play_song` para música não baixada, o player inicia o download e transmite `is_downloading: true` com progresso.

Se nenhum outro dispositivo estiver online, o app funciona como player local independente.

---

## Telas

### Comuns (desktop e mobile)
1. **Login / Cadastro** — email + senha via Supabase Auth
2. **Seleção de organização** — lista de orgs do usuário; botão para criar nova org (primeiro acesso ou usuário sem convite)
3. **Biblioteca** — lista de músicas da org; busca por título ou artista; filtrável por grupo; ícone de download nas não baixadas; player mini fixo na base
4. **Adicionar música** — URL, metadados pré-preenchidos, seleção de grupos, confirmar e baixar; aviso se URL já existe na org
5. **Grupos** — lista de grupos da org; músicas de cada grupo
6. **Playlists** — lista de playlists ordenada por data do culto; criação e edição de setlists com campo de data; indicador de status de downloads (ex: "5 de 8 músicas baixadas neste dispositivo")
7. **Player expandido** — capa, título, artista, barra de progresso, play/pause, volume; contexto de playlist ("música 3 de 8") com botões anterior/próxima
8. **Controle remoto** — igual ao player expandido mas executado remotamente; aparece automaticamente quando outro dispositivo está ativo; mostra nome e plataforma do dispositivo controlado
9. **Gerenciar organização** — membros, papéis e permissões (visível apenas para quem tem permissão)

### Desktop
- Navegação via sidebar lateral
- Layout de duas colunas na biblioteca (lista + player)

### Mobile
- Navegação via abas na base
- Layout de coluna única

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Desktop | Tauri v2 + React + TypeScript |
| Mobile | React Native (Expo) |
| Lógica compartilhada | `packages/core` (TypeScript) |
| Auth + DB | Supabase (Auth + PostgreSQL) |
| Cache offline | SQLite (Tauri plugin / expo-sqlite) |
| Realtime | Supabase Realtime |
| Download (desktop) | yt-dlp (binário local) |
| Download (mobile) | Worker API (Railway/Fly.io) |
| Metadata YouTube | YouTube oEmbed API |
| Áudio (desktop) | Tauri audio plugin |
| Áudio (mobile) | expo-av ou react-native-track-player |

---

## Estrutura do Repositório (monorepo)

```
leviticus/
├── apps/
│   ├── desktop/          # Tauri + React
│   └── mobile/           # React Native / Expo
├── packages/
│   └── core/             # tipos TypeScript, cliente Supabase, lógica compartilhada
├── worker/               # API de download (Node.js + yt-dlp)
└── docs/
    └── superpowers/specs/
```

---

## Fora do Escopo (v1)

- Controle de tom/velocidade
- Letras ou cifras
- Upload de áudio próprio (sem YouTube)
- Escrita offline (adicionar/editar músicas sem internet)
