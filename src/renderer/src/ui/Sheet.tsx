import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  label: string
  onClose: () => void
  children: ReactNode
  id?: string
  closeOnEscape?: boolean
}

/* Distancia vertical mínima para cerrar la hoja al arrastrar el agarre. */
export const SHEET_SWIPE_THRESHOLD_PX = 64

export function shouldDismissSheet(dy: number, threshold = SHEET_SWIPE_THRESHOLD_PX): boolean {
  return dy >= threshold
}

/* Hoja inferior para pantallas estrechas: los popovers anclados quedan
   tapados por el borde inferior y por el teclado virtual en móvil.
   El agarre superior admite swipe-down para cerrar (táctil y ratón);
   el scroll interno no se interfiere: si la hoja está desplazada, el
   gesto se ignora y manda el scroll. */
export function Sheet({ label, onClose, children, id, closeOnEscape = true }: SheetProps) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const removeListenersRef = useRef<(() => void) | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!closeOnEscape) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [closeOnEscape])

  useEffect(
    () => () => {
      removeListenersRef.current?.()
      removeListenersRef.current = null
    },
    []
  )

  const onGrabberPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !event.isPrimary) return
    if ((panelRef.current?.scrollTop ?? 0) > 8) return
    const pointerId = event.pointerId
    const startY = event.clientY
    setDragging(true)

    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) return
      const dy = moveEvent.clientY - startY
      setOffset(dy > 0 ? dy : 0)
      if (dy > 0 && moveEvent.cancelable) moveEvent.preventDefault()
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      removeListenersRef.current = null
    }
    const onUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== pointerId) return
      cleanup()
      setDragging(false)
      const dy = upEvent.clientY - startY
      if (shouldDismissSheet(dy)) {
        setOffset(0)
        onCloseRef.current()
      } else {
        setOffset(0)
      }
    }
    removeListenersRef.current?.()
    removeListenersRef.current = cleanup
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return createPortal(
    <div
      data-sheet-backdrop
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--backdrop)] backdrop-blur-[2px]"
    >
      <div
        ref={panelRef}
        data-sheet={id ?? 'true'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{
          transform: offset > 0 ? `translateY(${offset}px)` : undefined,
          transition: dragging ? 'none' : 'transform 180ms ease'
        }}
        className="flex max-h-[75dvh] w-full max-w-full flex-col overflow-y-auto rounded-t-xl border-t border-border bg-surface p-1 pb-[max(env(safe-area-inset-bottom),8px)] shadow-modal sm:max-w-md"
      >
        <div
          data-sheet-grabber
          onPointerDown={onGrabberPointerDown}
          className="flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
        >
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
