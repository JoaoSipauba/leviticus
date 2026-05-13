'use client'

export default function Download() {
  return (
    <section className="section section-divider" id="download" data-screen-label="download">
      <div className="container">
        <div className="section-label">03 · Download</div>
        <h2 className="section-title">Baixe pra sua plataforma.</h2>
        <p className="section-sub">Sem cadastro pra baixar. A conta da igreja é criada na primeira abertura. <strong style={{ color: 'var(--orange)' }}>Versão beta</strong> — pode ter alguns ajustes pelo caminho, e seu feedback é muito bem-vindo em <a href="mailto:appleviticus@gmail.com" style={{ color: 'var(--primary-soft)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>appleviticus@gmail.com</a>.</p>

        <div className="downloads-grid">
          {/* macOS */}
          <div className="download-card">
            <span className="soon-badge" style={{ background: 'rgba(251,146,60,0.15)', color: 'var(--orange)' }}>Beta</span>
            <svg className="download-os-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            <div className="download-os-name">macOS</div>
            <div className="download-os-detail">Apple Silicon (M1+)</div>
            <div className="download-meta">v0.1.13 · 24 MB · .dmg</div>
            <a href="#" className="btn btn-primary download-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v14M5 12l7 7 7-7"/></svg>
              Baixar para macOS
            </a>
          </div>

          {/* Windows */}
          <div className="download-card">
            <span className="soon-badge" style={{ background: 'rgba(251,146,60,0.15)', color: 'var(--orange)' }}>Beta</span>
            <svg className="download-os-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5 10.5 4v8H3V5.5zM11.5 3.85 21 2.5V12h-9.5V3.85zM3 13h7.5v8L3 19.5V13zM11.5 13H21v9.5l-9.5-1.35V13z"/></svg>
            <div className="download-os-name">Windows</div>
            <div className="download-os-detail">Windows 10 / 11 · 64-bit</div>
            <div className="download-meta">v0.1.13 · 18 MB · .msi</div>
            <a href="#" className="btn btn-primary download-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v14M5 12l7 7 7-7"/></svg>
              Baixar para Windows
            </a>
          </div>

          {/* Mobile */}
          <div className="download-card soon">
            <span className="soon-badge">Em breve</span>
            <svg className="download-os-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 18h.01"/></svg>
            <div className="download-os-name">Mobile</div>
            <div className="download-os-detail">iOS & Android</div>
            <div className="download-meta">Em desenvolvimento</div>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); document.dispatchEvent(new CustomEvent('open-waitlist')) }}
              className="btn btn-secondary download-btn"
            >
              Avise-me no lançamento
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
