import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

// O check de update no boot corre contra este timeout pra não segurar o
// splash quando offline — a chamada de rede pode demorar muito ou nunca
// resolver. 3s casa com o AUTH_BOOT_TIMEOUT_MS do App.tsx: como o splash
// já espera o auth por esse tempo, o check não adiciona latência ao boot.
const BOOT_CHECK_TIMEOUT_MS = 3000

// Verifica se há atualização disponível durante o splash. Nunca lança:
// falha de rede, ausência de endpoints (dev) ou timeout retornam null,
// e o boot segue normal na versão instalada.
export async function checkUpdateOnBoot(): Promise<Update | null> {
  // Catch embutido: se o timeout vencer primeiro, a promise do check
  // ainda pode rejeitar depois — sem isto viraria unhandled rejection.
  const checkPromise = check().catch((e) => {
    const msg = String((e as Error)?.message ?? e)
    // tauri.conf.dev.json tem endpoints:[] — em dev o erro é esperado.
    if (!msg.includes('does not have any endpoints')) {
      console.warn('[updater] check de boot falhou:', e)
    }
    return null
  })
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), BOOT_CHECK_TIMEOUT_MS),
  )
  const result = await Promise.race([checkPromise, timeout])
  return result ?? null
}

// Baixa e instala o update encontrado no boot, depois reinicia o app.
export async function installUpdateOnBoot(update: Update): Promise<void> {
  await update.download()
  await update.install()
  // macOS: install() apenas substitui o .app — precisa de relaunch
  // explícito. Windows: o instalador NSIS (installMode "quiet") reinicia
  // sozinho e mata o app antes do relaunch abaixo chegar a rodar.
  await relaunch()
}
