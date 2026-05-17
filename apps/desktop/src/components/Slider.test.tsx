import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Slider } from './Slider'

function mockRect(overrides: Partial<DOMRect> = {}) {
  return {
    left: 0, top: 100, right: 100, bottom: 116,
    width: 100, height: 16,
    x: 0, y: 100,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(mockRect())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Slider', () => {
  describe('renderiza com value inicial', () => {
    it('track fill reflete value 50% (0–1)', () => {
      const { container } = render(
        <Slider value={0.5} onChange={vi.fn()} />
      )
      // O fill usa width: `${pct}%` — pct = ((0.5-0)/(1-0))*100 = 50
      const fills = container.querySelectorAll('[style*="background: rgb(59, 130, 246)"]')
      expect(fills.length).toBeGreaterThan(0)
      const fill = fills[0] as HTMLElement
      expect(fill.style.width).toBe('50%')
    })

    it('track fill reflete value 0%', () => {
      const { container } = render(
        <Slider value={0} onChange={vi.fn()} />
      )
      const fills = container.querySelectorAll('[style*="background: rgb(59, 130, 246)"]')
      const fill = fills[0] as HTMLElement
      expect(fill.style.width).toBe('0%')
    })

    it('track fill reflete value 100%', () => {
      const { container } = render(
        <Slider value={1} onChange={vi.fn()} />
      )
      const fills = container.querySelectorAll('[style*="background: rgb(59, 130, 246)"]')
      const fill = fills[0] as HTMLElement
      expect(fill.style.width).toBe('100%')
    })

    it('renderiza buffer layer quando buffered é passado', () => {
      const { container } = render(
        <Slider value={0.2} onChange={vi.fn()} buffered={0.6} />
      )
      // bufferedPct = 60 → width: 60%
      const layers = container.querySelectorAll('[style*="width"]')
      const bufferLayer = Array.from(layers).find(
        el => (el as HTMLElement).style.width === '60%'
      )
      expect(bufferLayer).toBeTruthy()
    })

    it('não renderiza buffer layer quando buffered é omitido', () => {
      const { container } = render(
        <Slider value={0.5} onChange={vi.fn()} />
      )
      // Deve haver exatamente 1 div com background azul (fill), sem buffer
      const fills = container.querySelectorAll('[style*="background: rgb(59, 130, 246)"]')
      expect(fills.length).toBe(1)
    })
  })

  describe('clicar no track dispara onChange com valor proporcional', () => {
    it('clique no meio (clientX=50) → onChange(0.5)', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Slider value={0} onChange={onChange} />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseDown(track, { clientX: 50 })
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(expect.closeTo(0.5, 5))
    })

    it('clique no início (clientX=0) → onChange(0)', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Slider value={1} onChange={onChange} />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseDown(track, { clientX: 0 })
      expect(onChange).toHaveBeenCalledWith(expect.closeTo(0, 5))
    })

    it('clique no fim (clientX=100) → onChange(1)', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Slider value={0} onChange={onChange} />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseDown(track, { clientX: 100 })
      expect(onChange).toHaveBeenCalledWith(expect.closeTo(1, 5))
    })

    it('clique fora à esquerda (clientX=-10) → clampado para 0', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Slider value={0.5} onChange={onChange} />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseDown(track, { clientX: -10 })
      expect(onChange).toHaveBeenCalledWith(0)
    })

    it('clique fora à direita (clientX=200) → clampado para 1', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Slider value={0.5} onChange={onChange} />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseDown(track, { clientX: 200 })
      expect(onChange).toHaveBeenCalledWith(1)
    })

    it('min/max customizados — clique em 75% → onChange(75)', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Slider value={0} min={0} max={100} step={1} onChange={onChange} />
      )
      const track = container.firstElementChild as HTMLElement
      // clientX=75, rect.left=0, rect.width=100 → p=0.75 → raw=75 → step≥1 → round(75/1)*1=75
      fireEvent.mouseDown(track, { clientX: 75 })
      expect(onChange).toHaveBeenCalledWith(75)
    })
  })

  describe('commitOnDragEnd', () => {
    it('não dispara onChange no mousedown, só no mouseup', () => {
      const onChange = vi.fn()
      const { container } = render(
        <Slider value={0} onChange={onChange} commitOnDragEnd />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseDown(track, { clientX: 50 })
      // Ainda não deve ter chamado — commitOnDragEnd segura até mouseup
      expect(onChange).not.toHaveBeenCalled()

      // mouseup no window dispara o commit
      fireEvent.mouseUp(window)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(expect.closeTo(0.5, 5))
    })
  })

  describe('onDragChange', () => {
    it('chama onDragChange(true) ao pressionar e (false) ao soltar', () => {
      const onDragChange = vi.fn()
      const { container } = render(
        <Slider value={0.5} onChange={vi.fn()} onDragChange={onDragChange} />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseDown(track, { clientX: 50 })
      expect(onDragChange).toHaveBeenCalledWith(true)

      fireEvent.mouseUp(window)
      expect(onDragChange).toHaveBeenCalledWith(false)
    })
  })

  describe('tooltip', () => {
    it('não renderiza tooltip sem formatTooltip', () => {
      const { container } = render(
        <Slider value={0.5} onChange={vi.fn()} />
      )
      const track = container.firstElementChild as HTMLElement
      fireEvent.mouseMove(track, { clientX: 50 })
      // Sem formatTooltip, nenhum portal deve aparecer no body
      expect(document.body.querySelector('[style*="position: fixed"]')).toBeNull()
    })
  })
})
