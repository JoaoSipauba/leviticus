import Database from '@tauri-apps/plugin-sql'

let _db: Database | null = null

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load('sqlite:leviticus.db')
  }
  return _db
}

export async function getLastSync(orgId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<{ value: string }[]>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [`last_sync_${orgId}`]
  )
  return rows[0]?.value ?? null
}

export async function setLastSync(orgId: string, iso: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    [`last_sync_${orgId}`, iso]
  )
}
