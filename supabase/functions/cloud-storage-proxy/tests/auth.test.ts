import { assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { authenticate, UnauthorizedError } from '../auth.ts'

Deno.test('authenticate — sem header rejeita', async () => {
  const req = new Request('http://x/y', { method: 'POST' })
  await assertRejects(() => authenticate(req, 'some-org'), UnauthorizedError, 'Authorization')
})

Deno.test({ name: 'authenticate — JWT inválido rejeita', sanitizeResources: false, sanitizeOps: false, fn: async () => {
  Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321')
  Deno.env.set('SUPABASE_ANON_KEY', 'fake-anon-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake-svc-key')

  const req = new Request('http://x/y', {
    method: 'POST',
    headers: { Authorization: 'Bearer not-a-real-jwt' },
  })
  await assertRejects(() => authenticate(req, 'some-org'), UnauthorizedError, 'Invalid JWT')
}})

// Teste de integração com Supabase real fica no plano de E2E (plano 4).
// Aqui ficamos só com testes unitários da camada de auth.
