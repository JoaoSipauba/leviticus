// apps/desktop/e2e/specs/21-splash-boot.spec.ts
//
// Splash de boot + check de atualização.
//
// Contexto: o boot agora roda checkUpdateOnBoot() em paralelo ao auth, e o
// splash (index.html) só é dispensado quando o evento leviticus-ready dispara
// — que depende do gate updateCheckDone (App.tsx). Se esse gate travasse, o
// splash nunca sumiria e o app ficaria preso. Esta spec trava essa regressão.
//
// O fluxo real de update não roda em E2E: tauri.conf.dev.json tem
// updater.endpoints:[], então check() lança "does not have any endpoints" e o
// boot segue normal. A lógica do updater é coberta nos testes de componente.

import { browser, $, expect } from '@wdio/globals'
import { cleanLocalSqlite } from '../helpers/app.js'

describe('Journey #21 — splash de boot', () => {
  before(async () => {
    await cleanLocalSqlite()
  })

  it('dispensa o splash e chega no /login', async () => {
    // App sem sessão: o boot resolve auth + check de update e dispara
    // leviticus-ready. Chegar no /login prova que o gate updateCheckDone
    // resolveu — se travasse, o splash nunca sumiria.
    await browser.waitUntil(
      async () => /\/login(\?|$|\/)/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Não chegou no /login — splash pode estar travado' },
    )
    // #boot-splash é removido do DOM após o fade-out do leviticus-ready.
    await browser.waitUntil(
      async () => !(await $('#boot-splash').isExisting()),
      { timeout: 10_000, timeoutMsg: '#boot-splash não foi removido do DOM' },
    )
    await expect($('input[type=email]')).toExist()
  })

  it('evento leviticus-updating revela o estado "Instalando atualização"', async () => {
    // O listener de leviticus-updating é registrado no index.html no load e
    // persiste no window mesmo após o splash sumir. App.tsx dispara esse
    // evento quando o check de boot acha um update. Aqui recriamos os nós que
    // o handler espera e verificamos que ele os revela com a versão — é o
    // contrato entre App.tsx e o index.html.
    const result = await browser.execute(() => {
      const status = document.createElement('div')
      status.id = 'boot-status'
      const version = document.createElement('div')
      version.id = 'boot-status-version'
      status.appendChild(version)
      document.body.appendChild(status)

      window.dispatchEvent(
        new CustomEvent('leviticus-updating', { detail: { version: '9.9.9' } }),
      )
      return {
        shown: status.classList.contains('show'),
        versionText: version.textContent,
      }
    })
    expect(result.shown).toBe(true)
    expect(result.versionText).toBe('versão 9.9.9')
  })
})
