import { APP_VERSION } from '@/lib/config'

export default function Hero() {
  return (
    <header className="hero" data-screen-label="hero">
      <div className="hero-bg-glow"></div>
      <div className="container hero-grid">
        <aside className="hero-verse">
          <div className="hero-verse-quote">"Cantai ao Senhor um cântico novo, cantai ao Senhor, todos os moradores da terra."</div>
          <div className="hero-verse-ref">Salmos 96 · 1</div>
        </aside>
        <div>
          <div className="hero-eyebrow">v{APP_VERSION} · Beta pública · macOS + Windows · mobile em breve</div>
          <h1 className="hero-headline">Repertório do culto. <em>Sempre pronto, sempre offline.</em></h1>
          <p className="hero-sub">Leviticus é o player desktop da equipe de louvor. Centralize o repertório dos ministérios, monte o setlist do culto e toque no domingo — mesmo sem internet na igreja.</p>
          <div className="hero-actions">
            <a href="#download" className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v14M5 12l7 7 7-7"/></svg>
              Baixar para macOS
            </a>
            <a href="#download" className="btn btn-secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/></svg>
              Baixar para Windows
            </a>
          </div>
          <div className="hero-meta">
            <span><span className="dot"></span> Beta pública</span>
            <span>·</span>
            <span>Sem cadastro pra baixar</span>
            <span>·</span>
            <span>~6–9 MB</span>
          </div>
        </div>
      </div>
    </header>
  )
}
