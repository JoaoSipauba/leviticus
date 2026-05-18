import * as Sentry from '@sentry/react'
import { env } from '../env.js'

// Wrapper único em volta do Sentry pra:
//   1. Permitir trocar de provider depois sem caçar imports
//   2. Virar no-op quando DSN não tá configurado (dev local) — sem
//      poluir o painel do Sentry com ruído de desenvolvimento
//   3. Garantir contexto rico (user.org, breadcrumbs) sem espalhar
//      boilerplate pelos catches
//
// Issue #39.

let initialized = false

/**
 * Inicializa Sentry. Chama uma vez no boot (main.tsx). Idempotente.
 * No-op se VITE_SENTRY_DSN não foi configurado.
 */
export function initObservability(): void {
  if (initialized) return
  if (!env.sentryDsn) {
    if (env.mode === 'development') {
      console.info('[observability] VITE_SENTRY_DSN ausente — Sentry desligado (esperado em dev)')
    }
    initialized = true  // marca pra não logar isso de novo
    return
  }
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.mode,
    // Sample rate baixo em prod pra não estourar quota free (5k/mês).
    // 100% dos erros, 10% de traces de performance.
    tracesSampleRate: 0.1,
    // PII desligado — usuário de igreja é gente real, dado sensível.
    // org_id/user_id mandamos via tag/context manualmente quando útil.
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Filtra ruído conhecido. Adicione padrões aqui quando aparecer.
    ignoreErrors: [
      // Erros de extensões do navegador (ResizeObserver loop benigno)
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],
  })
  initialized = true
}

/**
 * Loga uma exceção pro Sentry com contexto opcional. Sempre dá fallback
 * em `console.error` antes — garante visibilidade local mesmo se Sentry
 * estiver desligado/offline.
 *
 * Use no `catch` de todo fluxo crítico:
 * ```ts
 * try { ... } catch (e) {
 *   captureException(e, { feature: 'add-song', step: 'upload' })
 *   toastError('Não foi possível adicionar a música')
 * }
 * ```
 */
export function captureException(
  error: unknown,
  context?: { feature?: string; step?: string; extras?: Record<string, unknown> },
): void {
  // Console sempre — mesmo com Sentry off, o erro fica acessível em
  // dev console / Tauri devtools.
  if (context) console.error(`[${context.feature ?? 'app'}${context.step ? `:${context.step}` : ''}]`, error)
  else console.error(error)

  if (!env.sentryDsn) return

  Sentry.withScope((scope) => {
    if (context?.feature) scope.setTag('feature', context.feature)
    if (context?.step) scope.setTag('step', context.step)
    if (context?.extras) scope.setContext('extras', context.extras)
    Sentry.captureException(error)
  })
}

/**
 * Sinaliza identidade do usuário no Sentry — chamar quando login resolve,
 * limpar quando faz logout. Sentry só usa pra agrupar erros por usuário
 * (não vaza email/nome a menos que sendDefaultPii=true).
 */
export function setUserContext(user: { id: string; orgId?: string } | null): void {
  if (!env.sentryDsn) return
  if (user === null) {
    Sentry.setUser(null)
    return
  }
  Sentry.setUser({ id: user.id })
  if (user.orgId) Sentry.setTag('org_id', user.orgId)
}

/**
 * Registra um breadcrumb — evento intermediário que ajuda a entender
 * o que o usuário fez antes de um erro. Não dispara request; só fica
 * no buffer e é enviado junto da próxima exceção.
 */
export function addBreadcrumb(message: string, category?: string, data?: Record<string, unknown>): void {
  if (!env.sentryDsn) return
  Sentry.addBreadcrumb({
    message,
    category: category ?? 'app',
    data,
    level: 'info',
  })
}
