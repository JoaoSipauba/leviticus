import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router.js'
import { initObservability } from './lib/observability.js'
import './index.css'

// Issue #39: liga Sentry ANTES de render — pega erros do React tree
// desde o primeiro frame. No-op se VITE_SENTRY_DSN não configurado.
initObservability()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)

// Failsafe: se algum caminho exótico não disparar o evento explicitamente
// (App.tsx ou LoginRoute deveriam cobrir tudo), esconde o splash após 5s
// pra nunca prender o usuário em loading indefinido.
window.setTimeout(() => window.dispatchEvent(new Event('leviticus-ready')), 5000)
