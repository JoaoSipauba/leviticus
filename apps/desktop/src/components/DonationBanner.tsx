import { useEffect, useState } from 'react'
import { Heart, X } from 'lucide-react'
import { open } from '@tauri-apps/plugin-shell'
import {
  DONATION_URL,
  FIRST_SEEN_KEY,
  HANDLED_MONTH_KEY,
  monthKey,
  shouldShowDonationBanner,
} from '../lib/donation.js'
import { captureException } from '../lib/observability.js'
import { toastError } from '../store/toasts.js'

export function DonationBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let firstSeen = localStorage.getItem(FIRST_SEEN_KEY)
    if (!firstSeen) {
      firstSeen = new Date().toISOString()
      localStorage.setItem(FIRST_SEEN_KEY, firstSeen)
    }
    const handledMonth = localStorage.getItem(HANDLED_MONTH_KEY)
    setVisible(shouldShowDonationBanner(firstSeen, handledMonth, new Date()))
  }, [])

  function markHandled() {
    localStorage.setItem(HANDLED_MONTH_KEY, monthKey(new Date()))
    setVisible(false)
  }

  async function handleDonate() {
    markHandled()
    try {
      await open(DONATION_URL)
    } catch (e) {
      captureException(e, { feature: 'donation', step: 'open-url' })
      toastError('Não foi possível abrir a página de doação. Tente novamente.')
    }
  }

  if (!visible) return null

  return (
    <div className="px-5 pt-4">
      <div
        className="animate-banner-in flex items-center gap-3 rounded-[10px] px-3.5 py-2.5"
        style={{
          background: 'linear-gradient(90deg, rgba(244,114,182,0.10), rgba(59,130,246,0.08))',
          border: '1px solid rgba(244,114,182,0.22)',
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(244,114,182,0.14)' }}
        >
          <Heart size={16} className="animate-heart-beat" color="#f472b6" fill="#f472b6" />
        </div>
        <div className="flex-1 min-w-0">
          <strong className="block text-[12.5px] font-semibold text-[#f3f4f6]">
            O Leviticus é gratuito — e segue assim.
          </strong>
          <p className="text-[11.5px] text-[#9ca3af] mt-px">
            Se ele tem abençoado sua equipe, considere apoiar o projeto este mês.
          </p>
        </div>
        <button
          onClick={handleDonate}
          className="flex-shrink-0 text-[11.5px] font-semibold text-white rounded-[7px] px-3.5 py-1.5 transition-colors"
          style={{ background: '#db2777' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#be185d' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#db2777' }}
        >
          Apoiar
        </button>
        <button
          onClick={markHandled}
          aria-label="Dispensar"
          className="flex-shrink-0 text-[#6b7280] hover:text-[#e5e7eb] transition-colors p-1"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
