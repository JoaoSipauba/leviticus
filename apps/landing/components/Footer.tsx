export default function Footer() {
  return (
    <footer className="footer" data-screen-label="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="logo-mark" style={{ height: '18px' }}><span></span><span></span><span></span><span></span><span></span><span></span></span>
          <span className="word">Leviticus</span>
        </div>
        <div className="footer-meta">leviticus.app · feito pra equipes de louvor · v0.1.13</div>
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
