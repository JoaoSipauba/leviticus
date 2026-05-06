import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { syncOrg } from '../lib/sync.js'
import { useAuthStore } from '../store/auth.js'

type Org = { id: string; name: string }

export function OrgSelect() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
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
    setLoading(false)
    navigate('/library')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-sm">
        <h1 className="text-xl font-bold text-white mb-6">Selecionar Organização</h1>

        {mode === 'list' && (
          <>
            {orgs.length > 0 && (
              <div className="space-y-2 mb-4">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => selectOrg(org)}
                    className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg"
                  >
                    {org.name}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => setMode('join')}
                className="w-full border border-gray-700 hover:bg-gray-800 rounded-lg py-2 text-sm"
              >
                Entrar com código
              </button>
              <button
                onClick={() => setMode('create')}
                className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg py-2 text-sm text-white"
              >
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
              className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center font-mono text-lg"
              maxLength={12}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading || !code}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 disabled:opacity-40"
            >
              Entrar
            </button>
            <button onClick={() => setMode('list')} className="w-full text-sm text-gray-500">
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
              className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading || !newOrgName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 disabled:opacity-40"
            >
              Criar
            </button>
            <button onClick={() => setMode('list')} className="w-full text-sm text-gray-500">
              Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
