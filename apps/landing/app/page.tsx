import TopBanner from '@/components/TopBanner'
import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import Showcase from '@/components/Showcase'
import Stats from '@/components/Stats'
import Features from '@/components/Features'
import HowItWorks from '@/components/HowItWorks'
import Download from '@/components/Download'
import Install from '@/components/Install'
import Comparison from '@/components/Comparison'
import FAQ from '@/components/FAQ'
import Donation from '@/components/Donation'
import Closer from '@/components/Closer'
import WaitlistModal from '@/components/WaitlistModal'
import Responsibility from '@/components/Responsibility'
import Footer from '@/components/Footer'
import { getLatestRelease } from '@/lib/release'
import { supabase } from '@/lib/supabase'

async function getPlatformStats() {
  try {
    const { data, error } = await supabase.rpc('get_platform_stats', undefined, {
      // @ts-expect-error — fetchOptions é suportado mas não tipado no SDK
      fetchOptions: { next: { revalidate: 3600 } },
    })
    if (error || !data) return null
    return data as { igrejas: number; musicos: number; musicas: number; cultos: number }
  } catch {
    return null
  }
}

export default async function Home() {
  // `release` é null quando o feed está indisponível OU algum asset não
  // respondeu HEAD 200. Cada consumidor decide como exibir nesse caso —
  // a landing nunca renderiza URL não-validada.
  const [release, stats] = await Promise.all([
    getLatestRelease(),
    getPlatformStats(),
  ])
  const version = release?.version
  return (
    <>
      <TopBanner />
      <Nav />
      <Hero version={version} />
      <Showcase />
      <Stats
        igrejas={stats?.igrejas ?? null}
        musicos={stats?.musicos ?? null}
        musicas={stats?.musicas ?? null}
        cultos={stats?.cultos ?? null}
      />
      <Features />
      <HowItWorks />
      <Download release={release} />
      <Install version={version} />
      <Comparison />
      <FAQ />
      <Donation />
      <Closer />
      <WaitlistModal />
      <Responsibility />
      <Footer version={version} />
    </>
  )
}
