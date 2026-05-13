export default function HowItWorks() {
  return (
    <section className="section section-divider" id="como" data-screen-label="como">
      <div className="container">
        <div className="section-label">02 · Como funciona</div>
        <h2 className="section-title">Do repertório ao culto, em minutos.</h2>
        <p className="section-sub">Fluxo simples: você organiza o repertório do ministério, monta o setlist do culto por seção e fica tudo disponível offline no dispositivo da equipe.</p>

        <div className="how-grid">
          <div>
            <div className="how-step">
              <div className="how-num">1</div>
              <div>
                <div className="how-step-title">Monte a biblioteca da igreja</div>
                <div className="how-step-body">Centralize todo o repertório do seu ministério em um único acervo. As faixas ficam organizadas e prontas pra serem usadas nos próximos cultos pela equipe inteira.</div>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">2</div>
              <div>
                <div className="how-step-title">Organize por ministério</div>
                <div className="how-step-body">Vocal jovens, pads do teclado, vocal das crianças — cada ministério enxerga o próprio acervo. Marque também o tipo de cada faixa: normal, instrumental, VS ou pad.</div>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">3</div>
              <div>
                <div className="how-step-title">Prepare o setlist do culto</div>
                <div className="how-step-body">Crie o culto, divida em seções — abertura, ministração, pregação, oferta — e ordene as faixas. Toda a equipe enxerga o mesmo setlist.</div>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">4</div>
              <div>
                <div className="how-step-title">No domingo, é só abrir e tocar</div>
                <div className="how-step-body">Sua biblioteca está disponível no dispositivo. Abre o app, aperta play e a equipe segue o culto — funciona <strong style={{ color: 'var(--text)', fontWeight: 600 }}>mesmo sem internet na igreja</strong>.</div>
              </div>
            </div>
            <div className="how-step">
              <div className="how-num">5</div>
              <div>
                <div className="how-step-title">Sincroniza quando voltar online</div>
                <div className="how-step-body">Tudo que você faz offline é salvo no seu dispositivo. Assim que a conexão voltar, a equipe inteira recebe as atualizações.</div>
              </div>
            </div>
          </div>

          <div className="demo-mock">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--primary-soft)', letterSpacing: '1.4px', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Culto</div>
                <div style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.4px' }}>Culto do Dia das Mães</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>Domingo, 10 de mai · 18h00 – 21h30 · 3 músicas</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '20px', background: 'var(--bg)' }}>
                <span className="pulse"></span>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>Offline</span>
              </div>
            </div>

            {/* Section: VOCAL DAS CRIANÇAS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary-soft)', letterSpacing: '1.4px', textTransform: 'uppercase' }}>Vocal das crianças</span>
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }}></span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>1 faixa</span>
            </div>
            <div className="demo-results" style={{ marginTop: 0 }}>
              <div className="demo-result">
                <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'linear-gradient(135deg,#dc2626,#f43f5e)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🌹</div>
                <div className="demo-result-meta">
                  <div className="demo-result-title">Mãe</div>
                  <div className="demo-result-artist">Grupo Voices</div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '4px', background: 'rgba(148,163,184,0.14)', color: 'var(--muted)', letterSpacing: '0.3px' }}>NORMAL</span>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>5:04</span>
              </div>
            </div>

            {/* Section: PREGAÇÃO */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary-soft)', letterSpacing: '1.4px', textTransform: 'uppercase' }}>Pregação</span>
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }}></span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>1 faixa</span>
            </div>
            <div className="demo-results" style={{ marginTop: 0 }}>
              <div className="demo-result" style={{ borderColor: 'var(--primary)', background: 'rgba(59,130,246,0.06)', boxShadow: '0 0 0 2px rgba(59,130,246,0.08)' }}>
                <button style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'linear-gradient(135deg,#7c3aed,#1e40af)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }} aria-label="Tocando">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
                </button>
                <div className="demo-result-meta">
                  <div className="demo-result-title">Fundo musical Piano + PAD</div>
                  <div className="demo-result-artist">Instrumental Piano Worship · tocando agora</div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '4px', background: 'rgba(168,85,247,0.16)', color: 'var(--violet)', letterSpacing: '0.3px' }}>INSTRUMENTAL</span>
                <span style={{ fontSize: '11px', color: 'var(--primary-soft)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>1:12:41</span>
              </div>
            </div>

            {/* Section: VOCAL DE JOVENS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary-soft)', letterSpacing: '1.4px', textTransform: 'uppercase' }}>Vocal de jovens</span>
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }}></span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>1 faixa</span>
            </div>
            <div className="demo-results" style={{ marginTop: 0 }}>
              <div className="demo-result">
                <div className="demo-result-thumb b"></div>
                <div className="demo-result-meta">
                  <div className="demo-result-title">Meu Mestre</div>
                  <div className="demo-result-artist">Get Worship</div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '4px', background: 'rgba(148,163,184,0.14)', color: 'var(--muted)', letterSpacing: '0.3px' }}>NORMAL</span>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>6:00</span>
              </div>
            </div>

            <div className="demo-sync" style={{ marginTop: '14px' }}>
              <span className="pulse"></span>
              Sincronizado com a equipe · pronto pro domingo
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
