import { DOMAIN, GITHUB_URL } from '@/lib/config'
import Logo from '@/components/Logo'

type Props = { version?: string }

export default function Footer({ version }: Props) {
  // Sem versão (feed indisponível): omite o sufixo "· vX.Y.Z" em vez de
  // exibir uma versão hardcoded que pode estar desatualizada.
  const suffix = version ? ` · v${version}` : ''
  return (
    <footer className="footer" data-screen-label="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo size={18} />
        </div>
        <div className="footer-meta">{DOMAIN} · feito pra equipes de louvor{suffix}</div>
        <div className="footer-links">
          <a href="#recursos">Recursos</a>
          <a href="#download">Download</a>
          <a href="#faq">FAQ</a>
          <a href="#doacao">Doar</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="mailto:appleviticus@gmail.com">Contato</a>
        </div>
      </div>
    </footer>
  )
}
