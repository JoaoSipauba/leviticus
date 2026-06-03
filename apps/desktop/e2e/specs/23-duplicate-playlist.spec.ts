// apps/desktop/e2e/specs/23-duplicate-playlist.spec.ts
//
// Issue #155 — duplicar culto existente.
// Cobre:
//   - Menu "Duplicar" no card de culto da listagem (/services)
//   - Modal abrindo em modo duplicação com prefill (nome "{orig} (cópia)" + data original)
//   - RPC duplicate_playlist cria nova playlist + copia músicas
//   - Navegação automática pra cópia ao salvar
//   - Independência: section_ids da cópia são DIFERENTES dos do original
//     (move/remove na cópia não afeta o original)
//
// Seed: 1 culto com 3 playlist_songs em 2 seções distintas (testa o
// remapeamento de section_id no RPC). Tudo via admin client pra evitar
// flakiness de UI no setup.

import { browser, $, expect } from '@wdio/globals'
import {
  cleanLocalSqlite,
  signupAndCreateOrg,
} from '../helpers/app.js'
import {
  makeAdminClient,
  createPlaylistForOrg,
  createSongForOrg,
} from '../helpers/supabase.js'

describe('Journey #155 — Duplicar culto', () => {
  let orgId: string
  let userId: string

  before(async () => {
    await cleanLocalSqlite()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'dup-playlist' })
    orgId = seeded.orgId
    userId = seeded.userId

    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('duplica um culto via menu ⋯ — RPC + navegação + independência de seções', async () => {
    const admin = makeAdminClient()

    // ── 1. Seed: culto fonte com músicas em 2 seções distintas ─────────
    // Data futura (não no passado) pra evitar validação "dia que já passou"
    // ao confirmar o modal.
    const sourceDate = new Date()
    sourceDate.setDate(sourceDate.getDate() + 7) // 1 semana à frente
    sourceDate.setHours(10, 0, 0, 0)

    const sourceName = `Culto Original ${Date.now()}`
    const source = await createPlaylistForOrg(admin, orgId, userId, sourceName, sourceDate, 2)

    const songAId = await createSongForOrg(admin, orgId, userId, 'Song A Dup')
    const songBId = await createSongForOrg(admin, orgId, userId, 'Song B Dup')
    const songCId = await createSongForOrg(admin, orgId, userId, 'Song C Dup')

    // Duas seções (uuids fixos pro teste — ambos avulsos, pra simplificar)
    const sectionAId = crypto.randomUUID()
    const sectionBId = crypto.randomUUID()

    const { error: psError } = await admin.from('playlist_songs').insert([
      {
        playlist_id: source.id,
        song_id: songAId,
        position: 1,
        section_id: sectionAId,
        section_label: 'Abertura',
        group_id: null,
      },
      {
        playlist_id: source.id,
        song_id: songBId,
        position: 2,
        section_id: sectionAId,
        section_label: 'Abertura',
        group_id: null,
      },
      {
        playlist_id: source.id,
        song_id: songCId,
        position: 3,
        section_id: sectionBId,
        section_label: 'Comunhão',
        group_id: null,
      },
    ])
    if (psError) throw new Error(`seed playlist_songs: ${psError.message}`)

    // ── 2. UI: navegar pra /services e abrir menu ⋯ → Duplicar ──────────
    await browser.url('tauri://localhost/services')

    // O card pode estar em "HOJE", "EM BREVE" ou "PASSADOS" — busca pelo nome.
    // Como a data é +7 dias, vai estar em "EM BREVE".
    const card = await browser.$(`*=${sourceName}`)
    await card.waitForExist({ timeout: 30_000, timeoutMsg: `Card "${sourceName}" não apareceu` })

    // Botão ⋯ do card é só visível em hover; força via JS o aria-label match
    // (mais robusto que tentar hover + click). Abre o primeiro encontrado;
    // como só temos 1 culto criado, é o certo.
    const moreBtn = await browser.$('button[aria-label="Mais ações"]')
    await moreBtn.waitForExist({ timeout: 5_000 })
    // Hover via mouseMove pra revelar o botão (opacity-0 → opacity-100)
    await moreBtn.moveTo()
    await moreBtn.click()

    // Click em "Duplicar"
    const duplicarItem = await browser.$('button*=Duplicar')
    await duplicarItem.waitForExist({ timeout: 5_000, timeoutMsg: 'Item "Duplicar" não apareceu no menu' })
    await duplicarItem.click()

    // ── 3. Modal abre em modo duplicação ──────────────────────────────
    // Título do modal deve ser "Duplicar culto"
    const modalTitle = await browser.$('h2*=Duplicar culto')
    await modalTitle.waitForExist({ timeout: 5_000, timeoutMsg: 'Modal de duplicação não abriu' })

    // Nome pré-preenchido com sufixo "(cópia)"
    const nameInput = await browser.$('input[placeholder*="Domingo Manhã"]')
    await nameInput.waitForExist({ timeout: 5_000 })
    const nameValue = await nameInput.getValue()
    expect(nameValue).toBe(`${sourceName} (cópia)`)

    // Botão "Duplicar" (mesma posição de "Criar" / "Salvar")
    const duplicarBtn = await browser.$('button=Duplicar')
    await duplicarBtn.waitForEnabled({ timeout: 5_000 })
    await duplicarBtn.click()

    // ── 4. Aguarda navegação pra cópia recém-criada ────────────────────
    await browser.waitUntil(
      async () => /\/services\/[a-f0-9-]+$/.test(await browser.getUrl()),
      { timeout: 15_000, timeoutMsg: 'Não navegou pra detalhe da cópia' }
    )
    const currentUrl = await browser.getUrl()
    const copyId = currentUrl.split('/').pop()!
    if (copyId === source.id) {
      throw new Error('Navegou pro culto ORIGINAL em vez da cópia')
    }

    // ── 5. Verifica no banco: playlist criada + playlist_songs copiadas ──
    // (Sem polling longo — o navigate só acontece após onSaved disparar
    // post-sync, então a row já está visível.)
    const { data: copy } = await admin
      .from('playlists')
      .select('id, name, scheduled_at, scheduled_end, org_id')
      .eq('id', copyId)
      .single()
    if (!copy) throw new Error(`Playlist cópia ${copyId} não encontrada no banco`)
    expect(copy.name).toBe(`${sourceName} (cópia)`)
    expect(copy.org_id).toBe(orgId)
    // Horário herdado do original (modal não foi editado). O modal trunca
    // segundos via inputs `time`, então comparamos os timestamps via Date pra
    // tolerar normalização que zere segundos/ms na ida-e-volta.
    const expectedStart = new Date(sourceDate.getTime())
    expectedStart.setSeconds(0, 0)
    const expectedEnd = new Date(sourceDate.getTime() + 2 * 3600 * 1000)
    expectedEnd.setSeconds(0, 0)
    expect(new Date(copy.scheduled_at).getTime()).toBe(expectedStart.getTime())
    expect(new Date(copy.scheduled_end).getTime()).toBe(expectedEnd.getTime())

    const { data: copySongs } = await admin
      .from('playlist_songs')
      .select('song_id, position, section_id, section_label, group_id')
      .eq('playlist_id', copyId)
      .order('position', { ascending: true })
    if (!copySongs) throw new Error('Não consegui ler playlist_songs da cópia')
    expect(copySongs.length).toBe(3)

    // Mesmas músicas, mesma ordem
    expect(copySongs.map((r: any) => r.song_id)).toEqual([songAId, songBId, songCId])
    expect(copySongs.map((r: any) => r.position)).toEqual([1, 2, 3])

    // Labels e group_ids preservados
    expect(copySongs.map((r: any) => r.section_label)).toEqual(['Abertura', 'Abertura', 'Comunhão'])
    expect(copySongs.every((r: any) => r.group_id === null)).toBe(true)

    // ── 6. CRÍTICO: section_ids da cópia são DIFERENTES do original ────
    // Garantia de independência — mover/remover seção na cópia não afeta o
    // original. Mas seções dentro da cópia que eram a mesma no original
    // continuam a mesma na cópia (Abertura tem 2 músicas com mesmo section_id).
    const copySectionA = copySongs[0].section_id // primeira "Abertura"
    const copySectionA2 = copySongs[1].section_id // segunda "Abertura"
    const copySectionB = copySongs[2].section_id // "Comunhão"

    expect(copySectionA).toBe(copySectionA2) // mesma seção interna preservada
    expect(copySectionA).not.toBe(copySectionB) // seções distintas continuam distintas
    expect(copySectionA).not.toBe(sectionAId) // diferente do original
    expect(copySectionB).not.toBe(sectionBId) // diferente do original

    // ── 7. Original permanece intacto ──────────────────────────────────
    const { data: sourceSongs } = await admin
      .from('playlist_songs')
      .select('song_id, position, section_id')
      .eq('playlist_id', source.id)
      .order('position', { ascending: true })
    if (!sourceSongs) throw new Error('Não consegui ler playlist_songs do original')
    expect(sourceSongs.length).toBe(3)
    // section_ids do original não foram tocados
    expect(sourceSongs[0].section_id).toBe(sectionAId)
    expect(sourceSongs[2].section_id).toBe(sectionBId)
  })
})
