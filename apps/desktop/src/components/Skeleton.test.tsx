import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SongCardSkeleton, SectionSkeleton, CardSkeleton } from './Skeleton.js'

describe('Skeleton', () => {
  it('renderiza com altura e largura customizadas', () => {
    const { container } = render(<Skeleton h={20} w={100} />)
    const el = container.querySelector('.skeleton') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.style.height).toBe('20px')
    expect(el.style.width).toBe('100px')
  })

  it('aceita string em h/w (CSS units)', () => {
    const { container } = render(<Skeleton h="2rem" w="50%" />)
    const el = container.querySelector('.skeleton') as HTMLElement
    expect(el.style.height).toBe('2rem')
    expect(el.style.width).toBe('50%')
  })

  it('aplica border-radius preset', () => {
    const { container } = render(<Skeleton rounded="full" />)
    const el = container.querySelector('.skeleton') as HTMLElement
    expect(el.style.borderRadius).toBe('9999px')
  })

  it('tone="light" não aplica .skeleton class (usa background customizado)', () => {
    const { container } = render(<Skeleton tone="light" />)
    expect(container.querySelector('.skeleton')).toBeNull()
    const el = container.firstChild as HTMLElement
    expect(el.style.animation).toContain('pulse-light')
  })

  it('aria-hidden pra acessibilidade (placeholder não é conteúdo real)', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('SongCardSkeleton', () => {
  it('renderiza thumb + 2 linhas + duração', () => {
    const { container } = render(<SongCardSkeleton />)
    const skeletons = container.querySelectorAll('.skeleton')
    // thumb, title line, artist line, duration = 4
    expect(skeletons.length).toBe(4)
  })

  it('variante list usa dimensões menores', () => {
    const { container: standalone } = render(<SongCardSkeleton variant="standalone" />)
    const { container: list } = render(<SongCardSkeleton variant="list" />)
    const stdThumb = standalone.querySelector('.skeleton') as HTMLElement
    const listThumb = list.querySelector('.skeleton') as HTMLElement
    expect(parseInt(stdThumb.style.width)).toBeGreaterThan(parseInt(listThumb.style.width))
  })
})

describe('SectionSkeleton', () => {
  it('renderiza título + N rows', () => {
    const { container } = render(<SectionSkeleton lines={4} />)
    // 1 título + (4 rows × 4 skeletons cada) = 17
    const skeletons = container.querySelectorAll('.skeleton')
    expect(skeletons.length).toBe(1 + 4 * 4)
  })

  it('showTitle=false omite o título', () => {
    const { container } = render(<SectionSkeleton lines={2} showTitle={false} />)
    // só rows
    expect(container.querySelectorAll('.skeleton').length).toBe(2 * 4)
  })
})

describe('CardSkeleton', () => {
  it('renderiza N linhas de texto', () => {
    const { container } = render(<CardSkeleton lines={3} />)
    expect(container.querySelectorAll('.skeleton').length).toBe(3)
  })
})
