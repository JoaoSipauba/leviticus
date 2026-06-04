# Frontend Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar motion design e feedback de interação consistentes em todo o app (issue #69, blocos A–G), construindo primitivos compartilhados (`AnimatedModal`, `Button`, `IconButton`, `EmptyState`, `CrossFade`) e migrando modais e botões do app inteiro pra eles.

**Architecture:** Primitivos primeiro (em `src/components/ui/`) carregam hover/active/focus/reduced-motion de fábrica; migrar modais e botões pra eles resolve consistência (A), hovers (B) e focus rings (D) de uma vez. Depois: motion de transição (C), reduced-motion global (D), delight (E) e perf perceptiva (F).

**Tech Stack:** React 18 + TypeScript, Tailwind (disponível, mas o app usa muito inline-style), Vitest + RTL + jsdom, lucide-react, Zustand. Animações via `@keyframes` em `src/index.css`.

**Convenções do projeto a respeitar:**
- Nunca emoji; ícones lucide-react.
- Toda ação do usuário precisa de feedback (`toastSuccess`/`toastError` de `src/store/toasts.ts`).
- `captureException` de `src/lib/observability.ts` em catch de fluxo crítico.
- `noUnusedLocals: true` — sem variáveis não usadas.
- Teste verde isolado E na suíte. Rodar `pnpm test` + `pnpm typecheck` antes do PR.
- Imports de arquivos locais usam extensão `.js` (ESM).

---

## File Structure

**Novos arquivos (`src/components/ui/`):**
- `ui/AnimatedModal.tsx` — wrapper de modal (backdrop + card animado, Escape/backdrop, reduced-motion).
- `ui/AnimatedModal.test.tsx`
- `ui/Button.tsx` — botão com variantes primary/secondary/ghost/danger + sizes + loading.
- `ui/Button.test.tsx`
- `ui/IconButton.tsx` — botão de ícone 32/40 com aria-label.
- `ui/IconButton.test.tsx`
- `ui/EmptyState.tsx` — empty state compartilhado animado.
- `ui/EmptyState.test.tsx`
- `ui/CrossFade.tsx` — cross-fade loading↔conteúdo.
- `ui/CrossFade.test.tsx`
- `ui/index.ts` — re-exports.

**Modificados:**
- `src/index.css` — novos keyframes (`backdrop-fade-in`, `backdrop-fade-out`) + bloco `prefers-reduced-motion`.
- ~17 modais (lista na Task 6) → `AnimatedModal`.
- Botões do app inteiro → `Button`/`IconButton` (migração por área, Tasks 7–12).
- `src/components/Skeleton.tsx` consumers → `CrossFade` (Task 13).
- `src/pages/OrgManage.tsx`, `components/AddSongModal.tsx`, `components/AddSectionModal.tsx` — tab cross-fade (Task 14).
- `src/pages/Library.tsx`, `PlaylistDetail.tsx`, `org/OrgInvites.tsx` — item stagger (Task 15).
- `src/components/Sidebar.tsx` — indicador animado (Task 16).
- Empty states espalhados → `EmptyState` (Task 17).
- `src/pages/OrgManage.tsx` (info) — success inline (Task 18).
- `index.html` / splash → fade-out (Task 19).
- `src/pages/PlaylistDetail.tsx` — drag ghost + drop pulse (Task 20).
- Perf F: `contain:layout` (Task 21), prefetch on-hover (Task 22), optimistic create (Task 23).

---

## FASE 1 — Primitivos (bloco G)

### Task 1: keyframes de backdrop no index.css

**Files:**
- Modify: `apps/desktop/src/index.css` (após o bloco `.animate-modal-out`, ~linha 53)

- [ ] **Step 1: Adicionar keyframes**

Inserir após a linha `.animate-fade-slide-in ...` / `.animate-pop-in ...` (logo após o bloco "Modal animations"):

```css
@keyframes backdrop-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes backdrop-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
.animate-backdrop-in  { animation: backdrop-fade-in 0.22s ease forwards; }
.animate-backdrop-out { animation: backdrop-fade-out 0.18s ease forwards; }
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/index.css
git commit -m "feat(ui): keyframes de fade do backdrop de modal (#69)"
```

---

### Task 2: `<AnimatedModal>` — teste primeiro

**Files:**
- Create: `apps/desktop/src/components/ui/AnimatedModal.tsx`
- Test: `apps/desktop/src/components/ui/AnimatedModal.test.tsx`

- [ ] **Step 1: Escrever o teste**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AnimatedModal } from './AnimatedModal.js'

describe('AnimatedModal', () => {
  it('não renderiza quando open=false', () => {
    render(<AnimatedModal open={false} onClose={() => {}}><p>oi</p></AnimatedModal>)
    expect(screen.queryByText('oi')).toBeNull()
  })

  it('renderiza children e role=dialog quando open', () => {
    render(<AnimatedModal open onClose={() => {}}><p>conteúdo</p></AnimatedModal>)
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('chama onClose ao pressionar Escape', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose}><p>x</p></AnimatedModal>)
    fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('chama onClose ao clicar no backdrop', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose}><p>x</p></AnimatedModal>)
    const backdrop = screen.getByRole('presentation')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('NÃO fecha no backdrop quando closeOnBackdrop=false', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose} closeOnBackdrop={false}><p>x</p></AnimatedModal>)
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('não fecha quando busy=true', () => {
    const onClose = vi.fn()
    render(<AnimatedModal open onClose={onClose} busy><p>x</p></AnimatedModal>)
    fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `cd apps/desktop && pnpm vitest run src/components/ui/AnimatedModal.test.tsx`
Expected: FAIL — "Cannot find module './AnimatedModal.js'"

- [ ] **Step 3: Implementar**

```tsx
import { useRef, type ReactNode } from 'react'
import { useModalDismiss } from '../../lib/useModalDismiss.js'

const MAX_WIDTH: Record<'sm' | 'md' | 'lg', number> = { sm: 380, md: 448, lg: 640 }

// Wrapper padrão de modal: backdrop com fade + card com animate-modal-in,
// Escape/clique-fora via useModalDismiss, aria-modal. Substitui o boilerplate
// de overlay+card repetido nos modais. Respeita prefers-reduced-motion via o
// bloco global em index.css (que zera a duração das animações).
export function AnimatedModal({
  open,
  onClose,
  children,
  size = 'md',
  closeOnBackdrop = true,
  busy = false,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdrop?: boolean
  busy?: boolean
  labelledBy?: string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { onBackdropClick } = useModalDismiss({
    onClose,
    canDismissOutside: closeOnBackdrop,
    busy,
    enabled: open,
  })
  if (!open) return null

  return (
    <div role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onBackdropClick() }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose() }}
      className="animate-backdrop-in"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.55)' }}>
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className="animate-modal-in"
        style={{ width: '100%', maxWidth: MAX_WIDTH[size], borderRadius: 16, background: 'rgba(19,19,31,0.95)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar — deve passar**

Run: `cd apps/desktop && pnpm vitest run src/components/ui/AnimatedModal.test.tsx`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ui/AnimatedModal.tsx apps/desktop/src/components/ui/AnimatedModal.test.tsx
git commit -m "feat(ui): componente AnimatedModal (#69)"
```

---

### Task 3: `<Button>` — teste primeiro

**Files:**
- Create: `apps/desktop/src/components/ui/Button.tsx`
- Test: `apps/desktop/src/components/ui/Button.test.tsx`

- [ ] **Step 1: Escrever o teste**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button.js'

describe('Button', () => {
  it('renderiza children e dispara onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Salvar</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('fica desabilitado e não dispara onClick quando loading', () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Salvar</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('respeita disabled explícito', () => {
    render(<Button disabled>X</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('aplica data-variant pra cada variante', () => {
    const { rerender } = render(<Button variant="danger">D</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'danger')
    rerender(<Button variant="ghost">G</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'ghost')
  })
})
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `cd apps/desktop && pnpm vitest run src/components/ui/Button.test.tsx`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

```tsx
import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const PADDING: Record<Size, string> = { sm: '6px 12px', md: '8px 16px', lg: '11px 20px' }
const FONT: Record<Size, number> = { sm: 12.5, md: 13.5, lg: 14 }

const VARIANT: Record<Variant, { bg: string; color: string; border: string; hoverBg: string }> = {
  primary:   { bg: '#2563eb', color: '#fff',     border: 'none',                         hoverBg: '#1d4ed8' },
  secondary: { bg: 'rgba(255,255,255,0.06)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.1)', hoverBg: 'rgba(255,255,255,0.1)' },
  ghost:     { bg: 'transparent', color: '#d1d5db', border: 'none',                       hoverBg: 'rgba(255,255,255,0.06)' },
  danger:    { bg: '#dc2626', color: '#fff',     border: 'none',                          hoverBg: '#b91c1c' },
}

// Botão primitivo do app. Hover/active/focus-visible padronizados; loading
// mostra spinner e desabilita. Reduced-motion neutraliza o scale via index.css.
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: {
  children: ReactNode
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = VARIANT[variant]
  const isDisabled = disabled || loading
  return (
    <button
      {...rest}
      data-variant={variant}
      disabled={isDisabled}
      className={`lv-btn lv-btn-${size}${rest.className ? ' ' + rest.className : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: PADDING[size], fontSize: FONT[size], fontWeight: 600, borderRadius: 9,
        background: v.bg, color: v.color, border: v.border,
        width: fullWidth ? '100%' : undefined,
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.45 : 1,
        transition: 'background 0.13s ease, transform 0.1s ease',
        ['--lv-hover-bg' as string]: v.hoverBg,
        ...style,
      }}
    >
      {loading && <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin-smooth" />}
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Adicionar regras de hover/active/focus no index.css**

Inserir no `index.css` (perto dos utilitários, ex. após o bloco de scrollbar):

```css
/* Botão primitivo (ui/Button) — hover/active/focus padronizados */
.lv-btn:not(:disabled):hover   { background: var(--lv-hover-bg) !important; }
.lv-btn-md:not(:disabled):active,
.lv-btn-lg:not(:disabled):active { transform: scale(0.98); }
.lv-btn:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .lv-btn:active { transform: none !important; }
}
```

- [ ] **Step 5: Rodar — deve passar**

Run: `cd apps/desktop && pnpm vitest run src/components/ui/Button.test.tsx`
Expected: PASS (4 testes)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/ui/Button.tsx apps/desktop/src/components/ui/Button.test.tsx apps/desktop/src/index.css
git commit -m "feat(ui): componente Button com variantes e focus ring (#69)"
```

---

### Task 4: `<IconButton>` — teste primeiro

**Files:**
- Create: `apps/desktop/src/components/ui/IconButton.tsx`
- Test: `apps/desktop/src/components/ui/IconButton.test.tsx`

- [ ] **Step 1: Escrever o teste**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { X } from 'lucide-react'
import { IconButton } from './IconButton.js'

describe('IconButton', () => {
  it('expõe aria-label e dispara onClick', () => {
    const onClick = vi.fn()
    render(<IconButton label="Fechar" onClick={onClick}><X size={16} /></IconButton>)
    const btn = screen.getByRole('button', { name: 'Fechar' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('desabilita corretamente', () => {
    render(<IconButton label="X" disabled><X size={16} /></IconButton>)
    expect(screen.getByRole('button', { name: 'X' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `cd apps/desktop && pnpm vitest run src/components/ui/IconButton.test.tsx`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

```tsx
import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'ghost' | 'danger' | 'primary'
const SIZE = { sm: 32, md: 40 } as const

const HOVER: Record<Variant, string> = {
  ghost: 'rgba(255,255,255,0.08)',
  danger: 'rgba(220,38,38,0.15)',
  primary: 'rgba(37,99,235,0.18)',
}

// Botão de ícone 32/40 com aria-label obrigatório. Mesma régua de
// hover/focus do Button.
export function IconButton({
  children,
  label,
  size = 'md',
  variant = 'ghost',
  disabled,
  style,
  ...rest
}: {
  children: ReactNode
  label: string
  size?: 'sm' | 'md'
  variant?: Variant
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const px = SIZE[size]
  return (
    <button
      {...rest}
      aria-label={label}
      disabled={disabled}
      className={`lv-btn lv-iconbtn${rest.className ? ' ' + rest.className : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: px, height: px, borderRadius: 9, background: 'transparent',
        border: 'none', color: '#9ca3af',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: 'background 0.13s ease, color 0.13s ease',
        ['--lv-hover-bg' as string]: HOVER[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Rodar — deve passar**

Run: `cd apps/desktop && pnpm vitest run src/components/ui/IconButton.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ui/IconButton.tsx apps/desktop/src/components/ui/IconButton.test.tsx
git commit -m "feat(ui): componente IconButton (#69)"
```

---

### Task 5: `<EmptyState>` e `<CrossFade>` + barrel

**Files:**
- Create: `apps/desktop/src/components/ui/EmptyState.tsx`, `ui/EmptyState.test.tsx`
- Create: `apps/desktop/src/components/ui/CrossFade.tsx`, `ui/CrossFade.test.tsx`
- Create: `apps/desktop/src/components/ui/index.ts`

- [ ] **Step 1: Teste EmptyState**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Music } from 'lucide-react'
import { EmptyState } from './EmptyState.js'

describe('EmptyState', () => {
  it('renderiza título, descrição e ícone', () => {
    render(<EmptyState icon={Music} title="Vazio" description="Nada aqui" />)
    expect(screen.getByText('Vazio')).toBeInTheDocument()
    expect(screen.getByText('Nada aqui')).toBeInTheDocument()
  })
  it('renderiza CTA e dispara onAction', () => {
    const onAction = vi.fn()
    render(<EmptyState icon={Music} title="V" actionLabel="Criar" onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Implementar EmptyState**

```tsx
import { type LucideIcon } from 'lucide-react'
import { Button } from './Button.js'

// Empty state compartilhado: ícone + título + descrição + CTA opcional.
// Entra com animate-pop-in (reduced-motion zera via index.css).
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="animate-fade-slide-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 24px', gap: 12 }}>
      <div className="animate-pop-in" style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Icon size={26} color="#6b7280" />
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>{title}</h3>
      {description && <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, maxWidth: 320, lineHeight: 1.55 }}>{description}</p>}
      {actionLabel && onAction && (
        <div style={{ marginTop: 6 }}>
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Teste CrossFade**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CrossFade } from './CrossFade.js'

describe('CrossFade', () => {
  it('mostra skeleton quando loading', () => {
    render(<CrossFade loading skeleton={<div>SK</div>}><div>CT</div></CrossFade>)
    expect(screen.getByText('SK')).toBeInTheDocument()
  })
  it('mostra conteúdo quando não loading', () => {
    render(<CrossFade loading={false} skeleton={<div>SK</div>}><div>CT</div></CrossFade>)
    expect(screen.getByText('CT')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Implementar CrossFade**

```tsx
import { type ReactNode } from 'react'

// Cross-fade entre skeleton e conteúdo. Em vez de o skeleton sumir abrupto
// (pisca), as duas camadas se sobrepõem 200ms — skeleton fade-out, conteúdo
// fade-in. Reduced-motion zera a transição via index.css.
export function CrossFade({
  loading,
  skeleton,
  children,
}: {
  loading: boolean
  skeleton: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div
        aria-hidden={!loading}
        style={{ opacity: loading ? 1 : 0, transition: 'opacity 0.2s ease', pointerEvents: loading ? 'auto' : 'none', position: loading ? 'static' : 'absolute', inset: 0 }}
      >
        {skeleton}
      </div>
      <div style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.2s ease' }}>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Barrel `ui/index.ts`**

```ts
export { AnimatedModal } from './AnimatedModal.js'
export { Button } from './Button.js'
export { IconButton } from './IconButton.js'
export { EmptyState } from './EmptyState.js'
export { CrossFade } from './CrossFade.js'
```

- [ ] **Step 6: Rodar testes da pasta ui**

Run: `cd apps/desktop && pnpm vitest run src/components/ui/`
Expected: PASS (todos)

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/ui/
git commit -m "feat(ui): componentes EmptyState e CrossFade + barrel (#69)"
```

---

## FASE 2 — Migração de modais (bloco A)

### Task 6: Migrar modais pra `<AnimatedModal>`

Cada modal segue a MESMA receita. Migrar UM por vez, rodar o teste do modal, commitar.

**Receita de transformação (por modal):**
1. Importar: `import { AnimatedModal } from './ui/AnimatedModal.js'` (ou `'../ui/...'` em `org/`).
2. Remover o `if (!open) return null` (o AnimatedModal cuida).
3. Substituir o `<div role="presentation" ...backdrop...>` externo e o `<div role="dialog" ...card...>` interno por `<AnimatedModal open={open} onClose={onClose} size="md" closeOnBackdrop={...} busy={pending} labelledBy="...">`. Manter o `closeOnBackdrop` igual ao comportamento atual (forms não-vazios = false; confirmações = true). Mover o conteúdo interno (header/body/footer) pra dentro.
4. Remover o uso direto de `useModalDismiss` se ele só servia pro backdrop/escape (o AnimatedModal já faz). Se o modal usa `useModalDismiss` pra lógica extra (ex. `canDismissOutside` dinâmico baseado em form sujo), passar essa condição via `closeOnBackdrop`.
5. Rodar o teste do modal: `pnpm vitest run src/components/<Modal>.test.tsx`. Se o teste consultava o overlay antigo (ex. busca `role="presentation"` específico), confirmar que a expectativa comportamental segue (Escape fecha, backdrop fecha) e ajustar a query pro novo DOM — sem afrouxar a asserção.
6. Commit individual.

**Ordem (os 7 da issue primeiro — não tinham animação):**
- [ ] `org/InviteCodeModal.tsx`
- [ ] `org/ChangeRoleModal.tsx`
- [ ] `org/DeleteOrgModal.tsx`
- [ ] `org/RemoveMemberModal.tsx`
- [ ] `org/TransferOwnershipModal.tsx`
- [ ] `org/ManageMinistriesModal.tsx`
- [ ] `LogoutChoiceModal.tsx`
- [ ] `integrations/DisconnectModal.tsx`
- [ ] `integrations/SwapAccountModal.tsx`

**Depois, os que já animavam (refatorar pra usar o wrapper, sem regressão visual):**
- [ ] `ConfirmModal.tsx`
- [ ] `AddSectionModal.tsx`
- [ ] `MergeSectionsModal.tsx`
- [ ] `PlaylistFormModal.tsx`
- [ ] `AddSongToPlaylistModal.tsx`
- [ ] `EditSongModal.tsx` (tem `closing`/`animate-modal-out` — o wrapper assume o fade-out; remover o estado `closing` manual)
- [ ] `AddSongModal.tsx` (idem `closing`)

Após cada commit: `pnpm vitest run src/components/<Modal>.test.tsx` verde.

- [ ] **Step final da Task 6: suíte de componentes verde**

Run: `cd apps/desktop && pnpm vitest run src/components/`
Expected: PASS

---

## FASE 3 — Migração de botões (blocos B + D)

### Task 7–12: Migrar `<button>` → `<Button>`/`<IconButton>` por área

Migração mecânica e repetitiva. UMA área por task, commit por task. **Receita:**

- Trocar `<button onClick={..} style={primaryStyle}>Label</button>` por `<Button variant="primary" onClick={..}>Label</Button>`.
- Botões só-ícone (X de fechar, lápis, lixeira) → `<IconButton label="Fechar" onClick={..}><X size={18} /></IconButton>`.
- Escolher variante pela semântica: CTA azul → `primary`; destrutivo → `danger`; neutro com borda → `secondary`; só hover sutil → `ghost`.
- Remover o state `useState` de hover e os inline-styles de hover que viraram redundantes (o primitivo cuida). Cuidar do `noUnusedLocals`.
- Não alterar a lógica de onClick/disabled, só a casca visual.
- Após cada área: `pnpm vitest run <testes da área>` + `pnpm typecheck`.

Áreas (cada uma é uma task com commit próprio):
- [ ] **Task 7 — Modais** (`src/components/*.tsx` e `org/`, `integrations/`): botões dentro dos modais já migrados.
- [ ] **Task 8 — Páginas org** (`src/pages/org/*.tsx`, `src/pages/OrgManage.tsx`, `MemberMenu.tsx`).
- [ ] **Task 9 — Library + SongCard** (`src/pages/Library.tsx`, `components/SongCard.tsx`).
- [ ] **Task 10 — Playlists + PlaylistDetail** (`src/pages/Playlists.tsx`, `PlaylistDetail.tsx`).
- [ ] **Task 11 — Player** (`components/PlayerMini.tsx`, `PlayerExpanded.tsx`) — CUIDADO: regra de "perceived performance" (seek/volume aplicam transição none no clique). Não adicionar `active:scale` que atrase seek. Usar `IconButton` mas revisar que o feedback de mídia não regrediu.
- [ ] **Task 12 — Restante** (`Sidebar.tsx`, `Layout.tsx`, `GroupDetail.tsx`, `Settings`, `DonationBanner.tsx`, etc.) — varrer `grep -rn "<button" src/` e migrar o que sobrou.

- [ ] **Step final da Fase 3:**

Run: `cd apps/desktop && pnpm test && pnpm typecheck`
Expected: PASS. Garantir que `grep -rn "<button" src/ | grep -v ".test."` só retorna casos justificados (ex. dentro do próprio Button/IconButton).

---

## FASE 4 — Reduced-motion global (bloco D)

### Task 13: `prefers-reduced-motion` no index.css

**Files:**
- Modify: `apps/desktop/src/index.css` (fim do arquivo)

- [ ] **Step 1: Adicionar bloco**

```css
/* Acessibilidade: usuários com prefers-reduced-motion não recebem animações
   longas. Transições curtas de feedback são neutralizadas junto (default
   seguro). Issue #69 bloco D. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: typecheck/build não quebra** (CSS puro)

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/index.css
git commit -m "feat(a11y): respeitar prefers-reduced-motion globalmente (#69)"
```

---

## FASE 5 — Motion de transição (bloco C)

### Task 14: Skeleton → CrossFade (C2)

**Files:**
- Modify: `src/pages/Library.tsx` (~139-150) e demais consumers de `SongCardSkeleton`/`SectionSkeleton`.

- [ ] **Step 1:** Onde hoje é `{loading ? <SkeletonList/> : <Content/>}`, trocar por:

```tsx
<CrossFade loading={loading} skeleton={<SkeletonList/>}>
  <Content/>
</CrossFade>
```

Import: `import { CrossFade } from '../components/ui/CrossFade.js'`.

- [ ] **Step 2:** Verificar visualmente via preview (dev server) que o skeleton faz cross-fade em vez de piscar.
- [ ] **Step 3:** `pnpm vitest run src/pages/Library.test.tsx` (se existir) verde.
- [ ] **Step 4: Commit** `feat(ui): cross-fade skeleton->conteúdo (#69)`

### Task 15: Tab switching cross-fade (C1)

**Files:** `src/pages/OrgManage.tsx`, `components/AddSongModal.tsx`, `components/AddSectionModal.tsx`.

- [ ] **Step 1:** No container do conteúdo da aba ativa, adicionar `key={activeTab}` + `className="animate-fade-slide-in"` (já existe) OU `transition-opacity`. Como as abas já renderizam todas com `hidden`, aplicar a animação ao painel que fica visível ao trocar. Reusar `animate-fade-slide-in` (0.2s) pra coerência.
- [ ] **Step 2:** Preview: trocar abas mostra fade sutil, não snap.
- [ ] **Step 3:** Testes dos componentes verdes.
- [ ] **Step 4: Commit** `feat(ui): transição suave entre abas (#69)`

### Task 16: Item add/remove com stagger (C3)

**Files:** `src/pages/Library.tsx` (SongCard map), `PlaylistDetail.tsx`, `org/OrgInvites.tsx`.

- [ ] **Step 1:** No `.map((item, i) => ...)`, no wrapper de cada item adicionar `className="animate-fade-slide-in"` e `style={{ animationDelay: \`${Math.min(i, 10) * 30}ms\` }}`. Stagger teto 10 itens pra não atrasar listas grandes.
- [ ] **Step 2:** Remoção (PlaylistDetail): ao remover, aplicar fade-out antes do unmount onde viável (estado `removingId` + classe). Se complexo, manter remoção instantânea + toast (já existe) e registrar como follow-up.
- [ ] **Step 3:** Preview confirma entrada escalonada.
- [ ] **Step 4:** Testes verdes (cuidado: testes que contam itens não devem depender de timing de animação).
- [ ] **Step 5: Commit** `feat(ui): entrada escalonada de itens em listas (#69, #37)`

### Task 17: Indicador animado da sidebar (C4)

**Files:** `src/components/Sidebar.tsx` (~108-125).

- [ ] **Step 1:** Substituir o `borderLeft` por-item por um único indicador absoluto (`<div>` posicionado) cuja posição (`transform: translateY(...)`) anima com `transition: transform 0.22s cubic-bezier(0.34,1.25,0.64,1)`. Calcular o offset do item ativo (índice × altura do item). Manter cor `#3b82f6`, largura 3px.
- [ ] **Step 2:** Preview: trocar rota desliza a barra em vez de saltar.
- [ ] **Step 3: Commit** `feat(ui): barra ativa da sidebar desliza entre rotas (#69)`

---

## FASE 6 — Delight (bloco E)

### Task 18: Migrar empty states pra `<EmptyState>`

**Files:** `src/pages/Playlists.tsx:226`, `src/pages/Library.tsx`, `GroupDetail.tsx`, `PlaylistDetail.tsx`, `org/OrgInvites.tsx`.

- [ ] **Step 1:** Trocar cada `function EmptyState()` local / bloco inline por `<EmptyState icon={...} title=".." description=".." actionLabel=".." onAction={..} />` com ícone lucide apropriado (Music, Calendar, Users, Ticket).
- [ ] **Step 2:** Remover as funções `EmptyState` locais (cuidar `noUnusedLocals`).
- [ ] **Step 3:** Testes verdes.
- [ ] **Step 4: Commit** `feat(ui): empty states compartilhados e animados (#69)`

### Task 19: Success inline pós-save (org info)

**Files:** `src/pages/OrgManage.tsx` (aba info / form de salvar).

- [ ] **Step 1:** Após `toastSuccess` do save de org info, setar estado local `savedOk=true`, renderizar `<Check>` verde com `animate-pop-in` ao lado do botão, e limpar com `setTimeout(()=>setSavedOk(false), 1200)`. Limpar o timeout no unmount.
- [ ] **Step 2:** Preview confirma o check.
- [ ] **Step 3: Commit** `feat(ui): confirmação inline ao salvar org (#69)`

### Task 20: Splash → app fade-out

**Files:** `index.html` (boot-splash) + onde `#boot-splash` é removido.

- [ ] **Step 1:** Em vez de remover o splash com display:none/remove imediato, adicionar `transition: opacity 0.24s ease` no `#boot-splash`, setar `opacity:0` e remover após o transitionend (ou setTimeout 240ms).
- [ ] **Step 2:** Preview: boot termina com fade, não cut.
- [ ] **Step 3: Commit** `feat(ui): fade-out do splash ao abrir o app (#69)`

### Task 21: Drag ghost + drop pulse (PlaylistDetail)

**Files:** `src/pages/PlaylistDetail.tsx` (DnD custom, ~43-108).

- [ ] **Step 1:** Durante o drag (estado `drag` ativo), renderizar um ghost element (cópia leve do item) posicionado no cursor via mousemove já existente (`opacity:0.8`, `pointer-events:none`, `position:fixed`).
- [ ] **Step 2:** No drop target ativo, aplicar `animate-pulse-light` ou um highlight sutil de fundo.
- [ ] **Step 3:** Não reescrever a máquina de estados DnD — só camada visual. Verificar que reorder ainda funciona (preview + teste existente).
- [ ] **Step 4: Commit** `feat(ui): ghost e drop-zone no drag de músicas (#69)`

---

## FASE 7 — Perf perceptiva (bloco F)

### Task 22: CSS containment

**Files:** `src/pages/Library.tsx`, `src/pages/org/OrgMembers.tsx` (ou onde a lista de membros vive).

- [ ] **Step 1:** No container scrollável da lista grande, adicionar `style={{ contain: 'layout' }}` (ou classe utilitária `.lv-contain { contain: layout; }` em index.css). Não usar `contain: strict` (pode cortar conteúdo).
- [ ] **Step 2:** Verificar no preview que a lista renderiza igual (sem corte de layout).
- [ ] **Step 3: Commit** `perf(ui): contain:layout em listas grandes (#69)`

### Task 23: Prefetch on-hover

**Files:** Create `src/lib/usePrefetchRoute.ts` + Modify `src/components/Sidebar.tsx`.

- [ ] **Step 1: Teste do hook** (`src/lib/usePrefetchRoute.test.ts`): mockar a fonte de dados (SQLite/sync) e asserir que `prefetch('library')` dispara a leitura uma vez, e que chamar 2× não duplica (idempotente via cache de rotas já aquecidas — um `Set`).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
// mock da camada de dados conforme padrão do projeto (vi.mock('./db.js') etc.)
```

- [ ] **Step 2:** Implementar `usePrefetchRoute` retornando `prefetch(routeKey: string)`. Mapa routeKey → função de leitura (reusar as queries já usadas pelas páginas; não duplicar SQL — importar/extrair). Manter um `Set` de rotas já aquecidas pra idempotência. Falha silenciosa (try/catch + console.debug), sem toast.
- [ ] **Step 3:** Na Sidebar, `onMouseEnter={() => prefetch(item.routeKey)}` em cada NavLink.
- [ ] **Step 4:** Rodar teste do hook — verde. `pnpm typecheck`.
- [ ] **Step 5: Commit** `perf(ui): prefetch de dados da rota ao passar o mouse na sidebar (#69)`

### Task 24: Optimistic UI no create

**Files:** stores/libs de criação — `src/store/player.ts`? Não. Localizar: criar música (após download/insert), criar culto (`PlaylistFormModal` + store), criar ministério. Modificar o store/handler relevante.

- [ ] **Step 1: Teste (store/lib)** cobrindo: ao criar, o item aparece na lista local imediatamente com flag `pending`; em sucesso, `pending` limpa (e sync confirma); em falha, o item some (rollback) e `toastError` é chamado. Seguir o padrão de teste de store já existente.
- [ ] **Step 2:** Implementar inserção otimista: ao submeter create, inserir item provisório na coleção local (id temporário ou `pending:true`), disparar o write no Supabase + `syncOrg`. Em erro: remover o provisório, `captureException`, `toastError`. Reusar o padrão otimista já existente em delete/edit pra consistência.
- [ ] **Step 3:** Preview: criar culto/música/ministério mostra o item na hora.
- [ ] **Step 4:** Rodar teste — verde. `pnpm test`.
- [ ] **Step 5: Commit** `feat(ui): optimistic UI ao criar música/culto/ministério (#69)`

---

## FASE 8 — Fechamento

### Task 25: Verificação final + PR

- [ ] **Step 1:** `cd apps/desktop && pnpm test` — suíte completa verde (isolado E junto).
- [ ] **Step 2:** `cd apps/desktop && pnpm typecheck` — verde.
- [ ] **Step 3:** Rodar o app (`pnpm tauri dev` ou preview) e validar visualmente os fluxos principais: abrir/fechar modais (animação), hover/focus em botões, skeleton→conteúdo, troca de aba, sidebar, empty states, criar item (optimistic).
- [ ] **Step 4:** Perguntar ao usuário sobre E2E antes de abrir PR pra main (regra de memória — E2E saiu do CI).
- [ ] **Step 5:** Abrir PR pra `dev` com `Closes #69` (e `Refs #37`) no body, descrevendo blocos cobertos e a abordagem primitivos-primeiro.

---

## Self-Review (cobertura do spec)

- **A (modais consistentes):** Task 6. ✓
- **B (hovers):** Tasks 3/4 (primitivos) + 7–12 (migração). ✓
- **C1 (tabs):** Task 15. ✓ · **C2 (skeleton):** Task 14. ✓ · **C3 (add/remove):** Task 16. ✓ · **C4 (sidebar):** Task 17. ✓
- **D (focus rings):** primitivos (Tasks 3/4) + migração. **D (reduced-motion):** Task 13. ✓
- **E (empty states/success/splash/drag):** Tasks 18/19/20/21. ✓
- **F (containment/prefetch/optimistic):** Tasks 22/23/24. ✓
- **G1/G2/G3 (primitivos):** Tasks 2/3/4/5. ✓

Sem placeholders de implementação nos componentes net-new (código completo). As tasks de migração (6, 7–12, 18) são receitas mecânicas repetidas sobre muitos arquivos — descritas como procedimento + lista exata de arquivos, em vez de repetir 200+ blocos idênticos (DRY). Consistência de nomes verificada: `AnimatedModal`, `Button`, `IconButton`, `EmptyState`, `CrossFade`, `usePrefetchRoute`, classe `.lv-btn`, var `--lv-hover-bg`.
