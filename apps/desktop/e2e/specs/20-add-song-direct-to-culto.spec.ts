// apps/desktop/e2e/specs/20-add-song-direct-to-culto.spec.ts
//
// Feature: adicionar música nova (fluxo de download) direto numa seção do
// culto. Spec: docs/superpowers/specs/2026-05-20-add-song-direct-to-culto-design.md
//
// Jornada: dentro de um culto, o botão "+ Adicionar música" abre o seletor;
// a aba "Baixar nova" abre o AddSongModal com o contexto da seção. Ao
// confirmar, a música é criada na biblioteca, o download vai pra background
// E a música é vinculada à seção do culto via add_song_to_playlist.
//
// yt-dlp é mockado (regra do projeto: nada de download real do YouTube).

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  setReactInputValue,
  signupAndCreateOrg,
  installYtDlpMock,
  setYtDlpMockMode,
  gotoPlaylistDetail,
} from '../helpers/app.js'
import {
  makeAdminClient,
  createPlaylistForOrg,
  findSongByYoutubeUrl,
} from '../helpers/supabase.js'

describe('Journey #20 — Adicionar música nova direto no culto', () => {
  let orgId: string
  let userId: string

  before(async () => {
    await cleanLocalSqlite()
    await installYtDlpMock()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'culto-add-20' })
    orgId = seeded.orgId
    userId = seeded.userId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('aba "Baixar nova" baixa a música e vincula à seção do culto', async () => {
    await setYtDlpMockMode('happy')
    const admin = makeAdminClient()

    // ── Setup: cria um culto via admin ──────────────────────────────────────
    const playlist = await createPlaylistForOrg(
      admin, orgId, userId, `Culto Add 20 ${Date.now()}`, new Date()
    )

    // Navega pro detalhe do culto — re-tenta até PlaylistDetail carregar,
    // sem depender do timing do syncOrg do boot (ver gotoPlaylistDetail, #100).
    await gotoPlaylistDetail(playlist.id)

    // ── Cria uma seção avulso ───────────────────────────────────────────────
    const addSectionBtn = $('button*=Adicionar seção')
    await addSectionBtn.waitForExist({ timeout: 15_000 })
    await addSectionBtn.click()

    const avulsoTab = $('button=Avulso')
    await avulsoTab.waitForExist({ timeout: 5_000 })
    await avulsoTab.click()

    const sectionLabel = `Seção 20 ${Date.now()}`
    await $('input[placeholder*="Cantora Maria"]').waitForExist({ timeout: 5_000 })
    await setReactInputValue('input[placeholder*="Cantora Maria"]', sectionLabel)
    const criarBtn = $('button=Criar seção')
    await criarBtn.waitForEnabled({ timeout: 5_000 })
    await criarBtn.click()
    await criarBtn.waitForExist({ timeout: 5_000, reverse: true })

    // ── Abre o seletor de músicas da seção ──────────────────────────────────
    const addMusicBtn = $('button*=Adicionar música')
    await addMusicBtn.waitForExist({ timeout: 10_000, timeoutMsg: '"Adicionar música" não apareceu' })
    await addMusicBtn.click()

    // Segmented control: clica "Baixar nova" → abre o AddSongModal
    const baixarNovaTab = $('button=Baixar nova')
    await baixarNovaTab.waitForExist({ timeout: 10_000, timeoutMsg: 'Aba "Baixar nova" não apareceu' })
    await baixarNovaTab.click()

    // ── Fluxo de download no AddSongModal ───────────────────────────────────
    const videoId = 'culto20song' // 11 chars (regex do YouTube)
    const url = `https://youtube.com/watch?v=${videoId}`

    const pasteTab = $('button=Colar URL')
    await pasteTab.waitForExist({ timeout: 10_000, timeoutMsg: 'AddSongModal não abriu (aba Colar URL ausente)' })
    await pasteTab.click()

    await setReactInputValue('input[placeholder*="youtube.com"]', url)
    await $('button=Buscar informações').click()

    const submitBtn = $('button=Baixar música')
    await submitBtn.waitForExist({ timeout: 15_000 })
    await submitBtn.click()

    // ── Tela final em contexto-de-culto ─────────────────────────────────────
    const successMsg = $('div*=Música adicionada ao culto')
    await successMsg.waitForExist({
      timeout: 10_000,
      timeoutMsg: 'Step 4 não mostrou "Música adicionada ao culto"',
    })
    // NÃO deve haver "Ver biblioteca" — o usuário não é mandado pra biblioteca.
    expect(await $('button=Ver biblioteca').isExisting()).toBe(false)

    // ── Asserções no Supabase ───────────────────────────────────────────────
    // 1. Linha em songs criada pra org.
    const song = await findSongByYoutubeUrl(admin, orgId, url, 15_000)
    if (!song) throw new Error('Song row não persistiu no Supabase')
    expect(song.title).toBe('Test Song Title')

    // 2. Linha em playlist_songs ligando a música ao culto.
    let linked = false
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const { data } = await admin
        .from('playlist_songs')
        .select('song_id, section_id')
        .eq('playlist_id', playlist.id)
        .eq('song_id', song.id)
      if (data && data.length >= 1) { linked = true; break }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!linked) {
      throw new Error(`playlist_songs não vinculou a música ${song.id} ao culto ${playlist.id}`)
    }
    expect(linked).toBe(true)

    // Fecha o modal — em contexto-de-culto o botão é "Concluído".
    const concluido = $('button=Concluído')
    if (await concluido.isExisting()) await concluido.click()

    // NÃO navegou pra /library — continua no culto.
    expect(await browser.getUrl()).toContain(`/services/${playlist.id}`)
  })
})
