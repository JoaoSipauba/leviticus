import { useCallback, useRef } from 'react'
import { getDb } from './db.js'

type RouteKey = 'library' | 'playlists' | 'groups'

async function prefetchLibrary(orgId: string): Promise<void> {
  const db = await getDb()
  await db.select('SELECT id FROM songs WHERE org_id = ? ORDER BY created_at DESC LIMIT 1', [orgId])
}

async function prefetchPlaylists(orgId: string): Promise<void> {
  const db = await getDb()
  await db.select('SELECT id FROM playlists WHERE org_id = ? ORDER BY scheduled_at ASC LIMIT 1', [orgId])
}

async function prefetchGroups(orgId: string): Promise<void> {
  const db = await getDb()
  await db.select('SELECT id FROM groups WHERE org_id = ? ORDER BY name LIMIT 1', [orgId])
}

const ROUTE_QUERIES: Record<RouteKey, (orgId: string) => Promise<void>> = {
  library: prefetchLibrary,
  playlists: prefetchPlaylists,
  groups: prefetchGroups,
}

export function usePrefetchRoute() {
  const warmed = useRef(new Set<string>())

  const prefetch = useCallback((routeKey: string) => {
    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    if (!orgId) return
    const cacheKey = `${routeKey}:${orgId}`
    if (warmed.current.has(cacheKey)) return
    warmed.current.add(cacheKey)

    const fn = ROUTE_QUERIES[routeKey as RouteKey]
    if (!fn) return

    fn(orgId).catch((e: unknown) => {
      console.debug('[usePrefetchRoute] prefetch failed for', routeKey, e)
      // Remove from cache so a future hover can retry
      warmed.current.delete(cacheKey)
    })
  }, [])

  return { prefetch }
}
