# Adicionar música nova direto no culto

**Data:** 2026-05-20
**Status:** aprovado (design)

## Problema

Hoje só dá pra adicionar a um culto músicas que **já estão na biblioteca**. O
botão "+ Adicionar música" de uma seção abre o `AddSongToPlaylistModal`, um
seletor que lista apenas `songs` da org. Pra colocar uma música nova num culto,
o usuário precisa de dois passos separados:

1. Biblioteca → "Adicionar" → buscar no YouTube/arquivo → entra na biblioteca
2. Culto → seção → "+ Adicionar música" → escolher ela na lista

Queremos permitir o fluxo de download (YouTube/URL/arquivo) **direto de dentro
de uma seção do culto**, vinculando a música à seção ao final.

## Decisões de UX

- **Ponto de entrada único:** o botão "+ Adicionar música" da seção continua
  único. Ao abrir, o `AddSongToPlaylistModal` mostra um segmented control no
  topo: `[Da biblioteca] [Baixar nova]`, com "Da biblioteca" como aba default
  (caso comum).
- **Da biblioteca:** lista atual, sem mudança.
- **Baixar nova:** fecha o seletor e abre o `AddSongModal` (fluxo de download)
  com o contexto da seção. O ministério da seção vem **pré-marcado** no seletor
  de ministérios; o usuário pode ajustar.
- **Sem volta pra biblioteca:** não há toggle de "voltar" dentro do
  `AddSongModal` em contexto-de-culto. O caminho é só de ida. A tela final
  (step 4) NÃO mostra "Ver biblioteca".
- **Tela final em contexto-de-culto:** botões "Adicionar outra" (reinicia o
  fluxo de download na mesma seção) e "Concluído" (fecha → volta pro culto).

## Abordagem (Approach A — contexto via `useUIStore`)

Reusa o `AddSongModal` global passando um contexto opcional. Sem refatorar o
componente de ~2300 linhas. **O fluxo aberto pela Biblioteca permanece
idêntico** quando não há contexto.

### Wiring

- **`useUIStore`** (`src/store/ui.ts`):
  - `openAddSong()` passa a aceitar contexto opcional
    `addToPlaylist?: { playlistId: string; sectionId: string | null; groupId: string | null; sectionLabel: string | null }`.
  - O contexto é guardado no store junto de `showAddSong`.
  - `closeAddSong()` limpa o contexto.

- **`AddSongToPlaylistModal`** (`src/components/AddSongToPlaylistModal.tsx`):
  - Ganha o segmented control `[Da biblioteca] [Baixar nova]` no topo.
  - "Da biblioteca" → lista atual.
  - "Baixar nova" → `onClose()` + `openAddSong({ playlistId, sectionId, groupId, sectionLabel })`.
  - A aba "Baixar nova" fica escondida se o usuário não tem a permissão
    `add_songs`.

- **`AddSongModal`** (`src/components/AddSongModal.tsx`):
  - Lê `addToPlaylist` do `useUIStore`.
  - **Sem contexto → comportamento idêntico ao de hoje** (regressão zero no
    fluxo da Biblioteca).
  - Com contexto:
    - pré-marca `groupId` da seção no seletor de ministérios (quando a seção
      tem ministério; seções avulsas têm `groupId` null e nada é pré-marcado);
    - depois de inserir a linha em `songs` (passo já síncrono hoje), chama o
      RPC `add_song_to_playlist` com
      `{ p_playlist_id, p_song_id, p_section_id, p_group_id, p_section_label }`
      pra vincular a música à seção;
    - o passo de vínculo roda tanto no caminho YouTube (`handleConfirm`) quanto
      no de arquivo (`handleConfirmFile`);
    - step 4 adapta copy/botões pro contexto-de-culto ("Adicionar outra" +
      "Concluído", sem "Ver biblioteca").

### Fluxo de dados

1. Usuário no culto, seção S. Clica "+ Adicionar música" → `AddSongToPlaylistModal`
   abre (aba "Da biblioteca" default).
2. Clica "Baixar nova" → seletor fecha, `openAddSong({...contexto de S})`.
3. `AddSongModal` abre com contexto. Ministério de S pré-marcado.
4. Usuário faz busca YouTube / cola URL / escolhe arquivo — fluxo normal.
5. Ao confirmar:
   - insere a linha em `songs` (síncrono);
   - insere `song_groups` pros ministérios selecionados;
   - enfileira o download em background (`useDownloadsStore`);
   - **novo:** chama `add_song_to_playlist` pra vincular à seção.
6. Step 4 (contexto-de-culto): "Adicionar outra" + "Concluído".
7. Fechar → volta pro culto. A música aparece na seção já com indicador de
   download (o `PlaylistDetail` já auto-enfileira e mostra estado de download
   pra músicas sem arquivo local).

## Edge cases

- **Seção não materializada (`sectionId` null):** o RPC `add_song_to_playlist`
  já cria a seção via `p_section_label` — mesmo comportamento do seletor da
  biblioteca.
- **RPC `add_song_to_playlist` falha (`forbidden`/erro):** a música já está na
  biblioteca e baixando — não se perde. Step 4 mostra aviso "Música baixada,
  mas não foi possível adicionar ao culto — adicione pela aba Da biblioteca."
  Erro logado via `captureException`.
- **Permissão `add_songs` ausente:** a aba "Baixar nova" fica escondida; a aba
  "Da biblioteca" continua disponível.

## Testes

### Unit / component

- **`AddSongModal`:** com contexto → chama `add_song_to_playlist` após o insert
  da música; sem contexto → NÃO chama (garante regressão zero no fluxo da
  Biblioteca). Step 4 em contexto-de-culto mostra os botões corretos, sem
  "Ver biblioteca".
- **`AddSongToPlaylistModal`:** segmented control renderiza; "Baixar nova"
  chama `openAddSong` com o contexto certo; aba "Baixar nova" escondida quando
  falta `add_songs`.

### E2E (novo spec `e2e/specs/20-add-song-direct-to-culto.spec.ts`)

Jornada — adicionar música nova direto numa seção do culto:

1. Setup: signup + criar org + criar um culto com uma seção (via RPCs, como os
   specs 12/14), yt-dlp mockado.
2. Abrir o culto → seção → clicar "+ Adicionar música".
3. No seletor, clicar a aba "Baixar nova" → confirmar que o `AddSongModal`
   abriu.
4. Colar URL do YouTube (mock, video ID de 11 chars) → "Buscar informações" →
   "Baixar música".
5. Asserções SQL no Supabase:
   - linha em `songs` criada pra org;
   - linha em `playlist_songs` ligando a música à seção certa do culto;
   - se a seção tinha ministério: associação em `song_groups`.
6. Modal fecha em contexto-de-culto sem navegar pra `/library`; a música
   aparece na seção.

Fora do E2E (regra do projeto): download real do YouTube e áudio real —
yt-dlp permanece mockado.
