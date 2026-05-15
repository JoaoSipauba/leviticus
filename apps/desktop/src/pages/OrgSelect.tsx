import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Hash, Plus, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { useAuthStore } from '../store/auth.js'
import { Logo } from '../components/brand/Logo.js'
import { GlowBackdrop } from '../components/brand/GlowBackdrop.js'
import { GlassCard } from '../components/brand/GlassCard.js'

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

    const { data, error } = await supabase.rpc('redeem_invite_code', {
      p_code: code.trim().toUpperCase(),
    })

    if (error) {
      console.error(error)
      setError('Algo deu errado. Tente novamente.')
      setLoading(false)
      return
    }

    const result = data as { ok: boolean; org_id?: string; error?: string } | null
    if (!result || !result.ok) {
      const errCode = result?.error
      setError(
        errCode === 'invalid_code' ? 'Código inválido ou expirado.' :
        errCode === 'expired_code' ? 'Este código expirou.' :
        'Algo deu errado. Tente novamente.'
      )
      setLoading(false)
      return
    }

    localStorage.setItem('leviticus_org_id', result.org_id!)
    await syncOrg(result.org_id!)
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

  const inputClass =
    'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-heading text-sm outline-none focus:border-brand/60 focus:bg-white/[0.06] transition-colors backdrop-blur-sm'
  const ghostBtn =
    'w-full flex items-center gap-2 justify-center font-medium transition-colors rounded-lg py-2.5 min-h-[44px] text-sm bg-white/[0.04] border border-hairline text-body hover:bg-white/[0.07] hover:text-heading cursor-pointer'
  const primaryBtn =
    'w-full flex items-center gap-2 justify-center font-semibold text-heading rounded-lg py-2.5 min-h-[44px] text-sm bg-brand-active hover:bg-brand transition-colors cursor-pointer disabled:bg-brand-active/40 disabled:cursor-default'

  return (
    <div className="min-h-screen bg-bg-app relative flex items-center justify-center p-6 overflow-hidden">
      <GlowBackdrop />

      <div className="relative z-10 w-full max-w-[400px] flex flex-col items-center animate-pop-in">
        <div className="flex flex-col items-center gap-4 mb-8">
          <Logo variant="mark" size={56} />
          <p className="text-caps text-brand">ORGANIZAÇÃO</p>
        </div>

        <GlassCard className="w-full p-7">
          <h1 className="text-heading text-xl font-semibold mb-1">Selecionar organização</h1>
          <p className="text-body text-sm mb-6">
            Escolha uma org existente, entre com código ou crie uma nova.
          </p>

          {mode === 'list' && (
            <>
              {orgs.length > 0 && (
                <div className="space-y-2 mb-4">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => selectOrg(org)}
                      className="w-full flex items-center gap-3 text-left transition-colors rounded-lg px-3.5 py-3 bg-white/[0.04] border border-hairline hover:bg-white/[0.07] cursor-pointer"
                    >
                      <Building2 size={16} className="text-brand" strokeWidth={2} />
                      <span className="flex-1 font-medium text-heading text-sm">{org.name}</span>
                      <ChevronRight size={15} className="text-muted" strokeWidth={2} />
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <button onClick={() => setMode('join')} className={ghostBtn}>
                  <Hash size={15} strokeWidth={2} />
                  Entrar com código
                </button>
                <button
                  onClick={() => setMode('create')}
                  className={primaryBtn}
                  style={{ boxShadow: '0 8px 24px -8px rgba(37,99,235,0.5)' }}
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
                maxLength={12}
                className={`${inputClass} text-center tracking-[0.15em] font-mono text-base`}
              />
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button
                onClick={handleJoin}
                disabled={loading || !code}
                className={primaryBtn}
                style={{ boxShadow: '0 8px 24px -8px rgba(37,99,235,0.5)' }}
              >
                Entrar
              </button>
              <button
                onClick={() => setMode('list')}
                className="w-full text-sm bg-transparent border-0 text-muted hover:text-body cursor-pointer"
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
                className={inputClass}
              />
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={loading || !newOrgName.trim()}
                className={primaryBtn}
                style={{ boxShadow: '0 8px 24px -8px rgba(37,99,235,0.5)' }}
              >
                Criar
              </button>
              <button
                onClick={() => setMode('list')}
                className="w-full text-sm bg-transparent border-0 text-muted hover:text-body cursor-pointer"
              >
                Voltar
              </button>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
