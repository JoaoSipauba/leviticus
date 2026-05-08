import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { Playlist } from '@leviticus/core'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { getDb } from '../lib/db.js'
import { isDownloaded } from '../lib/ytdlp.js'

type ServiceWithStatus = Playlist & { total: number; downloaded: number }

const SERVICE_COLORS = [
  { bg: 'linear-gradient(135deg,#1e3a8a,#2563eb)', icon: '#93c5fd' },
  { bg: 'linear-gradient(135deg,#4c1d95,#7c3aed)', icon: '#c4b5fd' },
  { bg: 'linear-gradient(135deg,#164e63,#0891b2)', icon: '#a5f3fc' },
  { bg: 'linear-gradient(135deg,#14532d,#16a34a)', icon: '#86efac' },
  { bg: 'linear-gradient(135deg,#7c2d12,#ea580c)', icon: '#fed7aa' },
  { bg: 'linear-gradient(135deg,#831843,#db2777)', icon: '#fbcfe8' },
]

function getServiceColor(id: string) {
  const sum = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return SERVICE_COLORS[sum % SERVICE_COLORS.length]
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  // Aceita tanto YYYY-MM-DD (legado) quanto ISO 8601 com hora.
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function Playlists() {
  const [services, setServices] = useState<ServiceWithStatus[]>([])
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const orgId = localStorage.getItem('leviticus_org_id') ?? ''

  async function loadServices() {
    const db = await getDb()
    const rows = await db.select<Playlist[]>(
      `SELECT * FROM playlists WHERE org_id = ?
       ORDER BY scheduled_at DESC, created_at DESC`,
      [orgId]
    )
    const withStatus = await Promise.all(
      rows.map(async (p) => {
        const songs = await db.select<{ song_id: string }[]>(
          'SELECT song_id FROM playlist_songs WHERE playlist_id = ?',
          [p.id]
        )
        const checks = await Promise.all(songs.map((s) => isDownloaded(s.song_id)))
        return { ...p, total: songs.length, downloaded: checks.filter(Boolean).length }
      })
    )
    setServices(withStatus)
  }

  useEffect(() => { loadServices().catch(console.error) }, [orgId])

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Usuário não autenticado.')
      setSaving(false)
      return
    }

    // TODO(commit 3): Trocar pelo PlaylistFormModal com hora de início/fim;
    // por enquanto preenchemos default 09h–11h pra satisfazer o NOT NULL do schema.
    const baseDate = newDate || new Date().toISOString().slice(0, 10)
    const startISO = new Date(baseDate + 'T09:00:00').toISOString()
    const endISO = new Date(baseDate + 'T11:00:00').toISOString()
    const { data, error: insertError } = await supabase
      .from('playlists')
      .insert({
        org_id: orgId,
        name: newName.trim(),
        scheduled_at: startISO,
        scheduled_end: endISO,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError || !data) {
      console.error('[handleCreate] insertError:', insertError)
      setError(insertError?.message ?? 'Erro ao criar culto.')
      setSaving(false)
      return
    }

    try {
      await syncOrg(orgId)
      await loadServices()
      setNewName('')
      setNewDate('')
      setShowModal(false)
    } catch {
      setError('Erro ao sincronizar após criação.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '10px 12px',
    color: '#f3f4f6', outline: 'none',
    fontSize: 14, minHeight: 44,
    boxSizing: 'border-box' as const,
  }

  return (
    <div className="p-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold" style={{ color: '#f3f4f6', fontSize: 18 }}>
            Cultos
          </h2>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Setlists por data de culto
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 font-semibold text-white"
          style={{
            background: '#2563eb', border: 'none',
            borderRadius: 10, padding: '8px 14px',
            fontSize: 13, cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo culto
        </button>
      </div>

      {/* List */}
      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <CalendarDays size={40} color="#4b5563" strokeWidth={1.5} />
          <div className="text-center">
            <p className="font-semibold" style={{ color: '#6b7280', fontSize: 15 }}>
              Nenhum culto ainda
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm mt-1"
              style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Criar primeiro culto
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((s) => {
            const color = getServiceColor(s.id)
            const complete = s.total > 0 && s.downloaded === s.total
            const partial = s.downloaded > 0 && s.downloaded < s.total
            const dateStr = formatDate(s.scheduled_at)

            return (
              <div
                key={s.id}
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                style={{
                  background: 'linear-gradient(135deg,#13131f,#161625)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 12, padding: '14px 16px',
                }}
              >
                {/* Icon */}
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: complete
                      ? 'linear-gradient(135deg,#14532d,#16a34a)'
                      : s.total > 0
                      ? 'linear-gradient(135deg,#78350f,#d97706)'
                      : color.bg,
                  }}
                >
                  {complete ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  ) : s.total > 0 ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fde68a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><line x1="3" y1="9" x2="21" y2="9"/><path d="M8 3v6M16 3v6"/>
                    </svg>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: '#f3f4f6', fontSize: 14 }}>
                    {s.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {dateStr && (
                      <span style={{ color: '#6b7280', fontSize: 12 }}>{dateStr}</span>
                    )}
                    {s.total > 0 && (
                      <>
                        {dateStr && <span style={{ width: 3, height: 3, background: '#4b5563', borderRadius: '50%', display: 'inline-block' }} />}
                        <span
                          style={{
                            fontSize: 12, fontWeight: 500,
                            color: complete ? '#22c55e' : s.total > 0 && !complete ? '#f59e0b' : '#6b7280',
                          }}
                        >
                          {s.downloaded}/{s.total} baixadas
                        </span>
                      </>
                    )}
                    {s.total === 0 && (
                      <span style={{ color: '#4b5563', fontSize: 12 }}>Sem músicas</span>
                    )}
                  </div>
                  {partial && (
                    <div className="mt-1.5 rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.09)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(s.downloaded / s.total) * 100}%`,
                          background: '#f59e0b',
                        }}
                      />
                    </div>
                  )}
                </div>

                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9,18 15,12 9,6"/>
                </svg>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setNewName(''); setNewDate(''); setError(null) } }}
        >
          <div
            style={{
              background: '#13131f', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, padding: 24, width: 300,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            <h3 className="font-bold mb-5" style={{ color: '#f3f4f6', fontSize: 16 }}>
              Novo culto
            </h3>

            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                Nome
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Culto Domingo Manhã"
                style={inputStyle}
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                Data{' '}
                <span style={{ color: '#4b5563', fontWeight: 400 }}>(opcional)</span>
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />
            </div>

            {error && <p className="text-sm mb-3" style={{ color: '#ef4444' }}>{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowModal(false); setNewName(''); setNewDate(''); setError(null) }}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: 9,
                  fontSize: 13, fontWeight: 600,
                  color: '#9ca3af', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                style={{
                  flex: 1,
                  background: (saving || !newName.trim()) ? 'rgba(37,99,235,0.4)' : '#2563eb',
                  border: 'none', borderRadius: 10, padding: 9,
                  fontSize: 13, fontWeight: 600,
                  color: '#fff', cursor: (saving || !newName.trim()) ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
