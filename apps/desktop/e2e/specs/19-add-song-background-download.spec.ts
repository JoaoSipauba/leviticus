// apps/desktop/e2e/specs/19-add-song-background-download.spec.ts
//
// Issue #71 — downloads em background.
//
// Sintoma original: ao adicionar música do YouTube, o modal travava o user
// na tela "Baixando…" por minutos. Não dava pra adicionar outra música nem
// fazer mais nada no app.
//
// Fix: handleConfirm() agora enfileira o download via useDownloadsStore e
// pula direto pro step 4 (sucesso). Modal fecha em ~1.5s. Progresso fica
// no DownloadDock global (canto inferior direito). Upload pro Drive roda
// em subscribeCompleted do Layout.

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
  installYtDlpMock,
  setYtDlpMockMode,
} from '../helpers/app.js'
import { makeAdminClient, findSongByYoutubeUrl } from '../helpers/supabase.js'

describe('Journey #19 — Add song com download em background (#71)', () => {
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    await installYtDlpMock()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'add-bg-19' })
    orgId = seeded.orgId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('T1 — modal fecha rápido + DownloadDock aparece', async () => {
    await setYtDlpMockMode('happy')
    const supabase = makeAdminClient()
    const videoId = 'bg19happy'
    const url = `https://youtube.com/watch?v=${videoId}`

    // Abre modal e inicia fluxo
    await $('button*=Adicionar').click()
    const pasteTab = $('button=Colar URL')
    if (await pasteTab.isExisting()) await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()
    const submitBtn = $('button=Baixar música')
    await submitBtn.waitForExist({ timeout: 15_000 })
    await submitBtn.click()

    // CRÍTICO: o modal NÃO deve mais mostrar "Não feche esta janela durante
    // o download". Esse texto era o step 3 bloqueante. Agora o fluxo pula
    // direto pra step 4 (sucesso).
    await browser.pause(2_000)
    const blockingText = $('div*=Não feche esta janela durante o download')
    expect(await blockingText.isExisting()).toBe(false)

    // DownloadDock aparece no Layout (acima do PlayerMini). Conteúdo:
    // "↓ N baixando" ou "↓ 1 na fila", dependendo de quão rápido o yt-dlp
    // mock processou.
    const dock = $('[role="region"][aria-label="Downloads em andamento"]')
    await dock.waitForExist({
      timeout: 5_000,
      timeoutMsg: 'DownloadDock não apareceu após enfileirar',
    })

    // Song row aparece no Supabase (insert é síncrono, download em fila)
    const song = await findSongByYoutubeUrl(supabase, orgId, url, 15_000)
    if (!song) throw new Error('Song row não persistiu')
    expect(song.title).toBe('Test Song Title')
  })

  it('T2 — adicionar 3 músicas em sequência sem bloqueio', async () => {
    await setYtDlpMockMode('happy')
    const urls = [
      'https://youtube.com/watch?v=bg19seq1',
      'https://youtube.com/watch?v=bg19seq2',
      'https://youtube.com/watch?v=bg19seq3',
    ]

    for (const url of urls) {
      const addBtn = $('button*=Adicionar')
      await addBtn.waitForExist({ timeout: 10_000 })
      await addBtn.click()

      const pasteTab = $('button=Colar URL')
      if (await pasteTab.isExisting()) await pasteTab.click()
      await setReactInputValue('input[placeholder*="youtube.com"]', url)
      await $('button=Buscar informações').click()

      const submitBtn = $('button=Baixar música')
      await submitBtn.waitForExist({ timeout: 15_000 })
      await submitBtn.click()

      // Step 4 (sucesso) aparece rápido — modal vai fechar sozinho.
      // Aguardamos o botão "Adicionar" do header ficar acessível de novo
      // pra confirmar que o modal fechou.
      await browser.waitUntil(
        async () => {
          const modal = $('div*=Não feche esta janela durante o download')
          return !(await modal.isExisting())
        },
        { timeout: 10_000, timeoutMsg: 'Modal não fechou rápido (step 3 ainda bloqueia?)' }
      )
      await browser.pause(500) // espera modal fechar visualmente
    }

    // Todas as 3 songs persistiram no Supabase
    const supabase = makeAdminClient()
    for (const url of urls) {
      const song = await findSongByYoutubeUrl(supabase, orgId, url, 15_000)
      if (!song) throw new Error(`Song ${url} não persistiu`)
    }

    // Dock pode estar visível com agregado ou já vazio (yt-dlp mock é rápido).
    // Não asserta porque é flaky no timing.
  })
})
