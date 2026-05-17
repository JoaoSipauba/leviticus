import { describe, it, expect } from 'vitest'
import { parseDeepLink, isOAuthSuccess } from './deep-link.js'

describe('parseDeepLink', () => {
  it('parseia leviticus://oauth-success?org_id=abc', () => {
    const result = parseDeepLink('leviticus://oauth-success?org_id=abc-123')
    expect(result).toEqual({ kind: 'oauth-success', orgId: 'abc-123' })
  })

  it('retorna null pra URL desconhecida', () => {
    expect(parseDeepLink('leviticus://unknown')).toBeNull()
  })

  it('retorna null pra protocolo diferente', () => {
    expect(parseDeepLink('https://example.com/oauth-success?org_id=x')).toBeNull()
  })

  it('retorna null se org_id faltar', () => {
    expect(parseDeepLink('leviticus://oauth-success')).toBeNull()
  })
})

describe('isOAuthSuccess', () => {
  it('true pra leviticus://oauth-success', () => {
    expect(isOAuthSuccess('leviticus://oauth-success?org_id=x')).toBe(true)
  })
  it('false pra outras', () => {
    expect(isOAuthSuccess('leviticus://other')).toBe(false)
  })
})
