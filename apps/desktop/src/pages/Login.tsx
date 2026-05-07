import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/auth.js'
import { Logo } from '../components/brand/Logo.js'
import { capitalizeName, isValidEmail } from '../lib/validation.js'
import { GlowBackdrop } from '../components/brand/GlowBackdrop.js'
import { GlassCard } from '../components/brand/GlassCard.js'

type Props = {
  onSuccess: () => void
}

export function Login({ onSuccess }: Props) {
  const { setSession } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validateEmailOnBlur() {
    if (!email) {
      setEmailError(null)
      return
    }
    setEmailError(isValidEmail(email) ? null : 'E-mail em formato inválido.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isValidEmail(email)) {
      setEmailError('E-mail em formato inválido.')
      return
    }

    if (isSignUp) {
      const cleanName = capitalizeName(name)
      if (!cleanName) {
        setError('Informe seu nome.')
        return
      }
      setName(cleanName)

      setLoading(true)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: cleanName } },
      })
      setLoading(false)

      if (signUpError) {
        setError(signUpError.message)
        return
      }
      if (!data.session) {
        setError('Verifique seu e-mail para confirmar a conta.')
        return
      }
      setSession(data.session)
      onSuccess()
      return
    }

    setLoading(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }
    if (!data.session) {
      setError('Sessão não iniciada.')
      return
    }
    setSession(data.session)
    onSuccess()
  }

  const inputClass =
    'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-heading text-sm outline-none focus:border-brand/60 focus:bg-white/[0.06] transition-colors backdrop-blur-sm'
  const inputErrClass =
    'w-full bg-white/[0.04] border border-red-500/60 rounded-lg px-3.5 py-2.5 text-heading text-sm outline-none focus:border-red-500 transition-colors backdrop-blur-sm'

  return (
    <div className="min-h-screen bg-bg-app relative flex items-center justify-center p-6 overflow-hidden">
      <GlowBackdrop />

      <div className="relative z-10 w-full max-w-[400px] flex flex-col items-center animate-pop-in">
        <div className="flex flex-col items-center gap-4 mb-10">
          <Logo variant="mark" size={64} />
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-h2 text-heading font-medium">Leviticus</h1>
            <p className="text-body text-sm">Repertório musical da sua igreja</p>
          </div>
        </div>

        <GlassCard className="w-full p-7">
          <p className="text-caps text-brand mb-1">{isSignUp ? 'CRIAR CONTA' : 'BEM-VINDO'}</p>
          <p className="text-body text-sm mb-6">
            {isSignUp ? 'Crie sua conta para começar' : 'Entre para continuar'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="name" className="block mb-1.5 font-medium text-body text-xs">
                  Nome completo
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setName(capitalizeName(name))}
                  required
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block mb-1.5 font-medium text-body text-xs">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                onBlur={validateEmailOnBlur}
                required
                className={emailError ? inputErrClass : inputClass}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError && (
                <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-400">
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block mb-1.5 font-medium text-body text-xs">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className={`w-full font-semibold text-heading rounded-lg min-h-[46px] text-sm transition-colors ${
                loading ? 'bg-brand-active/50 cursor-default' : 'bg-brand-active hover:bg-brand cursor-pointer'
              }`}
              style={{ boxShadow: '0 8px 24px -8px rgba(37,99,235,0.5)' }}
            >
              {loading ? 'Aguarde…' : isSignUp ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <p className="mt-5 text-center text-muted text-sm">
            {isSignUp ? 'Já tem uma conta? ' : 'Não tem conta? '}
            <button
              onClick={() => {
                setIsSignUp((v) => !v)
                setError(null)
                setEmailError(null)
              }}
              className="font-medium text-brand bg-transparent border-0 cursor-pointer text-sm"
            >
              {isSignUp ? 'Fazer login' : 'Criar conta'}
            </button>
          </p>
        </GlassCard>
      </div>
    </div>
  )
}
