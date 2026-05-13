import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Leviticus — Player offline pra equipes de louvor',
  description: 'Leviticus é o player desktop para equipes de louvor. Organize o repertório dos ministérios, monte o setlist do culto e toque no domingo — mesmo sem internet na igreja.',
  keywords: 'player offline igreja, repertório de louvor, software ministerio louvor, organizador repertório culto, biblioteca musical offline igreja, setlist culto, app equipe de louvor',
  openGraph: {
    title: 'Leviticus — Player offline pra equipes de louvor',
    description: 'Repertório do culto sempre pronto, sempre offline. Organize por ministério, monte o setlist e sincronize a equipe.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
