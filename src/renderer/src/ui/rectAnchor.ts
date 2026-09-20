import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { RectAnchor } from '../editor/types'

export function rectAnchor(element: HTMLElement): RectAnchor {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

interface AnchoredPositionOptions {
  align?: 'left' | 'right'
  gap?: number
  margin?: number
}

export function anchoredPosition(
  anchor: RectAnchor,
  size: { width: number; height: number },
  options: AnchoredPositionOptions = {}
): { left: number; top: number } {
  const margin = options.margin ?? 8
  const gap = options.gap ?? 6
  const preferredLeft = options.align === 'right' ? anchor.right + gap : anchor.left
  const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - size.width - margin))
  const openUp = anchor.bottom + gap + size.height > window.innerHeight
  const top = openUp ? Math.max(margin, anchor.top - size.height - gap) : anchor.bottom + gap
  return { left, top }
}

export function useAnchoredPosition(
  anchor: RectAnchor,
  options: AnchoredPositionOptions = {}
): { ref: RefObject<HTMLDivElement>; style: CSSProperties } {
  const { align, gap, margin } = options
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = (): void => {
      setPosition(
        anchoredPosition(
          anchor,
          { width: element.offsetWidth, height: element.offsetHeight },
          { align, gap, margin }
        )
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [anchor, align, gap, margin])

  return {
    ref,
    style: position
      ? { left: position.left, top: position.top }
      : { left: -9999, top: -9999, visibility: 'hidden' }
  }
}
