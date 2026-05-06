import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Hash, Plus, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { useAuthStore } from '../store/auth.js'

type Org = { id: string; name: string }

export function OrgSelect() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  const [orgs, setOrgs] = useState<Org[]>([])
  const [code, setCode] = useState('')
  const [newOrgName, setNewOrgName] = useState('')
  const [mode, setMode] = useState<'list' | 'join' | 'create'>('list')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    let active = true
    supabase
      .from('organizations')
      .select('id, name')
      .then(({ data, error }) => {
        if (active && !error) setOrgs(data ?? [])
      })
    return () => { active = false }
  }, [user])

  async function selectOrg(org: Org) {
    localStorage.setItem('leviticus_org_id', org.id)
    await syncOrg(org.id)
    navigate('/library')
  }

  async function handleJoin() {
    if (!user) { setError('Sessão expirada. Faça login novamente.'); return }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('org_invite_codes')
      .select('org_id, expires_at, is_active')
      .eq('code', code.trim().toUpperCase())
      .single()

    if (error || !data || !data.is_active) {
      setError('Código inválido ou expirado.')
      setLoading(false)
      return
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setError('Este código expirou.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('organization_members').insert({
      user_id: user!.id,
      org_id: data.org_id,
    })
    if (insertError) {
      setError('Erro ao entrar na organização.')
      setLoading(false)
      return
    }

    localStorage.setItem('leviticus_org_id', data.org_id)
    await syncOrg(data.org_id)
    setLoading(false)
    navigate('/library')
  }

  async function handleCreate() {
    if (!user) { setError('Sessão expirada. Faça login novamente.'); return }
    if (!newOrgName.trim()) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: newOrgName.trim(), owner_id: user!.id })
      .select()
      .single()

    if (error || !data) {
      setError('Erro ao criar organização.')
      setLoading(false)
      return
    }

    const { error: memberError } = await supabase.from('organization_members').insert({
      user_id: user!.id,
      org_id: data.id,
    })
    if (memberError) {
      setError('Erro ao criar organização.')
      setLoading(false)
      return
    }

    localStorage.setItem('leviticus_org_id', data.id)
    await syncOrg(data.id)
    setLoading(false)
    navigate('/library')
  }

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '11px 14px',
    color: '#f3f4f6', outline: 'none',
    fontSize: 14, minHeight: 44,
    boxSizing: 'border-box' as const,
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#09090f' }}>
      <div
        className="w-full"
        style={{
          maxWidth: 360,
          background: 'linear-gradient(135deg,#13131f,#161625)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '32px 28px',
        }}
      >
        <h1 className="font-bold mb-6" style={{ color: '#f3f4f6', fontSize: 20 }}>
          Selecionar Organização
        </h1>

        {mode === 'list' && (
          <>
            {orgs.length > 0 && (
              <div className="space-y-2 mb-4">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => selectOrg(org)}
                    className="w-full flex items-center gap-3 text-left transition-colors"
                    style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer', color: '#f3f4f6', fontSize: 14,
                    }}
                  >
                    <Building2 size={16} color="#3b82f6" strokeWidth={2} />
                    <span className="flex-1 font-medium">{org.name}</span>
                    <ChevronRight size={15} color="#4b5563" strokeWidth={2} />
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => setMode('join')}
                className="w-full flex items-center gap-2 justify-center font-medium transition-colors"
                style={{
                  borderRadius: 10, padding: '10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#9ca3af', cursor: 'pointer', fontSize: 14, minHeight: 44,
                }}
              >
                <Hash size={15} color="#6b7280" strokeWidth={2} />
                Entrar com código
              </button>
              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center gap-2 justify-center font-semibold text-white transition-colors"
                style={{
                  borderRadius: 10, padding: '10px',
                  background: '#2563eb', border: 'none',
                  cursor: 'pointer', fontSize: 14, minHeight: 44,
                }}
              >
                <Plus size={15} strokeWidth={2.5} />
                Criar organização
              </button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <input
              placeholder="Código de convite"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ ...inputStyle, letterSpacing: '0.15em', textAlign: 'center', fontFamily: 'monospace', fontSize: 18 }}
              maxLength={12}
            />
            {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading || !code}
              className="w-full font-semibold text-white"
              style={{
                borderRadius: 10, padding: '10px',
                background: (loading || !code) ? 'rgba(37,99,235,0.4)' : '#2563eb',
                border: 'none', cursor: (loading || !code) ? 'default' : 'pointer',
                fontSize: 14, minHeight: 44,
              }}
            >
              Entrar
            </button>
            <button
              onClick={() => setMode('list')}
              className="w-full text-sm"
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}
            >
              Voltar
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <input
              placeholder="Nome da organização"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              style={inputStyle}
            />
            {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading || !newOrgName.trim()}
              className="w-full font-semibold text-white"
              style={{
                borderRadius: 10, padding: '10px',
                background: (loading || !newOrgName.trim()) ? 'rgba(37,99,235,0.4)' : '#2563eb',
                border: 'none', cursor: (loading || !newOrgName.trim()) ? 'default' : 'pointer',
                fontSize: 14, minHeight: 44,
              }}
            >
              Criar
            </button>
            <button
              onClick={() => setMode('list')}
              className="w-full text-sm"
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}
            >
              Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
