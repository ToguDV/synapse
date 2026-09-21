import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

export const SWIPE_THRESHOLD_PX = 48

export type SwipeDirection = 'left' | 'right'

interface SwipeHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

/* Swipe horizontal táctil. El eje vertical se deja al scroll nativo
   (los elementos anfitriones usan `touch-action: pan-y`). */
export function useHorizontalSwipe(
  onSwipe: (direction: SwipeDirection) => void,
  threshold = SWIPE_THRESHOLD_PX
): SwipeHandlers {
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const onSwipeRef = useRef(onSwipe)
  onSwipeRef.current = onSwipe

  const finish = (): void => {
    startRef.current = null
  }

  return {
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse' || event.button !== 0) return
      startRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* sin captura, los handlers siguen mientras el puntero esté encima */
      }
    },
    onPointerMove: (event) => {
      const start = startRef.current
      if (!start || start.pointerId !== event.pointerId) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (Math.abs(dy) > Math.abs(dx)) {
        startRef.current = null
        return
      }
      if (Math.abs(dx) >= threshold) {
        startRef.current = null
        onSwipeRef.current(dx > 0 ? 'right' : 'left')
      }
    },
    onPointerUp: finish,
    onPointerCancel: finish
  }
}
