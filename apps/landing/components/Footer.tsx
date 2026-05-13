import { APP_VERSION, DOMAIN } from '@/lib/config'
import Logo from '@/components/Logo'

export default function Footer() {
  return (
    <footer className="footer" data-screen-label="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo size={18} />
        </div>
        <div className="footer-meta">{DOMAIN} · feito pra equipes de louvor · v{APP_VERSION}</div>
        <div className="footer-links">
          <a href="#recursos">Recursos</a>
          <a href="#download">Download</a>
          <a href="#faq">FAQ</a>
          <a href="#doacao">Doar</a>
          <a href="mailto:appleviticus@gmail.com">Contato</a>
        </div>
      </div>
    </footer>
  )
}
