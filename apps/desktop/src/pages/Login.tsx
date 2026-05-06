import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/auth.js'

type Props = {
  onSuccess: () => void
}

export function Login({ onSuccess }: Props) {
  const { setSession } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '11px 14px',
    color: '#f3f4f6', outline: 'none',
    fontSize: 14, minHeight: 44,
    boxSizing: 'border-box' as const,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fn = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password })

    const result = await fn
    setLoading(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    if (!result.data.session) {
      setError(isSignUp ? 'Verifique seu e-mail para confirmar a conta.' : 'Sessão não iniciada.')
      return
    }

    setSession(result.data.session)
    onSuccess()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#09090f' }}>
      <div
        className="w-full"
        style={{
          maxWidth: 360,
          background: 'linear-gradient(135deg,#13131f,#161625)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '32px 28px',
        }}
      >
        <h1 className="font-bold mb-1" style={{ color: '#f3f4f6', fontSize: 22 }}>
          Leviticus
        </h1>
        <p className="mb-7" style={{ color: '#9ca3af', fontSize: 14 }}>
          {isSignUp ? 'Crie sua conta' : 'Bem-vindo de volta'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block mb-1.5 font-medium"
              style={{ color: '#9ca3af', fontSize: 13 }}
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block mb-1.5 font-medium"
              style={{ color: '#9ca3af', fontSize: 13 }}
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-semibold text-white transition-colors"
            style={{
              background: loading ? 'rgba(37,99,235,0.5)' : '#2563eb',
              borderRadius: 10, border: 'none',
              minHeight: 46, fontSize: 15,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Aguarde…' : isSignUp ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <p className="mt-5 text-center" style={{ color: '#6b7280', fontSize: 14 }}>
          {isSignUp ? 'Já tem uma conta? ' : 'Não tem conta? '}
          <button
            onClick={() => setIsSignUp((v) => !v)}
            className="font-medium"
            style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
          >
            {isSignUp ? 'Fazer login' : 'Criar conta'}
          </button>
        </p>
      </div>
    </div>
  )
}
