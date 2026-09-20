import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { BlockType } from '../../../shared/types'
import { insertPlainText, getCaretAnchor, readPlainText, setCaretOffset } from '../editor/caret'
import { useEditorStore } from '../editor/editorStore'
import { maxIndentFor } from '../editor/transforms'
import type { RectAnchor } from '../editor/types'
import { BlockMenu } from '../ui/BlockMenu'
import { rectAnchor, rectAnchorIfConnected } from '../ui/rectAnchor'
import { SlashMenu } from '../ui/SlashMenu'
import { BlockRow } from './BlockRow'

interface PendingDrag {
  blockId: string
  x: number
  y: number
  source: HTMLButtonElement
  anchor: RectAnchor
}

interface DragState {
  blockId: string
  overIndex: number
  indent: number
}

const DRAG_THRESHOLD_PX = 4
const INDENT_STEP_PX = 24

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
  const blocks = useEditorStore((state) => state.blocks)
  const loading = useEditorStore((state) => state.loading)
  const loadPage = useEditorStore((state) => state.loadPage)
  const focusRequest = useEditorStore((state) => state.focusRequest)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [menu, setMenu] = useState<
    { blockId: string; anchor: RectAnchor; source: HTMLButtonElement } | null
  >(null)
  const [slash, setSlash] = useState<{ blockId: string; anchor: RectAnchor } | null>(null)

  useEffect(() => {
    if (useEditorStore.getState().pageId === pageId) return
    void loadPage(pageId)
  }, [pageId, loadPage])

  useEffect(() => {
    if (!focusRequest) return
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
    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending) return
      const drop = computeDrop(rootRef.current, pending.blockId, event.clientX, event.clientY)
      if (!drop) return
      if (!dragRef.current) {
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_THRESHOLD_PX) {
          return
        }
        document.body.classList.add('select-none')
      }
      dragRef.current = { blockId: pending.blockId, ...drop }
      setDrag(dragRef.current)
    }
    const onUp = () => {
      const pending = pendingRef.current
      pendingRef.current = null
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!pendingRef.current && !dragRef.current) return
      event.preventDefault()
      event.stopPropagation()
      pendingRef.current = null
      dragRef.current = null
      document.body.classList.remove('select-none')
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKeyDown, true)
      document.body.classList.remove('select-none')
    }
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

  const handlePointerDown = (blockId: string, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pendingRef.current = {
      blockId,
      x: event.clientX,
      y: event.clientY,
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
      className="pointer-events-none my-0.5 h-0.5 rounded-full bg-blue-500"
      style={{ marginLeft: drag.indent * INDENT_STEP_PX }}
    />
  ) : null
  const menuBlock = menu && blocks.some((block) => block.id === menu.blockId) ? menu : null

  return (
    <div ref={rootRef} className="mt-4 flex flex-col pb-24" onKeyDown={handleShortcuts}>
      {loading ? (
        <p className="text-sm text-neutral-600">Cargando bloques…</p>
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
