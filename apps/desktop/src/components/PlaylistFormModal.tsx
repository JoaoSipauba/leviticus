import { useEffect, useState } from 'react'
import { Calendar, Clock, X, Loader2 } from 'lucide-react'
import type { Playlist } from '@leviticus/core'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: (playlistId: string) => void
  // Quando preenchido, modal age em modo edição.
  editing?: Playlist | null
}

// Pega "YYYY-MM-DD" da timezone local (não UTC).
function isoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoTimeLocal(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function PlaylistFormModal({ open, onClose, onSaved, editing }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('11:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editing) {
      const start = new Date(editing.scheduled_at)
      const end = new Date(editing.scheduled_end)
      setName(editing.name)
      setDate(isoDateLocal(start))
      setStartTime(isoTimeLocal(start))
      setEndTime(isoTimeLocal(end))
    } else {
      const today = new Date()
      setName('')
      setDate(isoDateLocal(today))
      setStartTime('09:00')
      setEndTime('11:00')
    }
    setError(null)
  }, [open, editing])

  async function handleSave() {
    if (!name.trim()) {
      setError('Dê um nome ao culto.')
      return
    }
    if (!date || !startTime || !endTime) {
      setError('Preencha data, hora de início e hora de término.')
      return
    }

    const start = new Date(`${date}T${startTime}:00`)
    const end = new Date(`${date}T${endTime}:00`)
    if (end <= start) {
      setError('A hora de término precisa ser depois da hora de início.')
      return
    }
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    if (!editing && start < todayMidnight) {
      setError('Não dá para criar um culto em um dia que já passou.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const orgId = localStorage.getItem('leviticus_org_id') ?? ''
      if (!orgId) throw new Error('Organização não selecionada.')

      if (editing) {
        const { data, error: e } = await supabase.rpc('update_playlist', {
          p_id: editing.id,
          p_name: name.trim(),
          p_scheduled_at: start.toISOString(),
          p_scheduled_end: end.toISOString(),
        })
        if (e) {
          console.error('[PlaylistFormModal] update error:', e)
          throw new Error('Não foi possível salvar. Tente novamente.')
        }
        const r = data as { ok: boolean; error?: string } | null
        if (!r?.ok) {
          if (r?.error === 'forbidden') throw new Error('Você não tem permissão para editar este culto.')
          if (r?.error === 'invalid_time_range') throw new Error('A hora de término precisa ser depois da hora de início.')
          throw new Error('Não foi possível salvar. Tente novamente.')
        }
        await syncOrg(orgId)
        onSaved(editing.id)
      } else {
        const { data, error: e } = await supabase.rpc('create_playlist', {
          p_org_id: orgId,
          p_name: name.trim(),
          p_scheduled_at: start.toISOString(),
          p_scheduled_end: end.toISOString(),
        })
        if (e) {
          console.error('[PlaylistFormModal] create error:', e)
          throw new Error('Não foi possível criar. Tente novamente.')
        }
        const r = data as { ok: boolean; id?: string; error?: string } | null
        if (!r?.ok || !r.id) {
          if (r?.error === 'forbidden') throw new Error('Você não tem permissão para criar cultos.')
          if (r?.error === 'invalid_time_range') throw new Error('A hora de término precisa ser depois da hora de início.')
          throw new Error('Não foi possível criar. Tente novamente.')
        }
        await syncOrg(orgId)
        onSaved(r.id)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo deu errado.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="animate-modal-in w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'rgba(19,19,31,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-h2 text-heading">{editing ? 'Editar culto' : 'Novo culto'}</h2>
          <button onClick={onClose} className="text-body hover:text-heading transition-colors" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-body text-xs uppercase tracking-wide font-semibold">Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Domingo Manhã, Vigília, Ensaio…"
              className="mt-1 w-full px-3 py-2 rounded-lg text-heading"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-body text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5">
              <Calendar size={12} /> Data
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg text-heading"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-body text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5">
                <Clock size={12} /> Início
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-heading"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </label>
            <label className="block">
              <span className="text-body text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5">
                <Clock size={12} /> Término
              </span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-heading"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg text-body font-semibold transition-colors cursor-pointer disabled:cursor-default"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:cursor-default"
              style={{ background: '#2563eb', color: '#fff' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin-smooth" /> : null}
              {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
