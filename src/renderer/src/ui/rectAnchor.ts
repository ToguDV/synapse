import type { RectAnchor } from '../editor/types'

export function rectAnchor(element: HTMLElement): RectAnchor {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}
