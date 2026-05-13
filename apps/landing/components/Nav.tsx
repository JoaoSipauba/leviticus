'use client'

import { useState } from 'react'

export default function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="nav" data-screen-label="nav">
      <div className="container nav-inner">
        <a href="/" className="nav-brand">
          <span className="logo-mark"><span></span><span></span><span></span><span></span><span></span><span></span></span>
          <span className="word">Leviticus</span>
        </a>
        <button
          className="nav-toggle"
          aria-label="Abrir menu"
          onClick={() => setOpen(v => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div className={`nav-links${open ? ' open' : ''}`}>
          <a href="#recursos" onClick={() => setOpen(false)}>Recursos</a>
          <a href="#como" onClick={() => setOpen(false)}>Como funciona</a>
          <a href="#download" onClick={() => setOpen(false)}>Download</a>
          <a href="#comparacao" onClick={() => setOpen(false)}>Comparação</a>
          <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
          <a href="#doacao" onClick={() => setOpen(false)}>Doar</a>
          <a href="#download" className="nav-cta" onClick={() => setOpen(false)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v14M5 12l7 7 7-7"/></svg>
            Baixar agora
          </a>
        </div>
      </div>
    </nav>
  )
}
