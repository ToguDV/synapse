import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { getCaretAnchor, getCaretOffset, insertPlainText, readPlainText } from '../editor/caret'
import { useEditorStore } from '../editor/editorStore'
import { getBlockDefinition } from '../editor/registry'
import type { EditorBlock, RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { rectAnchor, rectAnchorIfConnected } from '../ui/rectAnchor'
import { StatusMenu, TODO_STATUS_LABEL_KEYS } from '../ui/StatusMenu'
import { TodoStatusBox } from '../ui/TodoStatusBox'
import { BlockHandle } from './BlockHandle'
import { EditableText } from './EditableText'

interface BlockRowProps {
  block: EditorBlock
  selected: boolean
  dragging: boolean
  menuOpen: boolean
  onOpenSlash: (blockId: string, anchor: RectAnchor) => void
  onHandlePointerDown: (blockId: string, event: ReactPointerEvent<HTMLButtonElement>) => void
}

export function BlockRow({
  block,
  selected,
  dragging,
  menuOpen,
  onOpenSlash,
  onHandlePointerDown
}: BlockRowProps) {
  const setText = useEditorStore((state) => state.setText)
  const applyInput = useEditorStore((state) => state.applyInput)
  const setActiveBlock = useEditorStore((state) => state.setActiveBlock)
  const splitAt = useEditorStore((state) => state.splitAt)
  const mergeBackward = useEditorStore((state) => state.mergeBackward)
  const mergeForward = useEditorStore((state) => state.mergeForward)
  const indentBlock = useEditorStore((state) => state.indentBlock)
  const outdentBlock = useEditorStore((state) => state.outdentBlock)
  const focusSibling = useEditorStore((state) => state.focusSibling)
  const deleteBlocks = useEditorStore((state) => state.deleteBlocks)
  const extendSelection = useEditorStore((state) => state.extendSelection)
  const toggleDone = useEditorStore((state) => state.toggleDone)
  const setStatus = useEditorStore((state) => state.setStatus)
  const selectBlock = useEditorStore((state) => state.selectBlock)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const selectedCount = useEditorStore((state) => state.selectedIds.length)

  const definition = getBlockDefinition(block.type)
  const { t } = useTranslation()
  const status = block.status ?? 'todo'
  const statusRef = useRef<HTMLButtonElement>(null)
  const [statusMenu, setStatusMenu] = useState<RectAnchor | null>(null)

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const element = event.currentTarget
    const selection = window.getSelection()
    const collapsed = selection?.isCollapsed ?? true
    const inside = Boolean(
      selection && selection.rangeCount > 0 && element.contains(selection.getRangeAt(0).startContainer)
    )

    if (selectedCount > 0 && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault()
      deleteBlocks()
      return
    }

    if (event.key === 'Escape') {
      if (selectedCount > 0) clearSelection()
      return
    }

    switch (event.key) {
      case 'Enter': {
        if (event.altKey) return
        event.preventDefault()
        if (selectedCount > 0) {
          deleteBlocks()
          return
        }
        if (block.type === 'code' || event.shiftKey) {
          if (insertPlainText('\n')) setText(block.id, readPlainText(element))
          return
        }
        const caret = getCaretOffset(element)
        if (!collapsed && inside) {
          insertPlainText('')
          setText(block.id, readPlainText(element))
        }
        splitAt(block.id, caret)
        return
      }
      case 'Backspace': {
        if (!collapsed || !inside || getCaretOffset(element) !== 0) return
        event.preventDefault()
        mergeBackward(block.id)
        return
      }
      case 'Delete': {
        if (!collapsed || !inside || getCaretOffset(element) !== readPlainText(element).length) {
          return
        }
        event.preventDefault()
        mergeForward(block.id)
        return
      }
      case 'Tab': {
        event.preventDefault()
        if (event.shiftKey) outdentBlock(block.id)
        else indentBlock(block.id)
        return
      }
      case 'ArrowUp': {
        if (event.shiftKey && collapsed && inside) {
          event.preventDefault()
          extendSelection(block.id, -1)
          return
        }
        if (!collapsed || !inside || getCaretOffset(element) !== 0) return
        event.preventDefault()
        focusSibling(block.id, -1)
        return
      }
      case 'ArrowDown': {
        if (event.shiftKey && collapsed && inside) {
          event.preventDefault()
          extendSelection(block.id, 1)
          return
        }
        if (!collapsed || !inside || getCaretOffset(element) !== readPlainText(element).length) {
          return
        }
        event.preventDefault()
        focusSibling(block.id, 1)
        return
      }
      case '/': {
        if (event.ctrlKey || event.metaKey || event.altKey || !definition.textual) return
        event.preventDefault()
        onOpenSlash(block.id, getCaretAnchor(element) ?? element.getBoundingClientRect())
        return
      }
      default:
        return
    }
  }

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    if (event.shiftKey) {
      event.preventDefault()
      selectBlock(block.id, 'range')
      return
    }
    selectBlock(block.id, 'replace')
  }

  let prefix: ReactNode = null
  if (block.type === 'bullet') {
    prefix = <span className="mt-[11px] h-[5px] w-[5px] shrink-0 rounded-full bg-faint" />
  } else if (block.type === 'todo') {
    prefix = (
      <>
        <button
          ref={statusRef}
          type="button"
          role="checkbox"
          aria-checked={status === 'done'}
          aria-haspopup="menu"
          aria-label={`${t('blocks.todo.statusLabel')}: ${t(TODO_STATUS_LABEL_KEYS[status])}`}
          data-todo-checkbox
          data-status={status}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={() => toggleDone(block.id)}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setStatusMenu(rectAnchor(event.currentTarget))
          }}
          className="mt-[5px] shrink-0 rounded"
        >
          <TodoStatusBox status={status} />
        </button>
        {statusMenu && (
          <StatusMenu
            anchor={statusMenu}
            getAnchor={() => rectAnchorIfConnected(statusRef.current, statusMenu)}
            current={status}
            onSelect={(next) => {
              setStatus(block.id, next)
              setStatusMenu(null)
            }}
            onClose={() => setStatusMenu(null)}
          />
        )}
      </>
    )
  }

  const todoTextClasses =
    block.type !== 'todo'
      ? ''
      : status === 'done'
        ? 'text-faint line-through'
        : status === 'cancelled'
          ? 'text-faintest line-through'
          : ''

  const body = (
    <div className="relative min-w-0 flex-1">
      {block.text === '' && (
        <span
          className={`pointer-events-none absolute select-none text-faint ${definition.textClasses}`}
        >
          {t(`blocks.${block.type}.placeholder`)}
        </span>
      )}
      <EditableText
        blockId={block.id}
        value={block.text}
        className={`w-full outline-none ${definition.textClasses} ${todoTextClasses}`}
        onInput={(text) => applyInput(block.id, text)}
        onKeyDown={handleKeyDown}
        onFocus={() => setActiveBlock(block.id)}
      />
    </div>
  )

  let content: ReactNode
  if (block.type === 'divider') {
    content = (
      <div className="py-[10px]">
        <hr className="border-border-strong" />
      </div>
    )
  } else if (block.type === 'code') {
    content = (
      <div className="my-1 w-full rounded-lg border border-border bg-code px-4 py-3.5">{body}</div>
    )
  } else {
    content = (
      <div className={`flex items-start gap-[9px] py-[3px] ${block.type === 'heading' ? 'mt-[19px]' : ''}`}>
        {prefix}
        {body}
      </div>
    )
  }

  return (
    <div
      data-row-id={block.id}
      data-block-type={block.type}
      data-selected={selected ? 'true' : undefined}
      data-checked={block.type === 'todo' ? String(status === 'done') : undefined}
      data-status={block.type === 'todo' ? status : undefined}
      onMouseDown={handleMouseDown}
      style={{ marginLeft: block.indent * 24 }}
      className={`group relative rounded-md ${selected ? 'bg-selected shadow-[inset_2px_0_0_var(--accent)]' : ''} ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <BlockHandle
        visible={dragging || menuOpen}
        onPointerDown={(event) => onHandlePointerDown(block.id, event)}
      />
      {content}
    </div>
  )
}
