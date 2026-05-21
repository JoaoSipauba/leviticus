import { useEffect, useRef } from 'react'
import { useUIStore } from '../store/ui.js'

/**
 * Revalida o dado de uma aba — silenciosamente — em dois gatilhos:
 *
 *  1. **Troca de aba**: `active` passa de false → true.
 *  2. **Realtime**: o sync reativo (Realtime do Supabase, ou refocus da
 *     janela) atualizou o SQLite local. O `data-sync` incrementa
 *     `librarySeed` no `useUIStore` a cada passada reativa — este hook
 *     escuta esse tick e revalida a aba ATIVA na hora.
 *
 * Pula a 1ª renderização (a carga inicial fica por conta do mount). Pra ser
 * silencioso, o `refetch`/`load` do componente não deve voltar o estado de
 * loading pra `true` — o dado atual fica na tela até o novo chegar.
 *
 * Abas inativas não refazem fetch num tick de Realtime — elas revalidam
 * quando o usuário voltar pra elas (gatilho 1).
 */
export function useRefetchOnActive(active: boolean, refetch: () => void): void {
  // Ref pra sempre chamar a versão mais recente de `refetch` sem precisar
  // colocá-la nas deps do effect (ela é recriada a cada render).
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  // Tick global de "dado sincronizado" — bumpado pelo data-sync após cada
  // passada reativa (Realtime / refocus). Mudou = revalida a aba ativa.
  const dataVersion = useUIStore((s) => s.librarySeed)

  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (active) refetchRef.current()
  }, [active, dataVersion])
}
