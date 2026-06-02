'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// Página intermediária pro callback de OAuth do Drive.
//
// Por que existe: a edge function `cloud-storage-proxy/oauth-callback`
// não consegue redirecionar direto pro deep link `leviticus://` porque
// o Supabase Edge serve HTML dentro de um iframe sandboxed sem
// `allow-scripts` — qualquer `window.location.href = "leviticus://..."`
// dentro do response da edge é bloqueado pelo navegador. Solução:
// edge function devolve um 302 pra cá; esta página (no domínio próprio,
// sem sandbox) dispara o deep link.
//
// UX: tenta o deep link automaticamente; mostra botão de "Abrir Leviticus"
// pro caso de o navegador exigir interação do usuário (Chrome às vezes
// pede confirmação na primeira vez).

// Next.js 15 exige Suspense boundary em volta de useSearchParams pra que
// o prerender estático funcione — caso contrário o build falha com
// "Missing Suspense" e a página vira dinâmica.
export default function OAuthConnectedPage() {
  return (
    <Suspense fallback={<FallbackUI />}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const params = useSearchParams()
  const orgId = params.get('org_id')
  const [triedAuto, setTriedAuto] = useState(false)

  useEffect(() => {
    if (!orgId) return
    // Tenta abrir o deep link assim que a página carrega. Em browsers
    // modernos, isso é tratado como user-initiated quando vem de uma
    // navegação top-level (não iframe), e dispara o handler do scheme
    // sem confirmação. Quando o app já está aberto, o SO entrega o evento
    // pro processo existente — sem abrir nova janela.
    const deepLink = `leviticus://oauth-success?org_id=${encodeURIComponent(orgId)}`
    window.location.href = deepLink
    setTriedAuto(true)
  }, [orgId])

  if (!orgId) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Faltou um parâmetro</h1>
          <p style={paragraphStyle}>
            Volta pro app Leviticus e tenta conectar de novo.
          </p>
        </div>
      </main>
    )
  }

  const deepLink = `leviticus://oauth-success?org_id=${encodeURIComponent(orgId)}`

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={checkmarkStyle}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            width={28}
            height={28}
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={titleStyle}>Conectado ao Google Drive</h1>
        <p style={paragraphStyle}>
          {triedAuto
            ? 'Voltando pro Leviticus…'
            : 'Pronto. Pode voltar pro app.'}
        </p>
        <a href={deepLink} style={buttonStyle}>
          Abrir Leviticus
        </a>
        <p style={hintStyle}>
          Se nada acontecer, abra o app manualmente — a conexão já foi salva.
        </p>
      </div>
    </main>
  )
}

// Loading UI minimalista enquanto o Suspense resolve (~instantâneo no
// cliente). Usa o mesmo background pra não piscar.
function FallbackUI() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={paragraphStyle}>Carregando…</p>
      </div>
    </main>
  )
}

// Estilos inline pra essa página específica (sem depender do CSS global
// da landing — quanto menos JS/CSS de terceiros aqui, menos coisa pode
// falhar no fluxo crítico de auth).

const pageStyle: React.CSSProperties = {
  fontFamily: '-apple-system, system-ui, sans-serif',
  background: '#0a0a0a',
  color: '#fafafa',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  margin: 0,
  textAlign: 'center',
  padding: 20,
}

const cardStyle: React.CSSProperties = {
  maxWidth: 420,
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 16,
  padding: 32,
}

const checkmarkStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  margin: '0 auto 16px',
  background: '#022c22',
  border: '1px solid #064e3b',
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 20,
}

const paragraphStyle: React.CSSProperties = {
  margin: '8px 0 20px',
  color: '#a1a1aa',
  fontSize: 14,
  lineHeight: 1.6,
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 20px',
  background: '#a78bfa',
  color: '#18181b',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
}

const hintStyle: React.CSSProperties = {
  margin: '20px 0 0',
  color: '#71717a',
  fontSize: 12,
  lineHeight: 1.6,
}
