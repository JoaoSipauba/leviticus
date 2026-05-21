'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/admin/api/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <button className="admin-logout-btn" onClick={handleLogout}>
      Sair
    </button>
  )
}
