import { create } from 'zustand'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { env } from '../env.js'

// Issue #31: detecção de offline real (não só navigator.onLine).
//
// Problema: `navigator.onLine` reflete só o status da NIC. Em WiFi com
// captive portal não aceito, router morto, ISP fora, o NIC fica conectado
// mas as requests falham com timeout/DNS error. Usuário acha que tá online,
// operações estouram silenciosamente.
//
// Solução: health check ativo a cada 30s — HEAD pro endpoint REST do
// Supabase. Resposta 2xx/4xx (qualquer "alcançável") = online. Timeout ou
// network error = offline. Combinado com navigator.onLine como signal
// rápido (offline imediato quando WiFi cai).

type NetworkState = {
  online: boolean
  /** Última vez (ms) que o health check passou. Útil pra UI ("conexão
   *  recuperada agora"). */
  lastOkAt: number
  setOnline: (v: boolean) => void
}

export const useNetworkStore = create<NetworkState>((set) => ({
  // Inicial: assumimos online se o NIC reporta online. Primeiro health check
  // valida em ~3s.
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastOkAt: 0,
  setOnline: (online) => set((s) => ({
    online,
    lastOkAt: online ? Date.now() : s.lastOkAt,
  })),
}))

const HEALTH_CHECK_INTERVAL_MS = 30_000
const HEALTH_CHECK_TIMEOUT_MS = 5_000
const FIRST_CHECK_DELAY_MS = 3_000

let intervalId: ReturnType<typeof setInterval> | null = null
let nicListenersAttached = false

/**
 * Faz uma request HEAD leve pro Supabase REST endpoint. Resposta 2xx ou
 * 4xx (incluindo 401 sem auth) = host está alcançável. Timeout ou erro
 * de rede = offline. Retorna true se online, false caso contrário.
 *
 * Exportada pra testes; não chamar de hot path.
 */
export async function pingHealthCheck(): Promise<boolean> {
  if (!navigator.onLine) return false  // shortcut — NIC já disse
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
  try {
    const res = await tauriFetch(`${env.supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { apikey: env.supabaseAnonKey },
    })
    // Qualquer resposta HTTP (200, 401, 404) = host alcançável.
    return res.status >= 200 && res.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function runCheck() {
  const online = await pingHealthCheck()
  const current = useNetworkStore.getState().online
  if (online !== current) {
    useNetworkStore.getState().setOnline(online)
  }
}

/**
 * Inicia o monitor de rede. Chame no boot do App. Idempotente.
 *
 * - Liga listeners `online`/`offline` do navegador (signal rápido)
 * - Roda health check a cada 30s
 * - Quando NIC volta pra online, força check imediato (não espera 30s)
 */
export function startNetworkMonitor(): void {
  if (!nicListenersAttached) {
    window.addEventListener('online', onNicOnline)
    window.addEventListener('offline', onNicOffline)
    nicListenersAttached = true
  }
  if (intervalId === null) {
    // Primeiro check com pequeno delay pra não bloquear boot.
    setTimeout(runCheck, FIRST_CHECK_DELAY_MS)
    intervalId = setInterval(runCheck, HEALTH_CHECK_INTERVAL_MS)
  }
}

export function stopNetworkMonitor(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (nicListenersAttached) {
    window.removeEventListener('online', onNicOnline)
    window.removeEventListener('offline', onNicOffline)
    nicListenersAttached = false
  }
}

function onNicOnline() {
  // NIC voltou — força check imediato pra confirmar reachability real
  // (NIC pode mentir, ex: captive portal).
  void runCheck()
}

function onNicOffline() {
  // NIC caiu — instant offline. Health check não vai conseguir nada mesmo.
  useNetworkStore.getState().setOnline(false)
}
