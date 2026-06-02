import { getCurrentWindow } from '@tauri-apps/api/window'

// Flag em localStorage pra sinalizar que o próximo boot é resultado de um
// relaunch pós-update — não de uma abertura manual do usuário. Sem isso,
// no macOS o processo recém-spawned pelo `relaunch()` do plugin-process
// não recebe foco automático e a janela aparece atrás de outras (issue #159).
const RELAUNCH_FOCUS_FLAG = 'leviticus_relaunch_focus_pending'

// Marca a flag ANTES do `relaunch()` do plugin-process. Chamar nos dois
// fluxos do updater: boot install ([boot-update.ts]) e periodic install
// ([UpdateNotification.tsx]).
export function markRelaunchForFocus(): void {
  try {
    localStorage.setItem(RELAUNCH_FOCUS_FLAG, '1')
  } catch {
    // localStorage indisponível (Safari private, etc.) — fail-silent;
    // o pior caso é a janela voltar em background, comportamento atual.
  }
}

// Lê a flag no boot e, se estiver setada, traz a janela main pra frente.
// Consome a flag (clear) independente de sucesso pra não focar em boots
// subsequentes (ex: usuário reabriu manualmente depois de fechar). No
// macOS, `setFocus()` do Tauri chama `NSApp activateIgnoringOtherApps:YES`
// + `makeKeyAndOrderFront`, que é o suficiente pra ganhar foreground.
export async function focusIfRelaunched(): Promise<void> {
  let pending: string | null
  try {
    pending = localStorage.getItem(RELAUNCH_FOCUS_FLAG)
  } catch {
    return
  }
  if (pending !== '1') return
  try {
    localStorage.removeItem(RELAUNCH_FOCUS_FLAG)
  } catch {
    // mesmo se não conseguir limpar, segue e tenta focar — clear depois.
  }
  try {
    const win = getCurrentWindow()
    // Ordem importa: show antes de unminimize antes de setFocus. Se a
    // janela tiver sido fechada pro tray (hipotético — hoje não fazemos
    // isso, mas defensivo), show garante visibilidade antes do foco.
    await win.show()
    await win.unminimize()
    await win.setFocus()
  } catch (e) {
    // Falha aqui não pode quebrar o boot — só piora pro estado atual.
    console.warn('[post-relaunch-focus] falha ao focar janela:', e)
  }
}
