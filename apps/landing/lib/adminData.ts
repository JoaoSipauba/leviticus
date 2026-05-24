import { getAdminLanding, type LandingData } from './adminLanding'
import { getAdminProduto, type ProdutoData } from './adminProduto'
import { getAdminSaude, type SaudeData } from './adminSaude'
import { resolvePeriod, computePrevPeriod, type Period, type PresetKey } from './adminPeriod'

export type AdminData = {
  period: Period
  prevPeriod: Period
  landing: LandingData
  produto: ProdutoData
  saude: SaudeData
  fetchedAt: string
}

export { resolvePeriod, type Period, type PresetKey }
export type { LandingData, ProdutoData, SaudeData }

// Re-exports pra compat com componentes existentes que importam de adminData
export type { VercelPoint, NameCount } from './adminLanding'
export type { HeatCell, DayPoint, ActivityPoint, OrgRow, ActivityRow } from './adminProduto'
export type { ErrorPoint, SentryIssue } from './adminSaude'

export async function getAdminData(period: Period): Promise<AdminData> {
  const prevPeriod = computePrevPeriod(period)
  const [landing, produto, saude] = await Promise.all([
    getAdminLanding(period, prevPeriod),
    getAdminProduto(period, prevPeriod),
    getAdminSaude(period, prevPeriod),
  ])
  return { period, prevPeriod, landing, produto, saude, fetchedAt: new Date().toISOString() }
}
