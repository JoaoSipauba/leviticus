import { useEffect, useState } from 'react'
import { getDb } from '../lib/db.js'

type GroupRow = { id: string; name: string; org_id: string }

export function Groups() {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  useEffect(() => {
    getDb().then(db =>
      db.select<GroupRow[]>('SELECT * FROM groups WHERE org_id = ? ORDER BY name', [orgId])
    ).then(setGroups)
  }, [orgId])

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">Grupos</h2>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="p-4 bg-gray-900 rounded-xl">
            <p className="font-medium">{g.name}</p>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">Nenhum grupo encontrado.</p>
        )}
      </div>
    </div>
  )
}
