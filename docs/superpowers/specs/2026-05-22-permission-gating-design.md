# Design — Aplicar checks de permissão em todo o app

| | |
|---|---|
| **Issue** | [#120](https://github.com/JoaoSipauba/leviticus/issues/120) |
| **Status** | Aprovado — pronto pra plano de implementação |
| **Autor** | João Sipauba |
| **Data** | 22/05/2026 |

---

## 1. Problema

A aba **Papéis** de Organização mostra um banner "Em construção" porque a
aplicação dos checks de permissão no resto do app é incompleta. Definir uma
permissão num papel ainda não esconde/mostra a ação correspondente na maioria
das telas.

### Achado da investigação — não é buraco de segurança nas tabelas

As políticas RLS em [20260506000003_rls_policies.sql](../../../supabase/migrations/20260506000003_rls_policies.sql)
**já gateiam todos os writes nas tabelas** (`songs`, `groups`, `playlists`,
`playlist_songs`, `roles`, `organization_members`, `org_invite_codes`) via a
função `has_permission()`, que inclui `OR is_org_owner()`. Um membro sem
`add_songs` que insere direto numa tabela é bloqueado pelo banco.

### Achado da investigação — gap real na camada de RPCs

3 RPCs `SECURITY DEFINER` **não têm nenhuma checagem de permissão** e bypassam
o RLS:

- `update_song` ([20260507000006](../../../supabase/migrations/20260507000006_update_song_rpc.sql)) — sem check; o `INSERT ... ON CONFLICT DO UPDATE` permite editar **e inserir** músicas.
- `update_song_groups` ([20260507000004](../../../supabase/migrations/20260507000004_update_song_groups_rpc.sql)) — check `is_org_member` foi explicitamente removido.
- `reorder_playlist_songs` ([20260507000008](../../../supabase/migrations/20260507000008_reorder_playlist_songs_rpc.sql)) — sem check.

Os checks foram removidos por causa de um bug histórico ("`auth.uid()` não
propaga via tauriFetch no Tauri v2"). Esse bug **já não existe** — os RPCs de
playlist ([20260508100002](../../../supabase/migrations/20260508100002_playlist_rpcs.sql)),
mais recentes, chamam `auth.uid()`/`has_permission` com sucesso. Logo, dá pra
reaplicar os checks.

`delete_song` e os RPCs de playlist **já checam** permissão corretamente.

## 2. Objetivo

1. **UI:** esconder por completo qualquer controle de ação que o usuário não
   tem permissão pra executar.
2. **Backend:** fechar o gap dos 3 RPCs sem check.
3. **Erros:** se um write de permissão escapar do gating, transformar o erro
   de RLS/RPC numa mensagem amigável em pt-BR.
4. Remover o banner "Em construção" de [OrgRoles.tsx:194](../../../apps/desktop/src/pages/org/OrgRoles.tsx).

### Não-objetivos

- Reescrever o modelo de permissões — os 8 valores de `Permission` ficam como
  estão (`add_songs`, `manage_songs`, `manage_groups`, `manage_playlists`,
  `add_songs_to_playlist`, `manage_members`, `manage_roles`, `manage_integrations`).
- Gatear operações puramente locais (remover do dispositivo, exportar MP3,
  tocar) — não tocam o servidor, qualquer membro pode.
- Permissões com escopo de grupo (`user_role_assignments.group_id`) — o gating
  de UI usa permissão global do usuário; o escopo por grupo continua valendo
  só no RLS. Refinar isso é follow-up.

## 3. Arquitetura — store de permissões

Novo `apps/desktop/src/store/permissions.ts` (Zustand), no padrão dos stores
existentes (`integrations`, `player`).

```ts
type PermissionsState = {
  perms: Set<Permission>
  isOwner: boolean
  loaded: boolean
  refresh: (orgId: string) => Promise<void>
  clear: () => void
}
```

- `refresh(orgId)` — uma query no SQLite local (tabelas `user_role_assignments`
  + `role_permissions`, já sincronizadas) pegando todas as permissões do
  usuário atual de uma vez, mais o check de owner contra `orgs.owner_id`.
  Popula `perms`, `isOwner`, `loaded`.
- `clear()` — zera no logout e na troca de org.

Hook seletor:

```ts
// true se o usuário tem a permissão (owner sempre tem tudo).
export function usePermission(perm: Permission): boolean
```

Retorna `isOwner || perms.has(perm)` — **síncrono no render**, sem flash de
controle aparecendo e sumindo.

**Quando `refresh` é chamado:**
- Boot, após o `syncOrg` inicial em [App.tsx](../../../apps/desktop/src/App.tsx).
- Sync reativo em [data-sync.ts](../../../apps/desktop/src/lib/data-sync.ts) —
  quando `role_permissions` ou `user_role_assignments` mudam (mudança de papel
  reflete na UI sem reabrir o app).
- Troca de org.

**Migração:** os callers async atuais de `hasPermission`/`isOwner`
(`OrgManage`, `OrgMembers`, `OrgInfo`, `OrgIntegrations`, `OrgDanger`,
`AddSongToPlaylistModal`) passam a usar o store. As funções async
`hasPermission`/`isOwner` de [lib/permissions.ts](../../../apps/desktop/src/lib/permissions.ts)
são removidas — fonte única. A query SQL de permissões vive no `refresh` do store.

## 4. Gating de UI — controles escondidos

Cada controle abaixo só renderiza quando `usePermission(...)` é `true`.

| Controle | Permissão | Arquivo |
|---|---|---|
| "Adicionar" / "Adicionar primeira música" | `add_songs` | `pages/Library.tsx` |
| Editar música (menu do card) | `manage_songs` | `components/SongCard.tsx` |
| Excluir música (servidor) | `manage_songs` | `components/SongCard.tsx` |
| "Novo" / "Criar primeiro ministério" | `manage_groups` | `pages/Groups.tsx` |
| Editar / excluir ministério | `manage_groups` | `pages/GroupDetail.tsx` |
| "Novo culto" / "Criar primeiro culto" | `manage_playlists` | `pages/Playlists.tsx` |
| Editar / excluir culto (menu do card) | `manage_playlists` | `pages/Playlists.tsx`, `pages/PlaylistDetail.tsx` |
| Adicionar / excluir / renomear seção | `manage_playlists` | `pages/PlaylistDetail.tsx` |
| "Adicionar música" ao culto | `add_songs_to_playlist` | `pages/PlaylistDetail.tsx` |
| Remover música do culto | `manage_playlists` | `components/SongCard.tsx`, `pages/PlaylistDetail.tsx` |

**Não gateado:** "Remover do dispositivo", "Exportar MP3", tocar — operações
locais. Org tabs (`manage_members` / `manage_roles` / `manage_integrations`) já
são gateadas hoje; só migram a fonte do check de `hasPermission` async pro store.

Quando esconder um controle de linha (ex: editar/excluir num `SongCard`)
deixar o card sem nenhuma ação, o card continua renderizando normalmente — só
sem o menu/botões. Telas que ficariam sem nenhuma ação primária (ex: Library
sem `add_songs`) mostram só a lista, sem o empty-state que convida a criar.

## 5. Correção de RPCs backend

Nova migration `supabase/migrations/20260522000002_rpc_permission_checks.sql`
(`CREATE OR REPLACE` — retrocompatível; app antigo chama a mesma assinatura e
passa a ser checado, comportamento correto).

| RPC | Check a adicionar | Retorno |
|---|---|---|
| `update_song` | `is_org_owner OR has_permission(manage_songs)`. O caminho de insert (música nova) exige `add_songs`. | `void` → envelope `{ok, error}` |
| `update_song_groups` | `is_org_owner OR has_permission(manage_songs)` | `void` → envelope `{ok, error}` |
| `reorder_playlist_songs` | `is_org_owner OR has_permission(manage_playlists)` | `void` → envelope `{ok, error}` |
| `add_song_to_playlist` | aceitar **`add_songs_to_playlist` OU `manage_playlists`** (hoje só aceita `manage_playlists`) — alinha o RPC à intenção da permissão e ao RLS da tabela | mantém envelope |

Os 3 primeiros retornam `void` hoje; passam pro envelope `{ok, error}` — padrão
de `delete_song` v2 e dos RPCs de playlist — pra o erro de permissão chegar ao
client (o `tauri-plugin-http` engole o corpo de respostas 4xx). Os call sites
no app são atualizados pra ler o envelope.

> Mudança de tipo de retorno (`void` → `jsonb`): exige `DROP FUNCTION` antes do
> `CREATE` na migration, como feito no `delete_song` v2.

## 6. Erros amigáveis

Helper em [lib/permissions.ts](../../../apps/desktop/src/lib/permissions.ts)
(ou novo `lib/errors.ts`):

```ts
// Detecta erro de permissão vindo de RLS (Postgres 42501) ou de envelope
// de RPC (error: 'forbidden'). Retorna mensagem pt-BR ou null se não for.
export function permissionErrorMessage(err: unknown): string | null
```

Mensagem: `"Você não tem permissão para esta ação."`

Aplicado nos `catch` dos writes que podem dar erro de permissão — rede de
segurança caso algum gating escape (ex: papel revogado entre o render e o
clique). Conforme CLAUDE.md: logar o erro cru (`console.error` /
`captureException`) antes de exibir a versão amigável via `toastError`.

## 7. Estratégia de testes

| Camada | Cobertura |
|---|---|
| Unit | `store/permissions.test.ts` — `refresh` popula `perms`; owner → `usePermission` true pra tudo; `clear` zera. `permissionErrorMessage` mapeia `42501` e `forbidden`, retorna `null` pra outros erros. |
| Component | Para cada página com gating (Library, Groups, GroupDetail, Playlists, PlaylistDetail, SongCard): teste "esconde controle sem permissão" + "mostra com permissão", mockando o `usePermissionsStore`. |
| RPC | Os 3 RPCs corrigidos + `add_song_to_playlist`: validar que membro sem permissão é bloqueado. Via teste SQL de integração se houver harness; senão, validação manual documentada no PR. |

O banner "Em construção" de `OrgRoles.tsx` só é removido na **última** etapa,
depois de todo o gating estar no lugar e verde.

## 8. Ordem de implementação (alto nível)

1. Store `permissions.ts` + hook + `refresh` plugado no ciclo de sync.
2. Migrar callers async existentes pro store; remover `hasPermission`/`isOwner` async.
3. Migration de correção dos RPCs + atualização dos call sites.
4. Helper `permissionErrorMessage` + aplicação nos `catch`.
5. Gating de UI página por página (Library → Groups → GroupDetail → Playlists → PlaylistDetail → SongCard).
6. Remover o banner "Em construção".
