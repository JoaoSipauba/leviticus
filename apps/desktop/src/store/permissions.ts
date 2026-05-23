import { create } from 'zustand'
import type { Permission } from '@leviticus/core'
import { getDb } from '../lib/db.js'
import { useAuthStore } from './auth.js'

type PermissionsState = {
  /** Permissões globais do usuário na org atual. */
  perms: Set<Permission>
  /** true se o usuário é dono da org — owner tem todas as permissões. */
  isOwner: boolean
  /** true após o primeiro refresh resolver. */
  loaded: boolean
  /** Recarrega perms+owner do SQLite local. Chamar após cada syncOrg. */
  refresh: (orgId: string) => Promise<void>
  /** Zera (logout / troca de org). */
  clear: () => void
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  perms: new Set(),
  isOwner: false,
  loaded: false,
  refresh: async (orgId) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId || !orgId) {
      set({ perms: new Set(), isOwner: false, loaded: true })
      return
    }
    const db = await getDb()
    const ownerRows = await db.select<{ owner_id: string }[]>(
      'SELECT owner_id FROM orgs WHERE id = ?',
      [orgId],
    )
    // Só assignments globais (group_id IS NULL) — espelha o has_permission
    // do RLS pra ações globais. Permissão com escopo de grupo é follow-up.
    const permRows = await db.select<{ permission: Permission }[]>(
      `SELECT DISTINCT rp.permission
       FROM user_role_assignments a
       JOIN role_permissions rp ON rp.role_id = a.role_id
       WHERE a.user_id = ? AND a.org_id = ? AND a.group_id IS NULL`,
      [userId, orgId],
    )
    set({
      perms: new Set(permRows.map((r) => r.permission)),
      isOwner: ownerRows[0]?.owner_id === userId,
      loaded: true,
    })
  },
  clear: () => set({ perms: new Set(), isOwner: false, loaded: false }),
}))

/**
 * Hook síncrono: true se o usuário pode executar `perm` (owner sempre pode).
 * Esconder controles com `{usePermission('add_songs') && <Botão/>}`.
 */
export function usePermission(perm: Permission): boolean {
  return usePermissionsStore((s) => s.isOwner || s.perms.has(perm))
}
