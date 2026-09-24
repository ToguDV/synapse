import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { BlockType } from '../../../shared/types'
import {
  getCaretAnchor,
  getEditableCaretRect,
  getCaretOffset,
  getEditablePointAt,
  getEditableSelection,
  insertPlainText,
  isNearEditableText,
  readPlainText,
  setCaretOffset,
  setEditableSelection
} from '../editor/caret'
import { useEditorStore } from '../editor/editorStore'
import { isTextualBlock, maxIndentFor, readTextRange } from '../editor/transforms'
import type { BlockTextPoint, BlockTextRange, EditorBlock, RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { BlockMenu } from '../ui/BlockMenu'
import { rectAnchor, rectAnchorIfConnected } from '../ui/rectAnchor'
import { SlashMenu } from '../ui/SlashMenu'
import { DRAG_THRESHOLD_PX, TOUCH_DRAG_THRESHOLD_PX } from '../ui/usePageDrag'
import { BlockRow } from './BlockRow'

interface PendingDrag {
  blockId: string
  x: number
  y: number
  pointerId: number
  threshold: number
  source: HTMLButtonElement
  anchor: RectAnchor
}

interface DragState {
  blockId: string
  overIndex: number
  indent: number
}

interface TextSelectionDrag {
  anchor: BlockTextPoint
  focus: BlockTextPoint
  crossedBlock: boolean
}

const INDENT_STEP_PX = 24
const AUTOSCROLL_EDGE_PX = 56
const AUTOSCROLL_STEP_PX = 12

function caretAnchorFor(blockId: string, fallback: RectAnchor): RectAnchor {
  const element = document.querySelector<HTMLElement>(
    `[data-block-id="${CSS.escape(blockId)}"]`
  )
  if (!element) return fallback
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !element.contains(selection.anchorNode)) {
    return rectAnchor(element)
  }
  return getCaretAnchor(element) ?? fallback
}

function computeDrop(
  root: HTMLElement | null,
  blockId: string,
  clientX: number,
  clientY: number
): { overIndex: number; indent: number } | null {
  if (!root) return null
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row-id]')]
  let overIndex = rows.findIndex((row) => {
    const rect = row.getBoundingClientRect()
    return clientY < rect.top + rect.height / 2
  })
  if (overIndex === -1) overIndex = rows.length
  const fromIndex = rows.findIndex((row) => row.dataset.rowId === blockId)
  if (fromIndex !== -1 && overIndex > fromIndex) overIndex -= 1
  const remaining = useEditorStore.getState().blocks.filter((block) => block.id !== blockId)
  const clampedIndex = Math.max(0, Math.min(overIndex, remaining.length))
  const indent = Math.max(
    0,
    Math.min(
      Math.round((clientX - root.getBoundingClientRect().left) / INDENT_STEP_PX),
      maxIndentFor(remaining, clampedIndex)
    )
  )
  return { overIndex: clampedIndex, indent }
}

function previousTextBlock(blocks: EditorBlock[], fromIndex: number): EditorBlock | null {
  for (let index = fromIndex - 1; index >= 0; index--) {
    if (isTextualBlock(blocks[index])) return blocks[index]
  }
  return null
}

function nextTextBlock(blocks: EditorBlock[], fromIndex: number): EditorBlock | null {
  for (let index = fromIndex + 1; index < blocks.length; index++) {
    if (isTextualBlock(blocks[index])) return blocks[index]
  }
  return null
}

function moveHorizontal(
  blocks: EditorBlock[],
  point: BlockTextPoint,
  direction: -1 | 1
): BlockTextPoint {
  const index = blocks.findIndex((block) => block.id === point.blockId)
  if (index === -1) return point
  const block = blocks[index]
  const offset = Math.max(0, Math.min(point.offset, block.text.length))
  if (direction < 0 && offset > 0) {
    const current = block.text.charCodeAt(offset - 1)
    const previous = offset > 1 ? block.text.charCodeAt(offset - 2) : 0
    const width =
      current >= 0xdc00 &&
      current <= 0xdfff &&
      previous >= 0xd800 &&
      previous <= 0xdbff
        ? 2
        : 1
    return { blockId: point.blockId, offset: offset - width }
  }
  if (direction > 0 && offset < block.text.length) {
    const current = block.text.charCodeAt(offset)
    const next = offset + 1 < block.text.length ? block.text.charCodeAt(offset + 1) : 0
    const width = current >= 0xd800 && current <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1
    return { blockId: point.blockId, offset: offset + width }
  }
  if (direction < 0) {
    const previous = previousTextBlock(blocks, index)
    return previous ? { blockId: previous.id, offset: previous.text.length } : point
  }
  const next = nextTextBlock(blocks, index)
  return next ? { blockId: next.id, offset: 0 } : point
}

function moveVertical(
  blocks: EditorBlock[],
  point: BlockTextPoint,
  direction: -1 | 1
): BlockTextPoint {
  const index = blocks.findIndex((block) => block.id === point.blockId)
  if (index === -1) return point
  const block = blocks[index]
  const offset = Math.max(0, Math.min(point.offset, block.text.length))
  const lineStart = block.text.lastIndexOf('\n', offset - 1) + 1
  const lineEnd = block.text.indexOf('\n', offset)
  const column = offset - lineStart

  if (direction < 0 && lineStart > 0) {
    const previousEnd = lineStart - 1
    const previousStart = block.text.lastIndexOf('\n', previousEnd - 1) + 1
    return {
      blockId: block.id,
      offset: previousStart + Math.min(column, previousEnd - previousStart)
    }
  }
  if (direction > 0 && lineEnd !== -1) {
    const nextStart = lineEnd + 1
    const nextLineEnd = block.text.indexOf('\n', nextStart)
    const nextEnd = nextLineEnd === -1 ? block.text.length : nextLineEnd
    return { blockId: block.id, offset: nextStart + Math.min(column, nextEnd - nextStart) }
  }

  if (direction < 0) {
    const previous = previousTextBlock(blocks, index)
    if (!previous) return point
    const previousStart = previous.text.lastIndexOf('\n') + 1
    return {
      blockId: previous.id,
      offset: previousStart + Math.min(column, previous.text.length - previousStart)
    }
  }
  const next = nextTextBlock(blocks, index)
  if (!next) return point
  const nextLineEnd = next.text.indexOf('\n')
  const nextEnd = nextLineEnd === -1 ? next.text.length : nextLineEnd
  return { blockId: next.id, offset: Math.min(column, nextEnd) }
}

function editorPointForKeyTarget(target: EventTarget | null): BlockTextPoint | null {
  if (!(target instanceof Element)) return null
  const editable = target.closest<HTMLElement>('[data-block-id][contenteditable]')
  const blockId = editable?.dataset.blockId
  if (!editable || !blockId) return null
  return { blockId, offset: getCaretOffset(editable) }
}

interface ShortcutLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  preventDefault: () => void
}

function handleShortcuts(event: ShortcutLike): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) useEditorStore.getState().redo()
    else useEditorStore.getState().undo()
    return
  }
  if (key === 'y') {
    event.preventDefault()
    useEditorStore.getState().redo()
    return
  }
  if (key === 'd' && !event.shiftKey) {
    const state = useEditorStore.getState()
    const targets =
      state.selectedIds.length > 0
        ? state.selectedIds
        : state.activeBlockId
          ? [state.activeBlockId]
          : []
    if (targets.length === 0) return
    event.preventDefault()
    state.duplicateBlocks(targets)
  }
}

export function BlockList({ pageId }: { pageId: string }) {
  const { t } = useTranslation()
  const blocks = useEditorStore((state) => state.blocks)
  const loading = useEditorStore((state) => state.loading)
  const loadError = useEditorStore((state) => state.loadError)
  const loadPage = useEditorStore((state) => state.loadPage)
  const focusRequest = useEditorStore((state) => state.focusRequest)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const pointRef = useRef<{ x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLElement | null>(null)
  const scrollDirectionRef = useRef(0)
  const scrollFrameRef = useRef<number | null>(null)
  const textSelectionDragRef = useRef<TextSelectionDrag | null>(null)
  const verticalSelectionXRef = useRef<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [menu, setMenu] = useState<
    { blockId: string; anchor: RectAnchor; source: HTMLButtonElement } | null
  >(null)
  const [slash, setSlash] = useState<{ blockId: string; anchor: RectAnchor } | null>(null)

  useEffect(() => {
    if (useEditorStore.getState().pageId === pageId) return
    void loadPage(pageId).catch(() => undefined)
  }, [pageId, loadPage])

  useEffect(() => {
    if (!focusRequest) return
    verticalSelectionXRef.current = null
    const element = document.querySelector<HTMLElement>(
      `[data-block-id="${CSS.escape(focusRequest.blockId)}"]`
    )
    if (element) {
      setCaretOffset(element, focusRequest.caret)
      element.scrollIntoView({ block: 'nearest' })
    }
    useEditorStore.getState().consumeFocus()
  }, [focusRequest])

  useEffect(() => {
    const stopAutoScroll = (): void => {
      scrollDirectionRef.current = 0
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
        scrollFrameRef.current = null
      }
    }

    const stepAutoScroll = (): void => {
      const container = scrollRef.current
      const direction = scrollDirectionRef.current
      if (!container || direction === 0) {
        scrollFrameRef.current = null
        return
      }
      container.scrollTop += direction * AUTOSCROLL_STEP_PX
      const pending = pendingRef.current
      const point = pointRef.current
      if (pending && point && dragRef.current) {
        const drop = computeDrop(rootRef.current, pending.blockId, point.x, point.y)
        if (drop) {
          dragRef.current = { blockId: pending.blockId, ...drop }
          setDrag(dragRef.current)
        }
      }
      scrollFrameRef.current = requestAnimationFrame(stepAutoScroll)
    }

    const updateAutoScroll = (clientY: number): void => {
      const container = scrollRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      let direction = 0
      if (clientY < rect.top + AUTOSCROLL_EDGE_PX) direction = -1
      else if (clientY > rect.bottom - AUTOSCROLL_EDGE_PX) direction = 1
      scrollDirectionRef.current = direction
      if (direction !== 0 && scrollFrameRef.current === null) {
        scrollFrameRef.current = requestAnimationFrame(stepAutoScroll)
      }
    }

    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      const drop = computeDrop(rootRef.current, pending.blockId, event.clientX, event.clientY)
      if (!drop) return
      if (!dragRef.current) {
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < pending.threshold) {
          return
        }
        document.body.classList.add('select-none')
        scrollRef.current = rootRef.current?.closest<HTMLElement>('[data-editor-scroll]') ?? null
      }
      pointRef.current = { x: event.clientX, y: event.clientY }
      dragRef.current = { blockId: pending.blockId, ...drop }
      setDrag(dragRef.current)
      updateAutoScroll(event.clientY)
    }
    const onUp = () => {
      const pending = pendingRef.current
      pendingRef.current = null
      stopAutoScroll()
      if (!pending) return
      document.body.classList.remove('select-none')
      const active = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (active) {
        useEditorStore.getState().moveBlockTo(pending.blockId, active.overIndex, active.indent)
      } else {
        setMenu({
          blockId: pending.blockId,
          anchor: rectAnchorIfConnected(pending.source, pending.anchor),
          source: pending.source
        })
      }
    }
    const onCancel = () => {
      pendingRef.current = null
      dragRef.current = null
      stopAutoScroll()
      document.body.classList.remove('select-none')
      setDrag(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!pendingRef.current && !dragRef.current) return
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
      stopAutoScroll()
      document.body.classList.remove('select-none')
    }
  }, [])

  useEffect(() => {
    let frame: number | null = null
    const scheduleSelection = (dragState: TextSelectionDrag): void => {
      if (frame !== null) cancelAnimationFrame(frame)
      const anchor = dragState.anchor
      const focus = dragState.focus
      frame = requestAnimationFrame(() => {
        frame = null
        setEditableSelection(anchor, focus)
      })
    }
    const onMove = (event: MouseEvent): void => {
      const dragState = textSelectionDragRef.current
      if (!dragState || event.buttons !== 1) return
      const focus = getEditablePointAt(event.clientX, event.clientY)
      if (!focus) return
      if (!dragState.crossedBlock && focus.blockId === dragState.anchor.blockId) return
      dragState.crossedBlock = true
      dragState.focus = focus
      event.preventDefault()
      scheduleSelection(dragState)
    }
    const onUp = (event: MouseEvent): void => {
      const dragState = textSelectionDragRef.current
      textSelectionDragRef.current = null
      if (!dragState?.crossedBlock) return
      event.preventDefault()
      scheduleSelection(dragState)
    }
    const onBlur = (): void => {
      textSelectionDragRef.current = null
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
    }

    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', onUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('blur', onBlur)
      onBlur()
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onBeforeInput = (event: Event): void => {
      const selection = getEditableSelection()
      if (!selection || selection.start.blockId === selection.end.blockId) return
      const input = event as InputEvent
      const range: BlockTextRange = { start: selection.start, end: selection.end }
      if (input.inputType === 'deleteContentBackward' || input.inputType === 'deleteContentForward') {
        event.preventDefault()
        useEditorStore.getState().replaceTextRange(range, '')
        return
      }
      if (input.inputType === 'insertText' || input.inputType === 'insertReplacementText') {
        if (input.data === null) return
        event.preventDefault()
        useEditorStore.getState().replaceTextRange(range, input.data)
        return
      }
      if (input.inputType === 'insertLineBreak' || input.inputType === 'insertParagraph') {
        event.preventDefault()
        useEditorStore.getState().replaceTextRange(range, '\n')
      }
    }
    root.addEventListener('beforeinput', onBeforeInput, true)
    return () => root.removeEventListener('beforeinput', onBeforeInput, true)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body) return
      handleShortcuts(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleEditorMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    verticalSelectionXRef.current = null
    const point = getEditablePointAt(event.clientX, event.clientY)
    if (!point) {
      textSelectionDragRef.current = null
      return
    }
    const target = event.target instanceof Element ? event.target : null
    const inEditable = Boolean(target?.closest('[data-block-id][contenteditable]'))
    const blockSelectionShortcut = event.ctrlKey || event.metaKey
    // Plain Shift-click on a glyph extends text; row whitespace or Ctrl/Cmd+Shift keeps block selection.
    if (
      event.shiftKey &&
      !blockSelectionShortcut &&
      inEditable &&
      isNearEditableText(event.clientX, event.clientY)
    ) {
      const selection = getEditableSelection()
      if (selection) {
        event.preventDefault()
        event.stopPropagation()
        textSelectionDragRef.current = null
        useEditorStore.getState().clearSelection()
        setEditableSelection(selection.anchor, point)
        return
      }
    }
    if (event.shiftKey) {
      textSelectionDragRef.current = null
      return
    }
    textSelectionDragRef.current = { anchor: point, focus: point, crossedBlock: false }
  }

  const handleEditorKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const verticalKey = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    if (!event.shiftKey || !verticalKey) {
      verticalSelectionXRef.current = null
    }
    if (
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      return
    }
    const selection = getEditableSelection()
    const focus = selection?.focus ?? editorPointForKeyTarget(event.target)
    if (!focus) return
    if (useEditorStore.getState().selectedIds.length > 0) return
    let visualPoint: BlockTextPoint | null = null
    if (verticalKey) {
      const state = useEditorStore.getState()
      const block = blocks.find((candidate) => candidate.id === focus.blockId)
      const hasTextSelection = selection !== null && !selection.collapsed
      const direction: -1 | 1 = event.key === 'ArrowUp' ? -1 : 1
      const caretRect = getEditableCaretRect(focus)
      if (verticalSelectionXRef.current === null && caretRect) {
        verticalSelectionXRef.current = caretRect.left
      }
      const targetX = verticalSelectionXRef.current ?? caretRect?.left
      const targetY = caretRect
        ? caretRect.top + caretRect.height / 2 + direction * caretRect.height
        : null
      visualPoint =
        targetX !== undefined && targetX !== null && targetY !== null
          ? getEditablePointAt(targetX, targetY)
          : null
      if (
        !hasTextSelection &&
        (state.selectedIds.length > 0 ||
          !block ||
          // At a block boundary, preserve the existing Shift+Arrow block-range interaction.
          ((focus.offset === 0 || focus.offset === block.text.length) &&
            visualPoint?.blockId !== focus.blockId))
      ) {
        verticalSelectionXRef.current = null
        return
      }
    }
    const anchor = selection?.anchor ?? focus
    const direction: -1 | 1 = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    let next: BlockTextPoint
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      next = moveHorizontal(blocks, focus, direction)
    } else {
      next =
        visualPoint ?? moveVertical(blocks, focus, direction)
    }
    event.preventDefault()
    event.stopPropagation()
    useEditorStore.getState().clearSelection()
    setEditableSelection(anchor, next)
  }

  const handleRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    const inEditable = Boolean(target?.closest('[data-block-id][contenteditable]'))
    if (
      inEditable &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'a'
    ) {
      const first = blocks.find(isTextualBlock)
      const last = [...blocks].reverse().find(isTextualBlock)
      event.preventDefault()
      useEditorStore.getState().clearSelection()
      if (first && last) {
        setEditableSelection(
          { blockId: first.id, offset: 0 },
          { blockId: last.id, offset: last.text.length }
        )
      }
      return
    }
    handleShortcuts(event)
  }

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('[data-block-id][contenteditable]')) return
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    const selection = getEditableSelection()
    if (!selection) return
    if (selection.start.blockId === selection.end.blockId) {
      const target = document.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(selection.start.blockId)}"]`
      )
      if (target && insertPlainText(text)) {
        useEditorStore.getState().applyInput(selection.start.blockId, readPlainText(target))
      }
      return
    }
    useEditorStore
      .getState()
      .replaceTextRange({ start: selection.start, end: selection.end }, text)
  }

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    const selection = getEditableSelection()
    if (!selection || selection.start.blockId === selection.end.blockId) return
    const range: BlockTextRange = { start: selection.start, end: selection.end }
    const text = readTextRange(blocks, range)
    if (text === null) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', text)
  }

  const handleCut = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    const selection = getEditableSelection()
    if (!selection || selection.start.blockId === selection.end.blockId) return
    const range: BlockTextRange = { start: selection.start, end: selection.end }
    const text = readTextRange(blocks, range)
    if (text === null) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', text)
    useEditorStore.getState().replaceTextRange(range, '')
  }

  const handlePointerDown = (blockId: string, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pendingRef.current = {
      blockId,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      threshold: event.pointerType === 'mouse' ? DRAG_THRESHOLD_PX : TOUCH_DRAG_THRESHOLD_PX,
      source: event.currentTarget,
      anchor: rectAnchor(event.currentTarget)
    }
    setMenu(null)
  }

  const openSlash = (blockId: string, anchor: RectAnchor): void => {
    setMenu(null)
    setSlash({ blockId, anchor })
  }

  const selectSlash = (type: BlockType): void => {
    if (!slash) return
    useEditorStore.getState().applySlashCommand(slash.blockId, type)
    setSlash(null)
  }

  const closeSlash = (query: string): void => {
    if (slash && query !== '') {
      const state = useEditorStore.getState()
      const target = document.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(slash.blockId)}"]`
      )
      if (target && target === document.activeElement && insertPlainText(`/${query}`)) {
        state.setText(slash.blockId, readPlainText(target))
      }
    }
    setSlash(null)
  }

  const dragFromIndex = drag ? blocks.findIndex((block) => block.id === drag.blockId) : -1
  const placeholderIndex =
    drag && dragFromIndex !== -1
      ? drag.overIndex >= dragFromIndex
        ? drag.overIndex + 1
        : drag.overIndex
      : -1
  const placeholder = drag ? (
    <div
      data-drop-placeholder
      className="pointer-events-none my-0.5 h-0.5 rounded-full bg-sapphire"
      style={{ marginLeft: drag.indent * INDENT_STEP_PX }}
    />
  ) : null
  const menuBlock = menu && blocks.some((block) => block.id === menu.blockId) ? menu : null

  return (
    <div
      ref={rootRef}
      className="mt-4 flex flex-col pb-24"
      onKeyDown={handleRootKeyDown}
      onKeyDownCapture={handleEditorKeyDownCapture}
      onMouseDownCapture={handleEditorMouseDownCapture}
      onPaste={handlePaste}
      onCopy={handleCopy}
      onCut={handleCut}
    >
      {loadError ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <p className="text-sm text-error">{t('blocks.loadError')}</p>
          <button
            type="button"
            data-load-retry
            onClick={() => void loadPage(pageId).catch(() => undefined)}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted transition hover:bg-hover hover:text-ink"
          >
            {t('blocks.retry')}
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-faintest">{t('blocks.loading')}</p>
      ) : (
        blocks.map((block, index) => (
          <Fragment key={block.id}>
            {drag && placeholderIndex === index && placeholder}
            <BlockRow
              block={block}
              selected={selectedIds.includes(block.id)}
              dragging={drag?.blockId === block.id}
              menuOpen={menuBlock?.blockId === block.id}
              onOpenSlash={openSlash}
              onHandlePointerDown={handlePointerDown}
            />
          </Fragment>
        ))
      )}
      {drag && placeholderIndex >= blocks.length && placeholder}
      {slash && (
        <SlashMenu
          anchor={slash.anchor}
          getAnchor={() => caretAnchorFor(slash.blockId, slash.anchor)}
          onSelect={selectSlash}
          onClose={closeSlash}
        />
      )}
      {menuBlock && (
        <BlockMenu
          blockId={menuBlock.blockId}
          anchor={menuBlock.anchor}
          getAnchor={() => rectAnchorIfConnected(menuBlock.source, menuBlock.anchor)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
