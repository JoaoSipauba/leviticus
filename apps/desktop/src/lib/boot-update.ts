import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

// O check de update no boot corre contra este timeout pra não segurar o
// splash quando offline — a chamada de rede pode demorar muito ou nunca
// resolver. 3s casa com o AUTH_BOOT_TIMEOUT_MS do App.tsx: como o splash
// já espera o auth por esse tempo, o check não adiciona latência ao boot.
const BOOT_CHECK_TIMEOUT_MS = 3000

// Timeout do download durante o boot. Se a rede pendurar o download, o
// splash não pode ficar preso em "Instalando atualização" pra sempre —
// estoura, o App.tsx captura e libera o boot normal na versão atual.
const BOOT_DOWNLOAD_TIMEOUT_MS = 60_000

/**
 * Corre `promise` contra um timeout. Se o timeout vencer primeiro, rejeita
 * com Error. O timer é SEMPRE limpo no fim — não fica solto pra disparar
 * depois (vazaria um handle e atrapalharia testes).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout após ${ms}ms: ${label}`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

// Verifica se há atualização disponível durante o splash. Nunca lança:
// falha de rede, ausência de endpoints (dev) ou timeout retornam null,
// e o boot segue normal na versão instalada.
export async function checkUpdateOnBoot(): Promise<Update | null> {
  // `.catch` no check() garante que checkPromise nunca rejeita — assim, se
  // o timeout vencer a corrida, o check() não vira unhandled rejection.
  const checkPromise = check().catch((e) => {
    const msg = String((e as Error)?.message ?? e)
    // tauri.conf.dev.json tem endpoints:[] — em dev o erro é esperado.
    if (!msg.includes('does not have any endpoints')) {
      console.warn('[updater] check de boot falhou:', e)
    }
    return null
  })
  try {
    return await withTimeout(checkPromise, BOOT_CHECK_TIMEOUT_MS, 'check de update no boot')
  } catch {
    // Só o timeout chega aqui — checkPromise nunca rejeita.
    return null
  }
}

// Baixa e instala o update encontrado no boot, depois reinicia o app. O
// download tem timeout: se a rede pendurar, rejeita — o App.tsx captura e
// libera o boot normal em vez de deixar o splash preso.
export async function installUpdateOnBoot(update: Update): Promise<void> {
  await withTimeout(
    update.download(),
    BOOT_DOWNLOAD_TIMEOUT_MS,
    'download do update no boot',
  )
  await update.install()
  // macOS: install() apenas substitui o .app — precisa de relaunch
  // explícito. Windows: o instalador NSIS (installMode "quiet") reinicia
  // sozinho e mata o app antes do relaunch abaixo chegar a rodar.
  await relaunch()
}
