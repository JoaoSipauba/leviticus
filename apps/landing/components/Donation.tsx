'use client'

import { useRef } from 'react'

const PIX_KEY = 'appleviticus@gmail.com'

export default function Donation() {
  const copyBtnRef = useRef<HTMLButtonElement>(null)

  function copyPix() {
    navigator.clipboard?.writeText(PIX_KEY).then(() => {
      const btn = copyBtnRef.current
      if (!btn) return
      const old = btn.textContent
      btn.textContent = 'Copiado ✓'
      btn.classList.add('copied')
      setTimeout(() => {
        btn.textContent = old
        btn.classList.remove('copied')
      }, 1800)
    })
  }

  return (
    <section className="section section-divider" id="doacao" data-screen-label="doacao">
      <div className="container">
        <div className="section-label">07 · Contribua com a obra</div>
        <h2 className="section-title">Apoie o desenvolvimento do Leviticus.</h2>
        <p className="section-sub">Servidores, certificados, domínio e o tempo de quem desenvolve. Se o Leviticus está abençoando sua equipe e você puder semear, agradecemos de coração.</p>

        <div className="donation-wrap">
          <div className="donation-text">
            <h3>Sua oferta sustenta a obra.</h3>
            <p>Cada contribuição ajuda a manter o projeto acessível, principalmente pras igrejas menores que não têm orçamento pra ferramentas pagas.</p>
            <p>Toda doação vai direto pra desenvolvimento, infraestrutura e novas funcionalidades — incluindo a versão mobile.</p>
            <div className="donation-verse">
              "Cada um contribua segundo propôs no seu coração, não com tristeza, ou por necessidade; porque Deus ama ao que dá com alegria."
              <span className="donation-verse-ref">2 Coríntios 9 · 7</span>
            </div>
          </div>

          <div className="donation-card">
            <div className="donation-card-label">PIX · qualquer valor</div>
            <div className="donation-qr">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" fill="#fff"/>
                <g fill="#030712">
                  {/* corner markers */}
                  <rect x="4" y="4" width="22" height="22"/>
                  <rect x="74" y="4" width="22" height="22"/>
                  <rect x="4" y="74" width="22" height="22"/>
                  <rect x="9" y="9" width="12" height="12" fill="#fff"/>
                  <rect x="79" y="9" width="12" height="12" fill="#fff"/>
                  <rect x="9" y="79" width="12" height="12" fill="#fff"/>
                  <rect x="13" y="13" width="4" height="4"/>
                  <rect x="83" y="13" width="4" height="4"/>
                  <rect x="13" y="83" width="4" height="4"/>
                  {/* random data dots */}
                  <g>
                    <rect x="32" y="6" width="4" height="4"/><rect x="40" y="6" width="4" height="4"/><rect x="48" y="6" width="4" height="4"/><rect x="60" y="6" width="4" height="4"/>
                    <rect x="32" y="14" width="4" height="4"/><rect x="44" y="14" width="4" height="4"/><rect x="56" y="14" width="4" height="4"/><rect x="64" y="14" width="4" height="4"/>
                    <rect x="36" y="22" width="4" height="4"/><rect x="48" y="22" width="4" height="4"/><rect x="52" y="22" width="4" height="4"/><rect x="68" y="22" width="4" height="4"/>
                    <rect x="6" y="32" width="4" height="4"/><rect x="14" y="32" width="4" height="4"/><rect x="26" y="32" width="4" height="4"/><rect x="38" y="32" width="4" height="4"/><rect x="46" y="32" width="4" height="4"/><rect x="58" y="32" width="4" height="4"/><rect x="70" y="32" width="4" height="4"/><rect x="82" y="32" width="4" height="4"/><rect x="90" y="32" width="4" height="4"/>
                    <rect x="10" y="40" width="4" height="4"/><rect x="22" y="40" width="4" height="4"/><rect x="34" y="40" width="4" height="4"/><rect x="42" y="40" width="4" height="4"/><rect x="50" y="40" width="4" height="4"/><rect x="62" y="40" width="4" height="4"/><rect x="74" y="40" width="4" height="4"/><rect x="86" y="40" width="4" height="4"/>
                    <rect x="6" y="48" width="4" height="4"/><rect x="18" y="48" width="4" height="4"/><rect x="30" y="48" width="4" height="4"/><rect x="46" y="48" width="4" height="4"/><rect x="58" y="48" width="4" height="4"/><rect x="66" y="48" width="4" height="4"/><rect x="78" y="48" width="4" height="4"/><rect x="90" y="48" width="4" height="4"/>
                    <rect x="14" y="56" width="4" height="4"/><rect x="26" y="56" width="4" height="4"/><rect x="38" y="56" width="4" height="4"/><rect x="50" y="56" width="4" height="4"/><rect x="54" y="56" width="4" height="4"/><rect x="70" y="56" width="4" height="4"/><rect x="82" y="56" width="4" height="4"/>
                    <rect x="10" y="64" width="4" height="4"/><rect x="22" y="64" width="4" height="4"/><rect x="34" y="64" width="4" height="4"/><rect x="46" y="64" width="4" height="4"/><rect x="62" y="64" width="4" height="4"/><rect x="74" y="64" width="4" height="4"/><rect x="86" y="64" width="4" height="4"/>
                    <rect x="6" y="72" width="4" height="4"/><rect x="34" y="72" width="4" height="4"/><rect x="42" y="72" width="4" height="4"/><rect x="54" y="72" width="4" height="4"/><rect x="66" y="72" width="4" height="4"/><rect x="78" y="72" width="4" height="4"/><rect x="90" y="72" width="4" height="4"/>
                    <rect x="34" y="80" width="4" height="4"/><rect x="46" y="80" width="4" height="4"/><rect x="58" y="80" width="4" height="4"/><rect x="70" y="80" width="4" height="4"/><rect x="82" y="80" width="4" height="4"/>
                    <rect x="38" y="88" width="4" height="4"/><rect x="50" y="88" width="4" height="4"/><rect x="62" y="88" width="4" height="4"/><rect x="74" y="88" width="4" height="4"/><rect x="86" y="88" width="4" height="4"/>
                  </g>
                </g>
              </svg>
            </div>
            <div className="donation-pix-row">
              <span className="key">{PIX_KEY}</span>
              <button ref={copyBtnRef} className="copy" onClick={copyPix}>Copiar</button>
            </div>
            <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>Você escolhe o valor no seu app do banco. Toda contribuição, grande ou pequena, ajuda a manter o projeto.</div>
          </div>
        </div>
      </div>
    </section>
  )
}
