import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { syncOrg } from '../../lib/sync.js'
import { toastSuccess, toastError } from '../../store/toasts.js'
import { captureException } from '../../lib/observability.js'
import { AnimatedModal } from '../ui/AnimatedModal.js'
import { Button } from '../ui/Button.js'
import { IconButton } from '../ui/IconButton.js'

type Expiry = '24h' | '7d' | '30d' | 'never'

const EXPIRY_LABELS: Record<Expiry, string> = {
  '24h': '24 horas',
  '7d': '7 dias',
  '30d': '30 dias',
  'never': 'Nunca',
}

function computeExpiresAt(opt: Expiry): string | null {
  if (opt === 'never') return null
  const ms = opt === '24h' ? 24 * 3600_000 : opt === '7d' ? 7 * 86400_000 : 30 * 86400_000
  return new Date(Date.now() + ms).toISOString()
}

export function InviteCodeModal({
  open, orgId, onClose, onCreated,
}: {
  open: boolean
  orgId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [label, setLabel] = useState('')
  const [expiry, setExpiry] = useState<Expiry>('7d')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setSaving(true); setError(null)
    const { data, error: e } = await supabase.rpc('create_invite_code', {
      p_org_id: orgId, p_label: label.trim() || null, p_expires_at: computeExpiresAt(expiry),
    })
    if (e || (data as any)?.ok === false) {
      captureException(e ?? data, { feature: 'invite-code-modal' })
      toastError('Algo deu errado', 'Tente novamente.')
      setError('Algo deu errado. Tente novamente.')
      setSaving(false)
      return
    }
    await syncOrg(orgId)
    setLabel(''); setExpiry('7d')
    setSaving(false)
    toastSuccess('Código gerado')
    onCreated(); onClose()
  }

  return (
    <AnimatedModal open={open} onClose={onClose} closeOnBackdrop={label.trim() === ''} busy={saving}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>Novo código de convite</h2>
          <IconButton label="Fechar" onClick={onClose} variant="ghost" size="sm"><X size={18} /></IconButton>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Para quem é? (opcional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Pro pessoal do louvor"
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, color: '#f3f4f6', outline: 'none' }}
              autoFocus
            />
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Só você vê esse rótulo — ajuda a lembrar pra quem criou.</p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Expiração</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.keys(EXPIRY_LABELS) as Expiry[]).map((opt) => {
                const on = expiry === opt
                return (
                  <button key={opt} onClick={() => setExpiry(opt)}
                    style={{ padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: on ? 'rgba(30,58,138,0.19)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)'}`, color: on ? '#eff6ff' : '#d1d5db', transition: 'background 0.12s' }}>
                    {EXPIRY_LABELS[opt]}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={onClose} variant="secondary">Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} loading={saving}>
              {saving ? 'Gerando…' : 'Gerar código'}
            </Button>
          </div>
        </div>
    </AnimatedModal>
  )
}
