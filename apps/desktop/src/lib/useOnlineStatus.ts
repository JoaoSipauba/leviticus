import { useNetworkStore } from './network.js'

// Issue #31: agora lê do store global em vez de só `navigator.onLine`.
// O store é atualizado pelo `startNetworkMonitor()` (ligado no boot do App)
// que combina navigator.onLine + health check ativo pra detectar captive
// portal / ISP fora / router morto. Componentes que usam isso vão receber
// status real, não só o do NIC.
export function useOnlineStatus(): boolean {
  return useNetworkStore((s) => s.online)
}
