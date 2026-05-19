import { getDb } from '../db.js'

/**
 * Soma o tamanho total (em bytes) das músicas da org que já estão com backup
 * no Drive (backup_status = 'uploaded'). Usado pra calcular quanto da quota
 * do Drive está ocupado pela pasta Leviticus.
 *
 * Por que não usar `storageQuota` do Drive API: a API só retorna o uso TOTAL
 * da conta (Drive + Gmail + Photos + apps). Não dá pra extrair "só Leviticus"
 * daí. E `files.list` com soma seria caro (round-trip + paginação).
 *
 * O DB local é fonte da verdade pro que o app subiu — sync-worker mantém
 * `cloud_file_size` atualizado em cada upload bem-sucedido.
 *
 * Issue #81.
 */
export async function getLeviticusUsedBytes(orgId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ total: number | null }[]>(
    `SELECT COALESCE(SUM(cloud_file_size), 0) AS total
     FROM songs
     WHERE org_id = ? AND backup_status = 'uploaded' AND cloud_file_size IS NOT NULL`,
    [orgId]
  )
  return rows[0]?.total ?? 0
}
