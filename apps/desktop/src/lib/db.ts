import Database from '@tauri-apps/plugin-sql'

let _dbPromise: Promise<Database> | null = null

export function getDb(): Promise<Database> {
  if (!_dbPromise) {
    _dbPromise = Database.load('sqlite:leviticus.db').then(async db => {
      await db.execute('PRAGMA foreign_keys = ON')
      return db
    })
  }
  return _dbPromise
}

export async function getLastSync(orgId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<{ value: string }[]>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [`last_sync_${orgId}`]
  )
  return rows[0]?.value ?? null
}

/**
 * @param iso ISO 8601 UTC timestamp string, e.g. "2026-05-06T12:00:00.000Z"
 */
export async function setLastSync(orgId: string, iso: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    [`last_sync_${orgId}`, iso]
  )
}
