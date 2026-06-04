// apps/desktop/e2e/specs/22-permission-gating.spec.ts
//
// Journey #22 — Permission gating (#120).
//
// Um membro SEM papel (logo, sem nenhuma permissão) não pode ver os controles
// de ação espalhados pelo app. Este spec loga como esse membro e confere que
// os gatilhos de criar/editar/excluir estão ocultos — mas que o conteúdo em
// si continua visível (gating ≠ esconder a página inteira).
//
// Setup: o host (owner) cria a org e o conteúdo-semente via service-role; o
// joiner entra como `organization_members` sem assignment de papel.

import { browser, $, expect } from '@wdio/globals'
import { cleanLocalSqlite, setReactInputValue } from '../helpers/app.js'
import {
  makeAdminClient,
  createTestUser,
  createOrgWithOwner,
  createSongForOrg,
  createGroupForOrg,
  createPlaylistForOrg,
  E2E_FIXTURE_PASSWORD,
} from '../helpers/supabase.js'

/** Espera o boot terminar — o `#boot-splash` só some após o syncOrg commitar. */
async function waitBootDone(): Promise<void> {
  await browser.waitUntil(
    async () => !(await $('#boot-splash').isExisting()),
    { timeout: 60_000, timeoutMsg: 'Splash de boot não sumiu — syncOrg não completou' },
  )
}

describe('Journey #22 — Permission gating (#120)', () => {
  let orgName: string
  let playlistId: string

  before(async () => {
    // Em modo suíte, specs anteriores deixam o app logado. Sem signout, o
    // login do joiner herda `leviticus_org_id` da org anterior — onde ele
    // não é membro → RLS filtra tudo e nada aparece. Sair antes do clean.
    const currentUrl = await browser.getUrl()
    if (!/\/login/.test(currentUrl)) {
      // Garante que estamos numa página com a Sidebar (que tem o botão "Sair").
      // Se o app estiver em /org (sem Sidebar), navegar para /library primeiro.
      if (!/\/(library|services|manage|ministries)/.test(currentUrl)) {
        await browser.url('tauri://localhost/library')
        await browser.waitUntil(
          async () => !(await browser.$('#boot-splash').isExisting()),
          { timeout: 60_000, timeoutMsg: 'Boot splash did not disappear before logout' }
        )
      }
      const sairBtn = $('button=Sair')
      await sairBtn.waitForExist({ timeout: 10_000 })
      await sairBtn.click()
      const signOutInModal = $('button*=Sair da conta')
      await signOutInModal.waitForExist({ timeout: 5_000 })
      await signOutInModal.click()
      await browser.waitUntil(
        async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
        { timeout: 20_000, timeoutMsg: 'Não redirecionou pra /login após Sair' },
      )
    }
    await cleanLocalSqlite()
    const admin = makeAdminClient()
    const ts = Date.now()

    // Host = owner. O trigger seed_owner_role cria o papel Dono pra ele.
    const host = await createTestUser(admin, { email: `perm-host+${ts}@leviticus.test` })
    const org = await createOrgWithOwner(admin, host.id, `Igreja Permissões ${ts}`)
    orgName = org.name

    // Joiner = membro sem papel. organization_members sem user_role_assignments
    // → o permissions store resolve perms vazias, isOwner=false.
    const joiner = await createTestUser(admin, { email: `perm-joiner+${ts}@leviticus.test` })
    const { error: memberErr } = await admin
      .from('organization_members')
      .insert({ user_id: joiner.id, org_id: org.id })
    if (memberErr) throw new Error(`member insert falhou: ${memberErr.message}`)

    // Conteúdo-semente: garante que cada tela tem algo pra (não) gerenciar —
    // sem isso, "controle ausente" poderia ser falso positivo de tela vazia.
    await createSongForOrg(admin, org.id, host.id, 'Música Semente')
    await createGroupForOrg(admin, org.id, 'Ministério Semente')
    const playlist = await createPlaylistForOrg(
      admin, org.id, host.id, 'Culto Semente', new Date(ts + 24 * 3600 * 1000),
    )
    playlistId = playlist.id

    // Login pela UI como o joiner. App boota em /login (sem sessão após o
    // cleanLocalSqlite + wipe de WKWebView do beforeSession).
    await browser.waitUntil(
      async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
      { timeout: 30_000, timeoutMsg: 'Tela de login não carregou' },
    )
    await $('input[type=email]').waitForExist({ timeout: 30_000 })
    await setReactInputValue('input#email', joiner.email)
    await setReactInputValue('input#password', E2E_FIXTURE_PASSWORD)
    const submit = $('button[type=submit]')
    await submit.waitForEnabled({ timeout: 5_000 })
    await submit.click()

    // /org → seleciona a org da qual o joiner é membro.
    await browser.waitUntil(
      async () => /\/org$/.test(await browser.getUrl()),
      { timeout: 20_000, timeoutMsg: 'Não redirecionou pra /org após login' },
    )
    const orgBtn = $(`button*=${orgName}`)
    await orgBtn.waitForExist({ timeout: 10_000 })
    await orgBtn.click()
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Não chegou em /library após selecionar a org' },
    )
  })

  it('Biblioteca: membro vê músicas mas não vê "Adicionar"', async () => {
    await browser.url('tauri://localhost/library')
    await waitBootDone()
    // Sanity: a música-semente carregou — confirma que estamos numa tela
    // populada, não numa biblioteca vazia que esconderia o botão por outro motivo.
    await browser.waitUntil(
      async () => (await $('p*=Música Semente')).isExisting(),
      { timeout: 30_000, timeoutMsg: 'Música-semente não apareceu na biblioteca' },
    )
    expect(await $('button=Adicionar').isExisting()).toBe(false)
  })

  it('SongCard: menu de ação não expõe Editar nem Excluir', async () => {
    await browser.url('tauri://localhost/library')
    await waitBootDone()
    await browser.waitUntil(
      async () => (await $('p*=Música Semente')).isExisting(),
      { timeout: 30_000, timeoutMsg: 'Música-semente não apareceu' },
    )
    const menuBtn = $('button[aria-label="Mais ações"]')
    await menuBtn.waitForExist({ timeout: 10_000 })
    await menuBtn.click()
    // Sem manage_songs, e sem arquivo local, o menu não tem nenhum item.
    expect(await $('[role="menuitem"]').isExisting()).toBe(false)
  })

  it('Ministérios: membro não vê botão de criar', async () => {
    await browser.url('tauri://localhost/ministries')
    await waitBootDone()
    await browser.waitUntil(
      async () => (await $('p*=Ministério Semente')).isExisting(),
      { timeout: 30_000, timeoutMsg: 'Ministério-semente não apareceu' },
    )
    expect(await $('button=Novo').isExisting()).toBe(false)
    expect(await $('*=Criar primeiro ministério').isExisting()).toBe(false)
  })

  it('Cultos: membro não vê "Novo culto"', async () => {
    await browser.url('tauri://localhost/services')
    await waitBootDone()
    await browser.waitUntil(
      async () => (await $('p*=Culto Semente')).isExisting(),
      { timeout: 30_000, timeoutMsg: 'Culto-semente não apareceu' },
    )
    expect(await $('button*=Novo culto').isExisting()).toBe(false)
  })

  it('Detalhe do culto: membro não vê "Adicionar seção"', async () => {
    // PlaylistDetail redireciona pra /services se a playlist ainda não está
    // no SQLite local. Re-navega até o detalhe ficar de pé (o h1 com o nome
    // do culto só existe na tela de detalhe).
    const url = `tauri://localhost/services/${playlistId}`
    await browser.waitUntil(
      async () => {
        await browser.url(url)
        await waitBootDone()
        return (await $('h1*=Culto Semente')).isExisting()
      },
      { timeout: 150_000, interval: 2_000, timeoutMsg: 'PlaylistDetail nunca carregou' },
    )
    expect(await $('button*=Adicionar seção').isExisting()).toBe(false)
  })

  it('Organização: abas Papéis e Convites escondidas pra quem não as gerencia', async () => {
    await browser.url('tauri://localhost/manage')
    await waitBootDone()
    // Sanity: as abas livres pra qualquer membro renderizam.
    await browser.waitUntil(
      async () => (await $('button*=Membros')).isExisting(),
      { timeout: 30_000, timeoutMsg: 'Aba Membros não renderizou' },
    )
    expect(await $('button*=Papéis').isExisting()).toBe(false)
    expect(await $('button*=Convites').isExisting()).toBe(false)
  })
})
