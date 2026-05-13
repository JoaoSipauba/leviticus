export default function Features() {
  return (
    <section className="section" id="recursos" data-screen-label="recursos">
      <div className="container">
        <div className="section-label">01 · Recursos</div>
        <h2 className="section-title">O ferramental que faltava pra equipe de louvor.</h2>
        <p className="section-sub">Pensado pra como cultos realmente acontecem — preparação na semana, equipe alinhada, e domingo sem depender da internet da igreja.</p>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <div className="feature-title">Biblioteca centralizada</div>
            <div className="feature-body">Todo o repertório da igreja em um único acervo, com busca instantânea. A equipe encontra a faixa certa sem caçar em pastas, planilhas ou conversas de WhatsApp.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon violet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
            </div>
            <div className="feature-title">100% offline no culto</div>
            <div className="feature-body">Depois que a faixa está no seu repertório, ela fica disponível no seu dispositivo. No domingo, nada de "carregando…". Sem buffer, sem cortes, sem surpresa.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon orange">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </div>
            <div className="feature-title">Organize por ministério</div>
            <div className="feature-body">Vocal jovens, pads teclado, vocal das crianças, vocal das senhoras. Cada equipe enxerga seu próprio repertório, sem misturar.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </div>
            <div className="feature-title">Cultos com seções</div>
            <div className="feature-body">Crie cultos com seções de verdade — abertura, ministração, pregação, oferta — e organize as músicas em cada uma. Toque tudo, ou seção por seção.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div className="feature-title">Equipe toda sincronizada</div>
            <div className="feature-body">Trabalhe offline tranquilo. Quando voltar a internet, suas mudanças sincronizam na nuvem e toda a equipe enxerga o repertório atualizado.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon violet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div className="feature-title">Tipos de faixa</div>
            <div className="feature-body">Marque cada música como normal, instrumental, VS ou pad. Cores e badges deixam claro pra equipe o que é cada coisa durante o culto.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>
            </div>
            <div className="feature-title">Modo apresentação</div>
            <div className="feature-body">Interface limpa pra usar durante o culto, com setlist organizado por seção, fila de reprodução visível e contagem de tempo — sem distração no momento do louvor.</div>
          </div>
        </div>
      </div>
    </section>
  )
}
