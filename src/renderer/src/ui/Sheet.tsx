import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  label: string
  onClose: () => void
  children: ReactNode
  id?: string
  closeOnEscape?: boolean
}

/* Hoja inferior para pantallas estrechas: los popovers anclados quedan
   tapados por el borde inferior y por el teclado virtual en móvil. */
export function Sheet({ label, onClose, children, id, closeOnEscape = true }: SheetProps) {
  useEffect(() => {
    if (!closeOnEscape) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [closeOnEscape, onClose])

  return createPortal(
    <div
      data-sheet-backdrop
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--backdrop)] backdrop-blur-[2px]"
    >
      <div
        data-sheet={id ?? 'true'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="flex max-h-[75dvh] w-full max-w-full flex-col overflow-y-auto rounded-t-xl border-t border-border bg-surface p-1 pb-[max(env(safe-area-inset-bottom),8px)] shadow-modal sm:max-w-md"
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-1 mb-1.5 h-1 w-9 shrink-0 rounded-full bg-border-strong"
        />
        {children}
      </div>
    </div>,
    document.body
  )
}
