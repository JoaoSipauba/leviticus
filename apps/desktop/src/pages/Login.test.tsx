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

  it('shows friendly error message when sign-in credentials are invalid', async () => {
    const { supabase } = await import('../lib/supabase')
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' } as any,
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
      expect(screen.getByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
    })
  })

  describe('sign up', () => {
    function fillSignUpForm() {
      fireEvent.click(screen.getByRole('button', { name: /^criar conta$/i }))
      fireEvent.change(screen.getByLabelText('Nome completo'), {
        target: { value: 'João Teste' },
      })
      fireEvent.change(screen.getByLabelText('E-mail'), {
        target: { value: 'novo@test.com' },
      })
      fireEvent.change(screen.getByLabelText('Senha'), {
        target: { value: 'senha123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^criar conta$/i }))
    }

    it('logs in immediately when sign-up returns a session', async () => {
      const { supabase } = await import('../lib/supabase')
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        error: null,
        data: {
          user: { id: 'u1', identities: [{ id: 'i1' }] } as any,
          session: { access_token: 'token' } as any,
        },
      })

      const onSuccess = vi.fn()
      render(<Login onSuccess={onSuccess} />)
      fillSignUpForm()

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledOnce()
      })
    })

    it('shows "already registered" error when email already exists', async () => {
      const { supabase } = await import('../lib/supabase')
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        error: null,
        data: {
          user: { id: 'u1', identities: [] } as any,
          session: null,
        },
      })

      const onSuccess = vi.fn()
      render(<Login onSuccess={onSuccess} />)
      fillSignUpForm()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Este e-mail já está cadastrado. Faça login.'
        )
      })
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('shows friendly fallback message when sign-up returns an unexpected error', async () => {
      const { supabase } = await import('../lib/supabase')
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        error: { message: 'Database error saving new user' } as any,
        data: { user: null, session: null },
      })

      render(<Login onSuccess={() => {}} />)
      fillSignUpForm()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Algo deu errado. Tente novamente.'
        )
      })
    })

    it('shows specific message when password is too short', async () => {
      const { supabase } = await import('../lib/supabase')
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        error: { message: 'Password should be at least 6 characters' } as any,
        data: { user: null, session: null },
      })

      render(<Login onSuccess={() => {}} />)
      fillSignUpForm()

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'A senha precisa ter pelo menos 6 caracteres.'
        )
      })
    })
  })
})
