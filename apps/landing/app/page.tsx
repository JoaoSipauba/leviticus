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

export default function Home() {
  return (
    <>
      <TopBanner />
      <Nav />
      <Hero />
      <Showcase />
      <Features />
      <HowItWorks />
      <Download />
      <Install />
      <Comparison />
      <FAQ />
      <Donation />
      <Closer />
      <WaitlistModal />
      <Responsibility />
      <Footer />
    </>
  )
}
