'use client'

import { useState } from 'react'
import Logo from '@/components/Logo'
import { GITHUB_URL } from '@/lib/config'

export default function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="nav" data-screen-label="nav">
      <div className="container nav-inner">
        <a href="/" className="nav-brand">
          <Logo size={22} />
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
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-github"
            aria-label="Código no GitHub"
            onClick={() => setOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.01-2.11-3.19.69-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.27-5.23-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.37-5.25 5.65.41.35.78 1.05.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.9C23.5 5.65 18.35.5 12 .5z"/>
            </svg>
          </a>
          <a href="#download" className="nav-cta" onClick={() => setOpen(false)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v14M5 12l7 7 7-7"/></svg>
            Baixar agora
          </a>
        </div>
      </div>
    </nav>
  )
}
