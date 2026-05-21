import { useEffect, useRef } from 'react'

/**
 * Dispara `refetch` toda vez que a aba/seção passa a ficar ATIVA — exceto na
 * primeira renderização (a carga inicial fica por conta do mount).
 *
 * Pra um refetch SILENCIOSO (stale-while-revalidate): o componente deve
 * manter o dado atual na tela e não voltar o estado de `loading` pra `true`
 * no refetch. Assim o usuário vê o dado antigo enquanto o novo chega — sem
 * skeleton piscando.
 *
 * Usado na tela de Organização: todas as abas ficam montadas e trocar de aba
 * só alterna visibilidade; este hook revalida o dado da aba que reaparece.
 */
export function useRefetchOnActive(active: boolean, refetch: () => void): void {
  // Ref pra sempre chamar a versão mais recente de `refetch` sem precisar
  // colocá-la nas deps do effect (ela é recriada a cada render).
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (active) refetchRef.current()
  }, [active])
}
