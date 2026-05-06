import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Login } from './Login'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        error: null,
        data: { user: {}, session: {} },
      }),
      signUp: vi.fn().mockResolvedValue({
        error: null,
        data: { user: {}, session: {} },
      }),
    },
  },
}))

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and password fields', () => {
    render(<Login onSuccess={() => {}} />)
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
  })

  it('calls signInWithPassword on submit', async () => {
    const { supabase } = await import('../lib/supabase')
    render(<Login onSuccess={() => {}} />)

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'test@test.com' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'senha123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'senha123',
      })
    })
  })

  it('calls onSuccess after successful sign-in', async () => {
    const onSuccess = vi.fn()
    render(<Login onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'test@test.com' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'senha123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce()
    })
  })

  it('shows error message when sign-in fails', async () => {
    const { supabase } = await import('../lib/supabase')
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      error: { message: 'Invalid credentials' } as any,
      data: { user: null, session: null },
    })

    render(<Login onSuccess={() => {}} />)

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'test@test.com' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')
    })
  })
})
