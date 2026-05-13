import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export type Toast = {
  id: string
  kind: ToastKind
  title: string
  body?: string
  // Duração em ms antes de auto-dismiss. 0 = persistente até clicar X.
  duration: number
}

type ToastsState = {
  items: Toast[]
  show: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string
  dismiss: (id: string) => void
}

let counter = 0

export const useToasts = create<ToastsState>((set) => ({
  items: [],
  show: ({ duration = 4000, ...rest }) => {
    const id = `t${++counter}`
    set((s) => ({ items: [...s.items, { id, duration, ...rest }] }))
    if (duration > 0) {
      window.setTimeout(() => {
        set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
      }, duration)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}))

// Helpers
export function toastSuccess(title: string, body?: string, duration?: number) {
  return useToasts.getState().show({ kind: 'success', title, body, duration })
}
export function toastError(title: string, body?: string, duration?: number) {
  return useToasts.getState().show({ kind: 'error', title, body, duration: duration ?? 6000 })
}
export function toastInfo(title: string, body?: string, duration?: number) {
  return useToasts.getState().show({ kind: 'info', title, body, duration })
}
