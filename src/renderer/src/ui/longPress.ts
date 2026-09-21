import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'

export const LONG_PRESS_MS = 450
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8

interface LongPressOptions {
  onLongPress: (target: HTMLElement) => void
  delay?: number
  moveTolerance?: number
  disabled?: boolean
}

interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
  consumeClick: () => boolean
}

/* Long-press táctil con supresión del click posterior. El clic derecho
   (ratón) sigue abriendo el mismo menú vía `onContextMenu`. */
export function useLongPress({
  onLongPress,
  delay = LONG_PRESS_MS,
  moveTolerance = LONG_PRESS_MOVE_TOLERANCE_PX,
  disabled = false
}: LongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const longPressAtRef = useRef(Number.NEGATIVE_INFINITY)
  const suppressClickRef = useRef(false)
  const onLongPressRef = useRef(onLongPress)
  onLongPressRef.current = onLongPress

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    originRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      /* Un puntero nuevo descarta cualquier supresión pendiente: si el
         long-press anterior no llegó a generar click, no debe tragarse el
         siguiente tap. */
      suppressClickRef.current = false
      if (disabled || event.button !== 0 || event.pointerType === 'mouse') return
      clearTimer()
      originRef.current = { x: event.clientX, y: event.clientY }
      const target = event.currentTarget
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        /* pointer capture no disponible: seguimos con los handlers del elemento */
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        longPressAtRef.current = performance.now()
        suppressClickRef.current = true
        onLongPressRef.current(target)
      }, delay)
    },
    [clearTimer, delay, disabled]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current
      if (!origin || timerRef.current === null) return
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > moveTolerance) {
        clearTimer()
      }
    },
    [clearTimer, moveTolerance]
  )

  const onPointerUp = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    /* En táctil Chromium también emite contextmenu tras un long-press:
       no abrir el menú dos veces. */
    if (performance.now() - longPressAtRef.current < 1000) return
    onLongPressRef.current(event.currentTarget)
  }, [])

  const consumeClick = useCallback(() => {
    const suppressed = suppressClickRef.current
    suppressClickRef.current = false
    return suppressed
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onContextMenu,
    consumeClick
  }
}
