import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { RectAnchor } from '../editor/types'

export function rectAnchor(element: HTMLElement): RectAnchor {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

export function rectAnchorIfConnected(
  element: HTMLElement | null,
  fallback: RectAnchor
): RectAnchor {
  return element && element.isConnected ? rectAnchor(element) : fallback
}

interface AnchoredPositionOptions {
  align?: 'left' | 'right'
  gap?: number
  margin?: number
}

interface FloatingPosition {
  left: number
  top: number
}

export function anchoredPosition(
  anchor: RectAnchor,
  size: { width: number; height: number },
  options: AnchoredPositionOptions = {}
): FloatingPosition {
  const margin = options.margin ?? 8
  const gap = options.gap ?? 6
  const preferredLeft = options.align === 'right' ? anchor.right + gap : anchor.left
  const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - size.width - margin))
  const openUp = anchor.bottom + gap + size.height > window.innerHeight
  const preferredTop = openUp ? anchor.top - size.height - gap : anchor.bottom + gap
  const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - size.height - margin))
  return { left, top }
}

export function useAnchoredPosition(
  anchor: RectAnchor,
  options: AnchoredPositionOptions & { getAnchor?: () => RectAnchor } = {}
): { ref: RefObject<HTMLDivElement>; style: CSSProperties } {
  const { align, gap, margin, getAnchor } = options
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<FloatingPosition | null>(null)
  const anchorRef = useRef(anchor)
  const getAnchorRef = useRef(getAnchor)

  useLayoutEffect(() => {
    anchorRef.current = anchor
    getAnchorRef.current = getAnchor
  })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = (): void => {
      const current = getAnchorRef.current?.() ?? anchorRef.current
      const next = anchoredPosition(
        current,
        { width: element.offsetWidth, height: element.offsetHeight },
        { align, gap, margin }
      )
      setPosition((previous) =>
        previous && previous.left === next.left && previous.top === next.top ? previous : next
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [anchor.left, anchor.top, anchor.right, anchor.bottom, align, gap, margin])

  return {
    ref,
    style: position
      ? { left: position.left, top: position.top }
      : { left: -9999, top: -9999, visibility: 'hidden' }
  }
}
