'use client'

import { useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { APP_VERSION } from '@/lib/config'

export default function Install() {
  const xattrBtnRef = useRef<HTMLButtonElement>(null)

  function copyXattr() {
    navigator.clipboard?.writeText('xattr -cr /Applications/Leviticus.app').then(() => {
      const btn = xattrBtnRef.current
      if (!btn) return
      const old = btn.textContent
      btn.textContent = 'Copiado ✓'
      btn.style.background = 'var(--green)'
      setTimeout(() => {
        btn.textContent = old
        btn.style.background = ''
      }, 1800)
    })
  }

  return (
    <section className="section section-divider" id="instalacao" data-screen-label="instalacao">
      <div className="container">
        <div className="section-label">04 · Instalação</div>
        <h2 className="section-title">Passo a passo, sem mistério.</h2>
        <p className="section-sub">Avisos do sistema operacional são normais — o app é seguro, mas ainda não passou pela certificação paga das lojas. Siga os passos abaixo na primeira instalação.</p>

        <div className="install-grid">
          {/* macOS */}
          <div className="install-card">
            <div className="install-card-head">
              <svg className="install-os-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              <div className="install-os-name">No macOS</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">1</div>
              <div className="install-step-text">Abra o arquivo <code>Leviticus_{APP_VERSION}_aarch64.dmg</code> que você baixou.</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">2</div>
              <div className="install-step-text">Arraste o ícone do Leviticus pra pasta <code>Aplicativos</code>.</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">3</div>
              <div className="install-step-text">Na primeira abertura: <strong>clique com o botão direito</strong> no ícone do app e escolha <code>Abrir</code> — não use duplo-clique nessa primeira vez.</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">4</div>
              <div className="install-step-text">Vai aparecer um aviso do Gatekeeper. Clique em <code>Abrir mesmo assim</code>.</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">5</div>
              <div className="install-step-text">Se o app ainda não abrir, rode esse comando no <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Terminal</strong> uma única vez:</div>
            </div>
            <div style={{ margin: '-4px 0 14px 36px', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: '8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12.5px', color: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ overflow: 'auto', whiteSpace: 'nowrap' }}>xattr -cr /Applications/Leviticus.app</span>
              <button
                ref={xattrBtnRef}
                onClick={copyXattr}
                style={{ padding: '5px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", flexShrink: 0 }}
              >Copiar</button>
            </div>
            <div className="install-warn">
              <AlertTriangle size={16} style={{ flexShrink: 0, color: 'var(--orange)' }} />
              <div><strong>Por que esses passos?</strong> O macOS coloca os arquivos baixados em quarentena e bloqueia apps que não pagam a taxa anual do Apple Developer Program. O comando <code style={{ fontFamily: "'JetBrains Mono', monospace", padding: '1px 5px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', color: '#fdba74' }}>xattr -cr</code> remove esse atributo de quarentena. É seguro — só está liberando o app que você acabou de baixar.</div>
            </div>
          </div>

          {/* Windows */}
          <div className="install-card">
            <div className="install-card-head">
              <svg className="install-os-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5 10.5 4v8H3V5.5zM11.5 3.85 21 2.5V12h-9.5V3.85zM3 13h7.5v8L3 19.5V13zM11.5 13H21v9.5l-9.5-1.35V13z"/></svg>
              <div className="install-os-name">No Windows</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">1</div>
              <div className="install-step-text">Execute o arquivo <code>Leviticus_{APP_VERSION}_x64-setup.exe</code> que você baixou.</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">2</div>
              <div className="install-step-text">O Windows SmartScreen pode aparecer. Clique em <code>Mais informações</code> e depois <code>Executar mesmo assim</code>.</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">3</div>
              <div className="install-step-text">Siga o assistente de instalação — Avançar, Avançar, Instalar.</div>
            </div>
            <div className="install-step">
              <div className="install-step-num">4</div>
              <div className="install-step-text">Pronto. O Leviticus aparece no menu Iniciar e pode ser fixado na barra de tarefas.</div>
            </div>
            <div className="install-warn">
              <AlertTriangle size={16} style={{ flexShrink: 0, color: 'var(--orange)' }} />
              <div><strong>Antivírus reclamando?</strong> Pode acontecer com apps que ainda não têm um certificado de assinatura de código (caro pra um projeto independente). Adicione uma exceção e o app vai rodar normalmente.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
