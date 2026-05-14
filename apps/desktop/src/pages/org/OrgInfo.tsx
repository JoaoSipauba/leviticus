import { useEffect, useState } from 'react'
import { Users, LayoutGrid, CalendarDays, Home } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { getDb } from '../../lib/db.js'
import { syncOrg } from '../../lib/sync.js'
import { hasPermission } from '../../lib/permissions.js'

type Stats = { members: number; ministries: number; playlists: number }
type Form = { name: string; city: string; timezone: string }

export function OrgInfo({ orgId }: { orgId: string }) {
  const [stats, setStats] = useState<Stats>({ members: 0, ministries: 0, playlists: 0 })
  const [form, setForm] = useState<Form>({ name: '', city: '', timezone: 'America/Sao_Paulo' })
  const [original, setOriginal] = useState<Form>({ name: '', city: '', timezone: 'America/Sao_Paulo' })
  const [canEdit, setCanEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const db = await getDb()
    const [orgRows, m, g, p, canEditNow] = await Promise.all([
      db.select<{ name: string; city: string | null; timezone: string }[]>(
        `SELECT name, city, timezone FROM orgs WHERE id = ?`, [orgId]
      ),
      db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM organization_members WHERE org_id = ?`, [orgId]),
      db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM groups WHERE org_id = ?`, [orgId]),
      db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM playlists WHERE org_id = ?`, [orgId]),
      hasPermission('manage_members', orgId),
    ])
    setStats({ members: m[0]?.cnt ?? 0, ministries: g[0]?.cnt ?? 0, playlists: p[0]?.cnt ?? 0 })
    if (orgRows[0]) {
      const f: Form = {
        name: orgRows[0].name,
        city: orgRows[0].city ?? '',
        timezone: orgRows[0].timezone,
      }
      setForm(f); setOriginal(f)
    }
    setCanEdit(canEditNow)
  }

  useEffect(() => { void load() }, [orgId])

  const dirty = form.name !== original.name || form.city !== original.city || form.timezone !== original.timezone

  async function handleSave() {
    if (!dirty || !canEdit) return
    if (!form.name.trim()) { setError('Nome obrigatório.'); return }
    setSaving(true); setError(null)
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ name: form.name.trim(), city: form.city.trim() || null, timezone: form.timezone.trim() || 'America/Sao_Paulo' })
      .eq('id', orgId)
    if (updateError) {
      console.error(updateError)
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }
    await syncOrg(orgId)
    await load()
    setSaving(false)
  }

  const STAT_CARDS = [
    { label: 'Membros', value: stats.members, bg: 'linear-gradient(135deg,#1e3a8a,#2563eb)', stroke: '#93c5fd', Icon: Users },
    { label: 'Ministérios', value: stats.ministries, bg: 'linear-gradient(135deg,#14532d,#16a34a)', stroke: '#86efac', Icon: LayoutGrid },
    { label: 'Cultos cadastrados', value: stats.playlists, bg: 'linear-gradient(135deg,#4c1d95,#7c3aed)', stroke: '#c4b5fd', Icon: CalendarDays },
  ]

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {STAT_CARDS.map((c) => (
          <div key={c.label}
            style={{ background: 'linear-gradient(135deg,#13131f,#161625)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '16px 18px' }}>
            <div className="flex items-center justify-center mb-[10px]" style={{ width: 32, height: 32, borderRadius: 8, background: c.bg }}>
              <c.Icon size={16} stroke={c.stroke} strokeWidth={2} />
            </div>
            <div className="text-[24px] font-bold leading-none mb-1" style={{ color: '#f3f4f6', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
            <div className="text-[11px] uppercase font-semibold" style={{ color: '#9ca3af', letterSpacing: '0.04em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'linear-gradient(135deg,#13131f,#161625)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
        <div className="flex items-center gap-4 pb-[18px] mb-[18px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-center flex-shrink-0"
            style={{ width: 64, height: 64, borderRadius: 14, background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 8px 24px -8px rgba(37,99,235,0.5)' }}>
            <Home size={28} color="#93c5fd" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[18px] font-bold" style={{ color: '#f3f4f6' }}>{original.name || '—'}</div>
            <div className="text-[12px] mt-[2px]" style={{ color: '#9ca3af' }}>ID: {orgId.slice(0, 8)}…{orgId.slice(-4)}</div>
          </div>
        </div>

        <div className="mb-[14px]">
          <label className="block text-[11px] font-semibold uppercase mb-[6px]" style={{ color: '#9ca3af', letterSpacing: '0.04em' }}>Nome da organização</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            disabled={!canEdit}
            className="w-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, color: '#f3f4f6', outline: 'none', opacity: canEdit ? 1 : 0.6 }}
          />
        </div>

        <div className="flex gap-3 mb-[14px]">
          <div style={{ flex: 1 }}>
            <label className="block text-[11px] font-semibold uppercase mb-[6px]" style={{ color: '#9ca3af', letterSpacing: '0.04em' }}>Cidade (opcional)</label>
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              disabled={!canEdit}
              placeholder="Ex: São Paulo, SP"
              className="w-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, color: '#f3f4f6', outline: 'none', opacity: canEdit ? 1 : 0.6 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="block text-[11px] font-semibold uppercase mb-[6px]" style={{ color: '#9ca3af', letterSpacing: '0.04em' }}>Fuso horário</label>
            <input
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              disabled={!canEdit}
              className="w-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, color: '#f3f4f6', outline: 'none', opacity: canEdit ? 1 : 0.6 }}
            />
          </div>
        </div>

        {error && <p className="text-[13px] mb-2" style={{ color: '#f87171' }}>{error}</p>}

        {canEdit && (
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => setForm(original)}
              disabled={!dirty || saving}
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', cursor: (!dirty || saving) ? 'default' : 'pointer', opacity: (!dirty || saving) ? 0.4 : 1 }}
            >Cancelar</button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: '#2563eb', border: 'none', color: '#fff', cursor: (!dirty || saving) ? 'default' : 'pointer', opacity: (!dirty || saving) ? 0.4 : 1 }}
            >{saving ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
