import { getDb } from '../db.js'

export type PendingSong = {
  id: string
  title: string
  artist: string
  backup_status: 'pending' | 'failed' | 'no_account'
  original_format: string | null
}

/**
 * Conta músicas com backup pendente OU falhado (qualquer estado != 'uploaded').
 * Inclui 'no_account' (Drive não conectado ainda).
 */
export async function countPendingBackup(orgId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ cnt: number }[]>(
    "SELECT COUNT(*) as cnt FROM songs WHERE org_id = ? AND backup_status != 'uploaded'",
    [orgId]
  )
  return rows[0]?.cnt ?? 0
}

/** Lista músicas pendentes pra mostrar na UI ou alimentar o sync-worker. */
export async function listPendingBackupSongs(orgId: string): Promise<PendingSong[]> {
  const db = await getDb()
  return db.select<PendingSong[]>(
    "SELECT id, title, artist, backup_status, original_format FROM songs " +
    "WHERE org_id = ? AND backup_status != 'uploaded' ORDER BY created_at ASC",
    [orgId]
  )
}

/**
 * Estima o total de bytes que vão precisar ser carregados.
 * Usa cloud_file_size cacheado quando existe (uploads parciais);
 * caso contrário retorna 0 (não dá pra estimar sem ler o arquivo local).
 */
export async function getPendingTotalBytes(orgId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(cloud_file_size), 0) as total FROM songs " +
    "WHERE org_id = ? AND backup_status != 'uploaded'",
    [orgId]
  )
  return rows[0]?.total ?? 0
}
