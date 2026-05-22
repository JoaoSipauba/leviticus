import { describe, it, expect } from 'vitest'
import { permissionErrorMessage } from './permission-error.js'

describe('permissionErrorMessage', () => {
  it('detecta erro de RLS pelo code 42501', () => {
    expect(permissionErrorMessage({ code: '42501', message: 'permission denied' }))
      .toBe('Você não tem permissão para esta ação.')
  })

  it('detecta envelope de RPC com error forbidden', () => {
    expect(permissionErrorMessage({ ok: false, error: 'forbidden' }))
      .toBe('Você não tem permissão para esta ação.')
  })

  it('retorna null pra erro que não é de permissão', () => {
    expect(permissionErrorMessage({ code: '23505', message: 'duplicate' })).toBeNull()
    expect(permissionErrorMessage({ ok: false, error: 'not_found' })).toBeNull()
    expect(permissionErrorMessage(new Error('rede caiu'))).toBeNull()
    expect(permissionErrorMessage(null)).toBeNull()
  })
})
