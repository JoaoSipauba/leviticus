export default function Showcase() {
  return (
    <section className="showcase" data-screen-label="showcase">
      <div className="showcase-bg-glow"></div>
      <div className="container">
        <div className="showcase-main">
          <img src="/assets/screen-biblioteca.png" alt="Biblioteca do Leviticus" />
        </div>
        <div className="showcase-sub">
          <div className="showcase-card">
            <img src="/assets/screen-ministerios.png" alt="Ministérios" />
          </div>
          <div className="showcase-card">
            <img src="/assets/screen-culto.png" alt="Culto" />
          </div>
        </div>
      </div>
    </section>
  )
}
