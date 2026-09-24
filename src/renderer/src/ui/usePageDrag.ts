import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { comparePageOrder } from '../../../shared/domain'
import { collectDescendantIds } from '../store/pageTree'
import { usePagesStore } from '../store/pagesStore'

export const DRAG_THRESHOLD_PX = 4
export const TOUCH_DRAG_THRESHOLD_PX = 8

const TOUCH_CANCEL_PX = 8
const LONG_PRESS_MS = 450
const AUTO_EXPAND_MS = 500

export type PageDropZone = 'before' | 'after' | 'inside'

interface PendingPageDrag {
  pageId: string
  x: number
  y: number
  pointerId: number
  target: HTMLButtonElement
  byTouch: boolean
}

interface PageDragState {
  pageId: string
  overId: string | null
  zone: PageDropZone
}

export interface PageDropTarget {
  id: string
  zone: PageDropZone
}

interface PageDragOptions {
  onLongPress?: (pageId: string, target: HTMLButtonElement) => void
}

export function usePageDrag(options: PageDragOptions = {}) {
  const [drag, setDrag] = useState<PageDragState | null>(null)
  const pendingDragRef = useRef<PendingPageDrag | null>(null)
  const pendingTouchRef = useRef<PendingPageDrag | null>(null)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef<PageDragState | null>(null)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)
  const onLongPressRef = useRef(options.onLongPress)

  useEffect(() => {
    onLongPressRef.current = options.onLongPress
  })

  const cancelArm = useCallback(() => {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
    pendingTouchRef.current = null
  }, [])

  const blockScroll = useCallback((event: TouchEvent) => {
    event.preventDefault()
  }, [])

  const isBusy = useCallback(
    () => Boolean(dragRef.current || pendingDragRef.current || pendingTouchRef.current),
    []
  )

  useEffect(() => {
    const clearExpandTimer = (): void => {
      if (expandTimerRef.current !== null) {
        clearTimeout(expandTimerRef.current)
        expandTimerRef.current = null
      }
    }

    const endDrag = (): void => {
      clearExpandTimer()
      document.removeEventListener('touchmove', blockScroll)
      document.body.classList.remove('select-none', 'cursor-grabbing')
    }

    const onMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current
      if (pending && pending.pointerId !== event.pointerId) return
      if (!pending) {
        const touch = pendingTouchRef.current
        if (touch && touch.pointerId === event.pointerId) {
          if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > TOUCH_CANCEL_PX) {
            cancelArm()
          }
        }
        return
      }
      const threshold = pending.byTouch ? TOUCH_DRAG_THRESHOLD_PX : DRAG_THRESHOLD_PX
      if (!dragRef.current && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < threshold) {
        return
      }
      if (!dragRef.current) {
        document.body.classList.add('select-none', 'cursor-grabbing')
        suppressClickRef.current = true
      }
      const state = usePagesStore.getState()
      const forbidden = new Set([
        pending.pageId,
        ...collectDescendantIds(state.pages, pending.pageId)
      ])
      const element = document.elementFromPoint(event.clientX, event.clientY)
      const row = element instanceof Element ? element.closest('[data-page-id]') : null
      const overId = row instanceof HTMLElement ? (row.dataset.pageId ?? null) : null
      let next: PageDragState = { pageId: pending.pageId, overId: null, zone: 'before' }
      if (overId && !forbidden.has(overId) && row instanceof HTMLElement) {
        const rect = row.getBoundingClientRect()
        const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1)
        next = {
          pageId: pending.pageId,
          overId,
          zone: ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside'
        }
      }
      dragRef.current = next
      setDrag(next)
      clearExpandTimer()
      if (next.overId && next.zone === 'inside') {
        const targetId = next.overId
        const { pages: current, expandedIds } = usePagesStore.getState()
        const hasChildren = current.some((page) => page.parentId === targetId)
        if (hasChildren && !expandedIds.includes(targetId)) {
          expandTimerRef.current = setTimeout(() => {
            expandTimerRef.current = null
            usePagesStore.getState().toggleExpanded(targetId)
          }, AUTO_EXPAND_MS)
        }
      }
    }

    const onUp = () => {
      const touch = pendingTouchRef.current
      const pending = pendingDragRef.current
      cancelArm()
      pendingDragRef.current = null
      const active = dragRef.current
      dragRef.current = null
      endDrag()
      setDrag(null)
      if (!pending && !touch) return
      if (!active) {
        /* Solo el long-press táctil armado (sin arrastre) abre el menú:
           un tap normal no debe hacerlo. */
        const hold = pending?.byTouch ? pending : null
        if (hold) onLongPressRef.current?.(hold.pageId, hold.target)
        return
      }
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      const moved = pending ?? touch
      if (!moved || !active.overId) return
      const state = usePagesStore.getState()
      const target = state.pages.find((page) => page.id === active.overId)
      if (!target) return
      if (active.zone === 'inside') {
        const count = state.pages.filter(
          (page) => page.parentId === target.id && page.id !== moved.pageId
        ).length
        void state.movePage(moved.pageId, target.id, count)
        return
      }
      const siblings = state.pages
        .filter((page) => page.parentId === target.parentId && page.id !== moved.pageId)
        .sort(comparePageOrder)
      const index = siblings.findIndex((page) => page.id === target.id)
      if (index === -1) return
      void state.movePage(
        moved.pageId,
        target.parentId,
        active.zone === 'after' ? index + 1 : index
      )
    }

    const onCancel = () => {
      cancelArm()
      pendingDragRef.current = null
      dragRef.current = null
      endDrag()
      setDrag(null)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!pendingDragRef.current && !pendingTouchRef.current && !dragRef.current) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown, true)
      cancelArm()
      pendingDragRef.current = null
      dragRef.current = null
      endDrag()
    }
  }, [blockScroll, cancelArm])

  const handleDragPointerDown = (pageId: string, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    suppressClickRef.current = false
    const pending: PendingPageDrag = {
      pageId,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      target: event.currentTarget,
      byTouch: event.pointerType !== 'mouse'
    }
    if (!pending.byTouch) {
      pendingDragRef.current = pending
      return
    }
    cancelArm()
    pendingTouchRef.current = pending
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null
      const held = pendingTouchRef.current
      if (!held) return
      pendingTouchRef.current = null
      pendingDragRef.current = held
      suppressClickRef.current = true
      document.body.classList.add('select-none')
      document.addEventListener('touchmove', blockScroll, { passive: false })
    }, LONG_PRESS_MS)
  }

  return { drag, handleDragPointerDown, suppressClickRef, isBusy }
}
