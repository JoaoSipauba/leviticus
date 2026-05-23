import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase.js'
import { syncOrg } from './sync.js'
import { useUIStore } from '../store/ui.js'
import { usePermissionsStore } from '../store/permissions.js'
import { captureException } from './observability.js'

// Sync reativo: escuta mudanças no Supabase (Realtime) E refocus da janela,
// dispara `syncOrg` debounced pra atualizar o SQLite local. Antes desse
// módulo, dados só sincronizavam no boot — mudanças feitas por outro
// device/membro só apareciam após reabrir o app. Issue #16.

// Tabelas relevantes pro org. `*` cobre INSERT/UPDATE/DELETE. Filtramos
// por `org_id=eq.{orgId}` quando a tabela tem essa coluna (impede
// vazamento de mudanças de outras orgs).
const ORG_TABLES = [
  // Direto org_id
  { table: 'songs', filter: true },
  { table: 'playlists', filter: true },
  { table: 'groups', filter: true },
  { table: 'organization_members', filter: true },
  { table: 'roles', filter: true },
  { table: 'org_invite_codes', filter: true },
  { table: 'organizations', filter: false }, // filtrado por id, não org_id — listener simples
  // Tabelas-filhas que dependem de FK pra song/playlist/role do org.
  // RLS no Supabase já garante que o usuário só recebe eventos do org dele,
  // então não filtramos client-side (filter por FK é complicado em
  // postgres_changes).
  { table: 'playlist_songs', filter: false },
  { table: 'song_groups', filter: false },
  { table: 'role_permissions', filter: false },
  { table: 'user_role_assignments', filter: false },
] as const

const DEBOUNCE_MS = 500

let channel: RealtimeChannel | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let focusListener: (() => void) | null = null
let currentOrgId: string | null = null

function scheduleSync(orgId: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    syncOrg(orgId)
      .then(() => {
        // Bump pra forçar re-render de páginas que dependem do librarySeed.
        // Sem isso, componentes ficam com state cacheado e o usuário não vê
        // a mudança até navegar.
        useUIStore.getState().bumpLibrary()
        const currentOrg = localStorage.getItem('leviticus_org_id')
        if (currentOrg) {
          void usePermissionsStore.getState().refresh(currentOrg).catch(
            (e) => captureException(e, { feature: 'sync', step: 'permissions-refresh' })
          )
        }
      })
      .catch((e) => captureException(e, { feature: 'sync', step: 'reactive-pass' }))
  }, DEBOUNCE_MS)
}

/**
 * Liga sync reativo pro org. Idempotente — pode chamar várias vezes; só
 * uma subscription fica ativa. Chamar de novo com orgId diferente reseta
 * o canal pro novo org.
 */
export function startOrgDataSync(orgId: string): void {
  if (currentOrgId === orgId && channel) return
  stopOrgDataSync()
  currentOrgId = orgId

  // ── Realtime: postgres_changes em todas as tabelas relevantes ────────────
  // WebKit do macOS trata `tauri://localhost` como insecure context e bloqueia
  // WebSocket — `new WebSocket()` lança "The operation is insecure". O cliente
  // Realtime do Supabase tenta abrir wss síncronamente em .subscribe() e o
  // erro propaga, crashando o app inteiro pela ErrorBoundary. Wrap em
  // try/catch garante degradação graciosa pra só focus refresh + polling
  // implícito do startSyncWorker, que cobrem 80% dos casos.
  try {
    channel = supabase.channel(`org-data:${orgId}`)
    for (const { table, filter } of ORG_TABLES) {
      const opts: Record<string, unknown> = { event: '*', schema: 'public', table }
      if (filter) opts.filter = `org_id=eq.${orgId}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel.on('postgres_changes', opts as any, () => {
        if (currentOrgId) scheduleSync(currentOrgId)
      })
    }
    channel.subscribe()
  } catch (e) {
    // WebSocket insecure / Realtime indisponível — segue sem ele. Window
    // focus listener (abaixo) ainda dispara syncOrg, e sync-worker normal
    // de 5min cobre o resto.
    console.warn('[data-sync] Realtime indisponível, usando só focus + polling:', e)
    channel = null
  }

  // ── Refocus: window ganha foco → sync (safety net pra quando Realtime ────
  // desconecta silenciosamente, ex: app em background no macOS).
  focusListener = () => {
    if (currentOrgId && navigator.onLine) scheduleSync(currentOrgId)
  }
  window.addEventListener('focus', focusListener)
}

export function stopOrgDataSync(): void {
  if (channel) {
    void supabase.removeChannel(channel)
    channel = null
  }
  if (focusListener) {
    window.removeEventListener('focus', focusListener)
    focusListener = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  currentOrgId = null
}
