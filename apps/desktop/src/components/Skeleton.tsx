/**
 * Placeholder animado pra qualquer área que ainda está carregando.
 * Issue #65: páginas mostravam conteúdo aos poucos (popcorn loading),
 * gerando layout shift e impressão de lentidão. Skeleton dimensionado
 * elimina o layout shift e dá feedback "tem coisa carregando aqui".
 *
 * Use combinando primitivos:
 *
 *   <Skeleton h={20} w="60%" />
 *   <Skeleton h={40} w={40} rounded="lg" />
 *
 * Ou usa um dos presets:
 *
 *   <SongCardSkeleton />
 *   <SectionSkeleton lines={3} />
 */

import type { CSSProperties } from 'react'

type SkeletonProps = {
  /** Altura em px (number) ou string CSS (ex: '1.5rem'). */
  h?: number | string
  /** Largura em px ou string CSS. Default 100%. */
  w?: number | string
  /** Border radius preset. Default 'md'. */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** Margem inferior pra espaçamento entre skeletons sequenciais. */
  mb?: number
  /** Tom mais escuro (pra background escuro) ou claro. Default 'dark'. */
  tone?: 'dark' | 'light'
  className?: string
  style?: CSSProperties
}

const ROUNDED: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  none: '0',
  sm: '4px',
  md: '6px',
  lg: '10px',
  xl: '14px',
  full: '9999px',
}

export function Skeleton({
  h = 16,
  w = '100%',
  rounded = 'md',
  mb,
  tone = 'dark',
  className,
  style,
}: SkeletonProps) {
  // Tone só altera o gradiente — pra fundos claros usa overlay escuro
  // em vez do `.skeleton` (que usa overlay branco).
  return (
    <div
      aria-hidden="true"
      className={tone === 'dark' ? `skeleton ${className ?? ''}` : className}
      style={{
        height: typeof h === 'number' ? `${h}px` : h,
        width: typeof w === 'number' ? `${w}px` : w,
        borderRadius: ROUNDED[rounded],
        marginBottom: mb !== undefined ? `${mb}px` : undefined,
        flexShrink: 0,
        ...(tone === 'light' && {
          background: 'rgba(0,0,0,0.08)',
          animation: 'pulse-light 1.6s ease-in-out infinite',
        }),
        ...style,
      }}
    />
  )
}

// ─── Presets ──────────────────────────────────────────────────────────────────

/** Skeleton de uma row de música (grid card ou list row). */
export function SongCardSkeleton({ variant = 'standalone' }: { variant?: 'standalone' | 'list' }) {
  const isList = variant === 'list'
  return (
    <div
      className={`flex items-center gap-${isList ? 3 : 4} ${
        isList ? 'px-2 py-2' : 'px-4 py-3.5'
      } rounded-${isList ? 'lg' : '2xl'}`}
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <Skeleton w={isList ? 36 : 48} h={isList ? 36 : 48} rounded="lg" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Skeleton h={isList ? 12 : 14} w="55%" />
        <Skeleton h={isList ? 10 : 12} w="35%" />
      </div>
      <Skeleton h={isList ? 10 : 12} w={36} />
    </div>
  )
}

/** Skeleton de uma seção genérica (título + N linhas). */
export function SectionSkeleton({
  lines = 3,
  showTitle = true,
}: { lines?: number; showTitle?: boolean }) {
  return (
    <div className="space-y-2.5">
      {showTitle && <Skeleton h={20} w={180} mb={6} />}
      {Array.from({ length: lines }).map((_, i) => (
        <SongCardSkeleton key={i} variant="list" />
      ))}
    </div>
  )
}

/** Skeleton genérico de área de texto (card de info). */
export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} h={14} w={i === lines - 1 ? '40%' : '80%'} />
        ))}
      </div>
    </div>
  )
}
