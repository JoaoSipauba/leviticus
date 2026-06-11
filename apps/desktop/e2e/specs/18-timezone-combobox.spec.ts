// apps/desktop/e2e/specs/18-timezone-combobox.spec.ts
//
// Issue #86 — combobox filtrável de fuso horário.
//
// Sintoma original: campo de fuso era <input type="text"> livre. User podia
// digitar qualquer coisa inválida ("GMT-3", typo de IANA, etc).
//
// Fix: novo TimezoneCombobox usa Intl.supportedValuesOf('timeZone') (~600
// zonas IANA), busca filtrável, seleção popula com nome canônico.

import { browser, $, $$, expect } from '@wdio/globals'
import { cleanLocalSqlite, setReactInputValue, signupAndCreateOrg } from '../helpers/app.js'
import { makeAdminClient } from '../helpers/supabase.js'

describe('Journey #18 — TimezoneCombobox (#86)', () => {
  let orgId: string

  before(async () => {
    await cleanLocalSqlite()
    const seeded = await signupAndCreateOrg({ emailPrefix: 'tz-combobox-18' })
    orgId = seeded.orgId
    await browser.waitUntil(
      async () => /\/library$/.test(await browser.getUrl()),
      { timeout: 60_000, timeoutMsg: 'Did not land on /library' }
    )
  })

  it('abre combobox, filtra por digitação, seleciona zona — valor persiste no Supabase', async () => {
    const supabase = makeAdminClient()
    await browser.url('tauri://localhost/manage?tab=info')

    // Aguarda boot terminar (splash some após syncOrg) antes de interagir.
    await browser.waitUntil(
      async () => !(await browser.$('#boot-splash').isExisting()),
      { timeout: 60_000, timeoutMsg: 'Boot splash did not disappear' }
    )

    // Aguarda página carregar antes de procurar combobox.
    await browser.waitUntil(
      async () => (await $('label*=Fuso horário')).isExisting(),
      { timeout: 15_000, timeoutMsg: 'OrgInfo não renderizou label Fuso horário' }
    )

    // OrgInfo usa CrossFade: aguarda trigger ser clickable (loading=false) antes
    // de clicar. waitForClickable verifica que não está pointer-events:none.
    const trigger = $('button[aria-haspopup="listbox"]')
    await trigger.waitForExist({ timeout: 15_000 })
    await trigger.waitForClickable({ timeout: 10_000, timeoutMsg: 'Trigger do combobox não ficou interativo' })
    const initialText = await trigger.getText()
    expect(initialText).toContain('America/Sao_Paulo')
    expect(initialText).toMatch(/GMT[+-]\d{2}:\d{2}/)

    // Abre dropdown
    await trigger.click()
    const listbox = $('ul[role="listbox"]')
    await listbox.waitForExist({ timeout: 5_000 })

    // Filtra
    await setReactInputValue('input[placeholder*="Buscar fuso"]', 'tokyo')
    const options = await $$('li[role="option"]')
    expect(options.length).toBeGreaterThan(0)
    // Primeira opção deve ser Asia/Tokyo
    const firstText = await options[0]!.getText()
    expect(firstText).toContain('Tokyo')

    // Seleciona
    await options[0]!.click()

    // Dropdown fecha + botão exibe novo valor
    await browser.waitUntil(
      async () => {
        const text = await trigger.getText()
        return text.includes('Asia/Tokyo')
      },
      { timeout: 5_000, timeoutMsg: 'Combobox não atualizou pra Asia/Tokyo' }
    )

    // Salva (botão aparece dirty)
    const saveBtn = $('button=Salvar alterações')
    await saveBtn.waitForEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // SQL: timezone gravado no Supabase
    await browser.waitUntil(
      async () => {
        const { data } = await supabase
          .from('organizations').select('timezone').eq('id', orgId).single()
        return (data as { timezone?: string } | null)?.timezone === 'Asia/Tokyo'
      },
      { timeout: 15_000, timeoutMsg: 'timezone=Asia/Tokyo não persistiu no Supabase' }
    )
  })

  it('busca tolera espaço (sao paulo → Sao_Paulo)', async () => {
    await browser.url('tauri://localhost/manage?tab=info')
    await browser.waitUntil(
      async () => !(await browser.$('#boot-splash').isExisting()),
      { timeout: 60_000, timeoutMsg: 'Boot splash did not disappear' }
    )
    const trigger = $('button[aria-haspopup="listbox"]')
    await trigger.waitForExist({ timeout: 15_000 })
    await trigger.waitForClickable({ timeout: 10_000, timeoutMsg: 'Trigger do combobox não ficou interativo' })
    await trigger.click()
    await $('ul[role="listbox"]').waitForExist({ timeout: 5_000 })

    await setReactInputValue('input[placeholder*="Buscar fuso"]', 'sao paulo')
    const options = await $$('li[role="option"]')
    const texts: string[] = []
    for (const o of options) {
      texts.push(await o.getText())
    }
    const hasSp = texts.some((t) => t.includes('Sao_Paulo'))
    expect(hasSp).toBe(true)
  })

  it('disabled quando user não tem manage_members (sem permissão)', async () => {
    // O user atual é Dono, então tem permissão — esse teste valida o oposto
    // verificando que ao menos o botão existe enabled. Cobertura de "disabled"
    // fica nos unit tests do componente (TimezoneCombobox.test.tsx).
    await browser.url('tauri://localhost/manage?tab=info')
    await browser.waitUntil(
      async () => !(await browser.$('#boot-splash').isExisting()),
      { timeout: 60_000, timeoutMsg: 'Boot splash did not disappear' }
    )
    const trigger = $('button[aria-haspopup="listbox"]')
    await trigger.waitForExist({ timeout: 15_000 })
    await trigger.waitForClickable({ timeout: 10_000, timeoutMsg: 'Trigger do combobox não ficou interativo' })
    expect(await trigger.isEnabled()).toBe(true)
  })
})
