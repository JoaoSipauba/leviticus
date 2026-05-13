'use client'

import { useState, useEffect, useRef } from 'react'
import { joinWaitlist } from '@/app/actions/waitlist'

export default function WaitlistModal() {
  const [isOpen, setIsOpen]       = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleOpen() {
      setIsOpen(true)
      setSubmitted(false)
      setError(null)
      setTimeout(() => emailRef.current?.focus(), 50)
    }
    document.addEventListener('open-waitlist', handleOpen)
    return () => document.removeEventListener('open-waitlist', handleOpen)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  function close() { setIsOpen(false); setSubmitted(false); setError(null) }

  async function submitWaitlist(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form      = e.currentTarget
    const email     = (form.elements.namedItem('email') as HTMLInputElement).value
    const platforms = ['ios', 'android'].filter(
      p => (form.elements.namedItem(p) as HTMLInputElement)?.checked
    )

    const result = await joinWaitlist(email, platforms)
    setLoading(false)

    if (result.ok) {
      setSubmitted(true)
      return
    }
    setError(result.duplicate
      ? 'Este email já está na lista. Você será avisado quando lançar.'
      : 'Algo deu errado. Tente novamente.'
    )
  }

  if (!isOpen) return null

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(3,7,18,0.7)', backdropFilter: 'blur(8px)', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: '16px', padding: '36px', maxWidth: '440px', width: '100%', boxShadow: '0 30px 80px -10px rgba(0,0,0,0.6)', position: 'relative' }}>
        <button
          onClick={close}
          style={{ position: 'absolute', top: '14px', right: '14px', width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label="Fechar"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        {!submitted ? (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--primary-soft)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '10px' }}>Versão mobile</div>
            <h3 style={{ fontSize: '24px', fontWeight: 500, letterSpacing: '-0.5px', marginBottom: '10px', lineHeight: 1.2 }}>Te avisamos quando lançar.</h3>
            <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.55, marginBottom: '22px' }}>Leviticus pra iOS e Android está em desenvolvimento. Deixe seu email e você recebe o primeiro acesso quando estiver pronto. Sem spam, sem newsletter.</p>
            <form onSubmit={submitWaitlist} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                ref={emailRef}
                type="email"
                name="email"
                required
                placeholder="seu@email.com"
                style={{ padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: '10px', color: 'var(--text)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" name="ios" defaultChecked style={{ accentColor: 'var(--primary)' }} /> iOS
                </label>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" name="android" defaultChecked style={{ accentColor: 'var(--primary)' }} /> Android
                </label>
              </div>
              {error && (
                <div style={{ fontSize: '13px', color: 'var(--orange)', padding: '10px 12px', background: 'rgba(251,146,60,0.08)', borderRadius: '8px', border: '1px solid rgba(251,146,60,0.2)' }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ justifyContent: 'center', marginTop: '6px', opacity: loading ? 0.7 : 1 }}
                disabled={loading}
              >
                {loading ? 'Registrando...' : 'Quero ser avisado'}
              </button>
              <div style={{ fontSize: '11px', color: 'var(--muted-2)', textAlign: 'center', marginTop: '4px' }}>Só enviamos um email quando o app sair. Nada mais.</div>
            </form>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h3 style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-0.4px', marginBottom: '8px' }}>Email registrado!</h3>
            <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.55, maxWidth: '320px', margin: '0 auto 22px' }}>Você será um dos primeiros a saber quando o app mobile estiver disponível. Que Deus abençoe sua equipe.</p>
            <button onClick={close} className="btn btn-secondary" style={{ justifyContent: 'center' }}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}
