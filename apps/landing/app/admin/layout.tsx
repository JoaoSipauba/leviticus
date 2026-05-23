import type { Metadata } from 'next'
import styles from './admin.module.css'

// globals.css já é importado no root layout (app/layout.tsx) — aplica
// a todas as rotas, inclusive /admin. Não reimportar aqui.

export const metadata: Metadata = {
  title: 'Admin — Leviticus',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Fontes apenas pro escopo admin — não poluem o root layout */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <div className={styles['admin-root']}>{children}</div>
    </>
  )
}
