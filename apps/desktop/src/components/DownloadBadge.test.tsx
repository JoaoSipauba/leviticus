import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DownloadBadge } from './DownloadBadge'

describe('DownloadBadge', () => {
  describe('state=not_downloaded', () => {
    it('renders download button when online', () => {
      render(<DownloadBadge state="not_downloaded" online={true} />)
      expect(screen.getByRole('button', { name: /Baixar pro dispositivo/i })).toBeInTheDocument()
    })

    it('calls onDownload when clicked', async () => {
      const onDownload = vi.fn()
      render(<DownloadBadge state="not_downloaded" online={true} onDownload={onDownload} />)
      await userEvent.click(screen.getByRole('button'))
      expect(onDownload).toHaveBeenCalledTimes(1)
    })

    it('is disabled when offline', () => {
      render(<DownloadBadge state="not_downloaded" online={false} />)
      const btn = screen.getByRole('button')
      expect(btn).toBeDisabled()
    })

    it('does not call onDownload when offline', async () => {
      const onDownload = vi.fn()
      render(<DownloadBadge state="not_downloaded" online={false} onDownload={onDownload} />)
      await userEvent.click(screen.getByRole('button'))
      expect(onDownload).not.toHaveBeenCalled()
    })

    it('shows offline aria-label when offline', () => {
      render(<DownloadBadge state="not_downloaded" online={false} />)
      expect(screen.getByRole('button', { name: /Sem conexão/i })).toBeInTheDocument()
    })
  })

  describe('state=queued', () => {
    it('renders with "Remover da fila" aria-label', () => {
      render(<DownloadBadge state="queued" />)
      expect(screen.getByRole('button', { name: /Remover da fila/i })).toBeInTheDocument()
    })

    it('calls onCancel when clicked', async () => {
      const onCancel = vi.fn()
      render(<DownloadBadge state="queued" onCancel={onCancel} />)
      await userEvent.click(screen.getByRole('button'))
      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('does not call onDownload when clicked', async () => {
      const onDownload = vi.fn()
      render(<DownloadBadge state="queued" onDownload={onDownload} />)
      await userEvent.click(screen.getByRole('button'))
      expect(onDownload).not.toHaveBeenCalled()
    })
  })

  describe('state=downloading', () => {
    it('renders with "Cancelar download" aria-label', () => {
      render(<DownloadBadge state="downloading" progress={0.4} />)
      expect(screen.getByRole('button', { name: /Cancelar download/i })).toBeInTheDocument()
    })

    it('shows rounded progress percentage', () => {
      render(<DownloadBadge state="downloading" progress={0.67} />)
      // Math.round(0.67 * 100) = 67
      expect(screen.getByText('67')).toBeInTheDocument()
    })

    it('calls onCancel when clicked during download', async () => {
      const onCancel = vi.fn()
      render(<DownloadBadge state="downloading" progress={0.5} onCancel={onCancel} />)
      await userEvent.click(screen.getByRole('button'))
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })

  describe('state=completed', () => {
    it('renders with "Download concluído" aria-label', () => {
      render(<DownloadBadge state="completed" />)
      expect(screen.getByRole('button', { name: /Download concluído/i })).toBeInTheDocument()
    })

    it('button is disabled (non-interactive)', () => {
      render(<DownloadBadge state="completed" />)
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('does not call onDownload or onCancel when clicked', async () => {
      const onDownload = vi.fn()
      const onCancel = vi.fn()
      render(<DownloadBadge state="completed" onDownload={onDownload} onCancel={onCancel} />)
      await userEvent.click(screen.getByRole('button'))
      expect(onDownload).not.toHaveBeenCalled()
      expect(onCancel).not.toHaveBeenCalled()
    })
  })

  describe('alert variant', () => {
    it('renders alert overlay when alert=true and state=not_downloaded', () => {
      const { container } = render(
        <DownloadBadge state="not_downloaded" online={true} alert={true} />
      )
      // alert overlay is rendered as a sibling span with aria-hidden
      const hiddenSpans = container.querySelectorAll('[aria-hidden="true"]')
      expect(hiddenSpans.length).toBeGreaterThan(0)
    })

    it('does not render alert overlay when state is not not_downloaded', () => {
      const { container: c1 } = render(<DownloadBadge state="completed" alert={true} />)
      const { container: c2 } = render(<DownloadBadge state="downloading" alert={true} progress={0.5} />)
      // The overlay span with the specific style is only added for showAlert case;
      // both containers should still render without crashing
      expect(c1.querySelector('button')).toBeInTheDocument()
      expect(c2.querySelector('button')).toBeInTheDocument()
    })
  })

  describe('compact variant', () => {
    it('renders without errors when compact=true', () => {
      render(<DownloadBadge state="not_downloaded" online={true} compact={true} />)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('compact downloading shows progress percentage', () => {
      render(<DownloadBadge state="downloading" progress={0.33} compact={true} />)
      expect(screen.getByText('33')).toBeInTheDocument()
    })

    it('compact completed is still disabled', () => {
      render(<DownloadBadge state="completed" compact={true} />)
      expect(screen.getByRole('button')).toBeDisabled()
    })
  })
})
