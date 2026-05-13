'use client'

import { useRef } from 'react'
import QRCode from 'react-qr-code'
import { PIX_KEY } from '@/lib/config'
import { buildPixPayload } from '@/lib/pix'

const pixPayload = buildPixPayload(PIX_KEY, 'Leviticus App', 'SAO PAULO')

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
              <QRCode
                value={pixPayload}
                size={160}
                bgColor="#ffffff"
                fgColor="#030712"
                style={{ display: 'block' }}
              />
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
