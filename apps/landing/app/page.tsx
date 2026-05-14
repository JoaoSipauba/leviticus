import TopBanner from '@/components/TopBanner'
import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import Showcase from '@/components/Showcase'
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

export default async function Home() {
  // `release` é null quando o feed está indisponível OU algum asset não
  // respondeu HEAD 200. Cada consumidor decide como exibir nesse caso —
  // a landing nunca renderiza URL não-validada.
  const release = await getLatestRelease()
  const version = release?.version
  return (
    <>
      <TopBanner />
      <Nav />
      <Hero version={version} />
      <Showcase />
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
