import type { RectAnchor } from './types'

function nodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data
  if (node.nodeName === 'BR') return ''
  let text = ''
  for (const child of node.childNodes) text += nodeText(child)
  return text
}

function isLineDiv(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'DIV'
}

export function readPlainText(element: HTMLElement): string {
  const children = [...element.childNodes]
  if (!children.some(isLineDiv)) return nodeText(element)
  const lines: string[] = []
  let prefix = ''
  for (const child of children) {
    if (isLineDiv(child)) {
      lines.push(nodeText(child))
    } else if (lines.length === 0) {
      prefix += nodeText(child)
    } else {
      lines[lines.length - 1] += nodeText(child)
    }
  }
  if (prefix !== '') lines[0] = prefix + (lines[0] ?? '')
  return lines.join('\n')
}

export function writePlainText(element: HTMLElement, value: string): void {
  element.textContent = ''
  for (const line of value.split('\n')) {
    const div = document.createElement('div')
    if (line === '') div.appendChild(document.createElement('br'))
    else div.textContent = line
    element.appendChild(div)
  }
}

function findPoint(root: Node, offset: number): { node: Node; offset: number } | null {
  let remaining = offset
  let result: { node: Node; offset: number } | null = null
  const walk = (node: Node): void => {
    if (result) return
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node as Text).data.length
      if (remaining <= length) {
        result = { node, offset: remaining }
        return
      }
      remaining -= length
      return
    }
    if (node.nodeName === 'BR') return
    for (const child of node.childNodes) {
      walk(child)
      if (result) return
    }
  }
  walk(root)
  return result
}

function offsetWithin(node: Node, container: Node, containerOffset: number): number {
  let offset = 0
  let found = false
  const walk = (current: Node): void => {
    if (found) return
    if (current === container) {
      if (current.nodeType === Node.TEXT_NODE) {
        offset += containerOffset
      } else {
        const children = [...current.childNodes]
        for (let index = 0; index < containerOffset && index < children.length; index++) {
          offset += nodeText(children[index]).length
        }
      }
      found = true
      return
    }
    if (current.nodeType === Node.TEXT_NODE) {
      offset += (current as Text).data.length
      return
    }
    if (current.nodeName === 'BR') return
    for (const child of current.childNodes) {
      walk(child)
      if (found) return
    }
  }
  walk(node)
  return offset
}

function offsetAt(element: HTMLElement, container: Node, containerOffset: number): number {
  const children = [...element.childNodes]
  if (container === element) {
    let offset = 0
    for (let index = 0; index < containerOffset && index < children.length; index++) {
      if (index > 0) offset += 1
      offset += nodeText(children[index]).length
    }
    return offset
  }
  let offset = 0
  for (let index = 0; index < children.length; index++) {
    if (index > 0) offset += 1
    const line = children[index]
    if (line === container) {
      if (line.nodeType === Node.TEXT_NODE) return offset + containerOffset
      const kids = [...line.childNodes]
      for (let cursor = 0; cursor < containerOffset && cursor < kids.length; cursor++) {
        offset += nodeText(kids[cursor]).length
      }
      return offset
    }
    if (line.contains(container)) {
      return offset + offsetWithin(line, container, containerOffset)
    }
    offset += nodeText(line).length
  }
  return offset
}

export function getCaretOffset(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer)) return 0
  return offsetAt(element, range.startContainer, range.startOffset)
}

export function setCaretOffset(element: HTMLElement, offset: number): void {
  element.focus()
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  let remaining = Math.max(0, Math.min(offset, readPlainText(element).length))
  let placed = false
  const children = [...element.childNodes]
  for (let index = 0; index < children.length && !placed; index++) {
    if (index > 0) {
      if (remaining === 0) {
        range.setStart(children[index], 0)
        placed = true
        break
      }
      remaining -= 1
    }
    const line = children[index]
    const length = nodeText(line).length
    if (remaining <= length) {
      const point = findPoint(line, remaining)
      if (point) range.setStart(point.node, point.offset)
      else range.setStart(line, 0)
      placed = true
      break
    }
    remaining -= length
  }
  if (placed) {
    range.collapse(true)
  } else {
    range.selectNodeContents(element)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

export function insertPlainText(text: string): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const start =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement
  const element = start?.closest<HTMLElement>('[contenteditable]') ?? null
  if (!element) return false
  const startOffset = offsetAt(element, range.startContainer, range.startOffset)
  const endOffset = range.collapsed
    ? startOffset
    : offsetAt(element, range.endContainer, range.endOffset)
  const current = readPlainText(element)
  writePlainText(element, current.slice(0, startOffset) + text + current.slice(endOffset))
  setCaretOffset(element, startOffset + text.length)
  return true
}

export function getCaretAnchor(fallback?: HTMLElement | null): RectAnchor | null {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0).cloneRange()
    const rects = range.getClientRects()
    const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    }
  }
  if (fallback) {
    const rect = fallback.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  }
  return null
}
