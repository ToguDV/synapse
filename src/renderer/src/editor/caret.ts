import type { BlockTextPoint, BlockTextRange, RectAnchor } from './types'

export interface EditableSelection extends BlockTextRange {
  anchor: BlockTextPoint
  focus: BlockTextPoint
  collapsed: boolean
}

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

function editableForNode(node: Node | null): HTMLElement | null {
  if (!node) return null
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return element?.closest<HTMLElement>('[data-block-id][contenteditable]') ?? null
}

function editablePoint(node: Node | null, offset: number): BlockTextPoint | null {
  const element = editableForNode(node)
  const blockId = element?.dataset.blockId
  if (!element || !blockId || !node || !element.contains(node) && node !== element) return null
  return { blockId, offset: offsetAt(element, node, offset) }
}

function editableById(blockId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-block-id="${CSS.escape(blockId)}"][contenteditable]`
  )
}

function pointAt(element: HTMLElement, offset: number): { node: Node; offset: number } {
  let remaining = Math.max(0, Math.min(offset, readPlainText(element).length))
  const children = [...element.childNodes]
  for (let index = 0; index < children.length; index++) {
    if (index > 0) {
      if (remaining === 0) return { node: children[index], offset: 0 }
      remaining -= 1
    }
    const line = children[index]
    const length = nodeText(line).length
    if (remaining <= length) {
      const point = findPoint(line, remaining)
      return point ?? { node: line, offset: 0 }
    }
    remaining -= length
  }
  return { node: element, offset: children.length }
}

export function getEditableCaretRect(point: BlockTextPoint): DOMRect | null {
  const element = editableById(point.blockId)
  if (!element) return null
  const position = pointAt(element, point.offset)
  const range = document.createRange()
  range.setStart(position.node, position.offset)
  range.collapse(true)
  const rect = range.getBoundingClientRect()
  return rect.height > 0 ? rect : null
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
  const point = pointAt(element, offset)
  range.setStart(point.node, point.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function getEditableSelection(): EditableSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) {
    return null
  }
  const range = selection.getRangeAt(0)
  const anchor = editablePoint(selection.anchorNode, selection.anchorOffset)
  const focus = editablePoint(selection.focusNode, selection.focusOffset)
  const start = editablePoint(range.startContainer, range.startOffset)
  const end = editablePoint(range.endContainer, range.endOffset)
  if (!anchor || !focus || !start || !end) return null
  return { anchor, focus, start, end, collapsed: selection.isCollapsed }
}

export function getEditablePointAt(clientX: number, clientY: number): BlockTextPoint | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const position = doc.caretPositionFromPoint?.(clientX, clientY)
  if (position) return editablePoint(position.offsetNode, position.offset)
  const range = doc.caretRangeFromPoint?.(clientX, clientY)
  return range ? editablePoint(range.startContainer, range.startOffset) : null
}

export function isNearEditableText(clientX: number, clientY: number): boolean {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const position = doc.caretPositionFromPoint?.(clientX, clientY)
  const fallback = position ? null : doc.caretRangeFromPoint?.(clientX, clientY)
  const node = position?.offsetNode ?? fallback?.startContainer ?? null
  const offset = position?.offset ?? fallback?.startOffset ?? 0
  const element = editableForNode(node)
  if (!element || !node) return false

  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const rect = range.getBoundingClientRect()
  return (
    rect.height > 0 &&
    Math.abs(clientX - rect.left) <= 10 &&
    clientY >= rect.top - 4 &&
    clientY <= rect.bottom + 4
  )
}

export function setEditableSelection(anchor: BlockTextPoint, focus: BlockTextPoint): boolean {
  const anchorElement = editableById(anchor.blockId)
  const focusElement = editableById(focus.blockId)
  const selection = window.getSelection()
  if (!anchorElement || !focusElement || !selection) return false

  const anchorPoint = pointAt(anchorElement, anchor.offset)
  const focusPoint = pointAt(focusElement, focus.offset)
  focusElement.focus()
  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(
      anchorPoint.node,
      anchorPoint.offset,
      focusPoint.node,
      focusPoint.offset
    )
    return true
  }

  const anchorRange = document.createRange()
  anchorRange.setStart(anchorPoint.node, anchorPoint.offset)
  anchorRange.collapse(true)
  const focusRange = document.createRange()
  focusRange.setStart(focusPoint.node, focusPoint.offset)
  focusRange.collapse(true)
  const forward = anchorRange.compareBoundaryPoints(Range.START_TO_START, focusRange) <= 0
  const range = document.createRange()
  const start = forward ? anchorPoint : focusPoint
  const end = forward ? focusPoint : anchorPoint
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

export function collapseEditableSelection(): void {
  const selection = getEditableSelection()
  if (!selection || selection.collapsed) return
  setEditableSelection(selection.focus, selection.focus)
}

export function insertPlainText(text: string): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const element = editableForNode(range.startContainer)
  if (!element || editableForNode(range.endContainer) !== element) return false
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
