import type { BackupStatus } from './types.js'
import { getDb } from '../db.js'
import { supabase } from '../supabase.js'

/**
 * Transições válidas do backup_status.
 * - pending: padrão; ainda não subiu.
 * - uploaded: subiu com sucesso.
 * - failed: falhou após retries — pendente investigação.
 * - no_account: nenhum cloud_storage_account ativo na org.
 */
const VALID_TRANSITIONS: Record<BackupStatus, BackupStatus[]> = {
  pending: ['uploaded', 'failed', 'no_account'],
  uploaded: ['pending', 'failed'],          // pending se o arquivo foi apagado do Drive
  failed: ['pending', 'uploaded'],          // retry pode levar a uploaded ou voltar a pending
  no_account: ['pending'],                  // ao conectar, vai pra pending
}

export function canTransition(from: BackupStatus, to: BackupStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Atualiza backup_status no Supabase + cache local. Valida transição.
 * Lança se transição inválida.
 */
export async function setBackupStatus(
  songId: string,
  to: BackupStatus,
  extras?: { cloud_file_id?: string | null; cloud_file_size?: number | null; cloud_file_hash?: string | null }
): Promise<void> {
  const db = await getDb()
  const rows = await db.select<{ backup_status: BackupStatus }[]>(
    `SELECT backup_status FROM songs WHERE id = ?`,
    [songId]
  )
  const from = rows[0]?.backup_status ?? 'pending'
  if (from === to && !extras) return  // no-op
  if (from !== to && !canTransition(from, to)) {
    throw new Error(`Invalid backup_status transition: ${from} -> ${to}`)
  }

  const update: Record<string, unknown> = { backup_status: to }
  if (extras?.cloud_file_id !== undefined) update.cloud_file_id = extras.cloud_file_id
  if (extras?.cloud_file_size !== undefined) update.cloud_file_size = extras.cloud_file_size
  if (extras?.cloud_file_hash !== undefined) update.cloud_file_hash = extras.cloud_file_hash

  const { error } = await supabase.from('songs').update(update).eq('id', songId)
  if (error) throw new Error(`Supabase update failed: ${error.message}`)

  // Atualiza cache local
  const setClauses = Object.keys(update).map((k) => `${k} = ?`).join(', ')
  const values = Object.values(update)
  await db.execute(`UPDATE songs SET ${setClauses} WHERE id = ?`, [...values, songId])
}
