import type { Metadata } from 'next'

// globals.css já é importado no root layout (app/layout.tsx) — aplica
// a todas as rotas, inclusive /admin. Não reimportar aqui.

export const metadata: Metadata = {
  title: 'Admin — Leviticus',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
