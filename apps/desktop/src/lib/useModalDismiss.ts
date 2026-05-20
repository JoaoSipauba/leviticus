import { useEffect } from 'react'

// Issue #91: política unificada de fechamento de modais.
//
// - Esc → sempre fecha, EXCETO durante operação em andamento (`busy`).
// - Clique-fora (backdrop) → fecha SOMENTE quando seguro: sem campos
//   preenchidos / seleção ativa (`canDismissOutside`) e não `busy`.
// - Operação em andamento (`busy`) → trava Esc e clique-fora pra não
//   deixar a operação órfã.
//
// Uso:
//   const { onBackdropClick } = useModalDismiss({ onClose, canDismissOutside, busy })
//   <div className="backdrop" onClick={onBackdropClick}>
//     <div className="modal" onClick={(e) => e.stopPropagation()}> ... </div>
//   </div>

type UseModalDismissOptions = {
  /** Fecha o modal. */
  onClose: () => void
  /**
   * true quando é seguro descartar via clique-fora — ou seja, não há
   * dados digitados/selecionados que seriam perdidos. Modais de
   * confirmação sem formulário passam `true` fixo.
   */
  canDismissOutside: boolean
  /**
   * true enquanto uma operação async está rodando (salvando, baixando,
   * migrando). Trava Esc e clique-fora.
   */
  busy?: boolean
}

export function useModalDismiss({
  onClose,
  canDismissOutside,
  busy = false,
}: UseModalDismissOptions): { onBackdropClick: () => void } {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function onBackdropClick() {
    if (canDismissOutside && !busy) onClose()
  }

  return { onBackdropClick }
}
