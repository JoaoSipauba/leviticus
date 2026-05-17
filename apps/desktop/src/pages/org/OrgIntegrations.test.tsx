import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockState = {
  account: null as any,
  quota: null as any,
  status: 'disconnected' as string,
  error: null as string | null,
  refreshAccount: vi.fn(),
  refreshQuota: vi.fn(),
}

vi.mock('../../store/integrations.js', () => ({
  useIntegrationsStore: Object.assign(
    (selector: any) => selector(mockState),
    { getState: () => mockState }
  ),
}))
vi.mock('../../lib/permissions.js', () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../lib/cloud-storage/client.js', () => ({
  initOAuth: vi.fn().mockResolvedValue({ authUrl: 'https://x', state: 's' }),
  disconnect: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/db.js', () => ({
  getDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) }),
}))

import { OrgIntegrations } from './OrgIntegrations.js'

describe('OrgIntegrations', () => {
  beforeEach(() => {
    mockState.account = null
    mockState.quota = null
    mockState.status = 'disconnected'
    mockState.error = null
    mockState.refreshAccount.mockReset()
    mockState.refreshQuota.mockReset()
  })

  it('mostra ConnectDriveCard quando disconnected', async () => {
    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(screen.getByText(/Drive ainda não configurado/i)).toBeInTheDocument()
    })
  })

  it('mostra ConnectedAccountCard quando connected', async () => {
    mockState.account = {
      org_id: 'o1', provider: 'google_drive', account_email: 'a@b.c', account_user_id: 'u',
      app_folder_id: 'f', connected_by: null, connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: 100, last_quota_used: 50, last_quota_check_at: null, updated_at: '2026-05-15T00:00:00Z',
    }
    mockState.quota = { total: 100, used: 50, available: 50 }
    mockState.status = 'connected'

    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(screen.getByText(/a@b.c/)).toBeInTheDocument()
    })
  })

  it('mostra DriveFullCard quando status quota_full', async () => {
    mockState.account = {
      org_id: 'o1', provider: 'google_drive', account_email: 'a@b.c', account_user_id: 'u',
      app_folder_id: 'f', connected_by: null, connected_at: '2026-05-15T00:00:00Z',
      last_quota_total: 100, last_quota_used: 100, last_quota_check_at: null, updated_at: '2026-05-15T00:00:00Z',
    }
    mockState.quota = { total: 100, used: 100, available: 0 }
    mockState.status = 'quota_full'

    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(screen.getByText(/Drive cheio/i)).toBeInTheDocument()
    })
  })

  it('chama refreshAccount + refreshQuota no mount', async () => {
    render(<OrgIntegrations orgId="o1" />)
    await waitFor(() => {
      expect(mockState.refreshAccount).toHaveBeenCalledWith('o1')
    })
  })
})
