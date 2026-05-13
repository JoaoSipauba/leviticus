'use client'

import { useEffect } from 'react'

export default function Comparison() {
  useEffect(() => {
    const table = document.querySelector('.compare-table')
    if (!table) return
    const rows = table.querySelectorAll('.compare-row')
    if (rows.length < 2) return
    const headers = rows[0].querySelectorAll('.compare-cell')
    const headerLabels = [...headers].map(h => (h as HTMLElement).textContent?.trim() ?? '')
    rows.forEach((row, idx) => {
      if (idx === 0) return
      const cells = row.querySelectorAll('.compare-cell')
      cells.forEach((cell, i) => {
        if (i === 0) return
        const lbl = headerLabels[i] || ''
        if (lbl) cell.setAttribute('data-col', lbl)
      })
    })
  }, [])

  return (
    <section className="section section-divider" id="comparacao" data-screen-label="comparacao">
      <div className="container">
        <div className="section-label">05 · Comparação</div>
        <h2 className="section-title">Por que um app dedicado pro culto?</h2>
        <p className="section-sub">Apps de streaming foram desenhados pra ouvir música no carro. Planilhas e pastas de áudio resolvem por um tempo, mas não acompanham o ritmo da equipe. Veja onde o Leviticus se encaixa:</p>

        <div className="compare-table">
          <div className="compare-row">
            <div className="compare-cell header"></div>
            <div className="compare-cell header brand">
              <div className="compare-brand-head">
                <span className="logo-mark" style={{ height: '14px' }}><span></span><span></span><span></span><span></span><span></span><span></span></span>
                Leviticus
              </div>
            </div>
            <div className="compare-cell header">App de streaming genérico</div>
            <div className="compare-cell header">Planilha + pasta de áudio</div>
          </div>

          <div className="compare-row">
            <div className="compare-cell row-label">Garantia de offline no culto</div>
            <div className="compare-cell brand"><span className="check">✓ Sempre</span></div>
            <div className="compare-cell"><span className="x">— depende de download válido</span></div>
            <div className="compare-cell"><span className="check">✓ mas sem busca</span></div>
          </div>

          <div className="compare-row">
            <div className="compare-cell row-label">Organização por ministério</div>
            <div className="compare-cell brand"><span className="check">✓</span></div>
            <div className="compare-cell"><span className="x">—</span></div>
            <div className="compare-cell"><span className="x">— manual</span></div>
          </div>

          <div className="compare-row">
            <div className="compare-cell row-label">Setlist de culto com seções</div>
            <div className="compare-cell brand"><span className="check">✓</span></div>
            <div className="compare-cell"><span className="x">— só playlist linear</span></div>
            <div className="compare-cell"><span className="x">— em outro documento</span></div>
          </div>

          <div className="compare-row">
            <div className="compare-cell row-label">Tipos de faixa (VS, pad, instr.)</div>
            <div className="compare-cell brand"><span className="check">✓</span></div>
            <div className="compare-cell"><span className="x">—</span></div>
            <div className="compare-cell"><span className="x">—</span></div>
          </div>

          <div className="compare-row">
            <div className="compare-cell row-label">Equipe sincronizada na nuvem</div>
            <div className="compare-cell brand"><span className="check">✓</span></div>
            <div className="compare-cell"><span className="x">— só playlist compartilhada</span></div>
            <div className="compare-cell"><span className="x">— USB / WhatsApp</span></div>
          </div>

          <div className="compare-row">
            <div className="compare-cell row-label">Repertório centralizado da igreja</div>
            <div className="compare-cell brand"><span className="check">✓</span></div>
            <div className="compare-cell"><span className="x">—</span></div>
            <div className="compare-cell"><span className="x">—</span></div>
          </div>
        </div>
      </div>
    </section>
  )
}
