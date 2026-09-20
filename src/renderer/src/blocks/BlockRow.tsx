import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { getCaretAnchor, getCaretOffset, insertPlainText, readPlainText } from '../editor/caret'
import { useEditorStore } from '../editor/editorStore'
import { getBlockDefinition } from '../editor/registry'
import type { EditorBlock, RectAnchor } from '../editor/types'
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
  const toggleChecked = useEditorStore((state) => state.toggleChecked)
  const selectBlock = useEditorStore((state) => state.selectBlock)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const selectedCount = useEditorStore((state) => state.selectedIds.length)

  const definition = getBlockDefinition(block.type)
  const checked = block.checked ?? false

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
    prefix = <span className="select-none pt-0.5 text-neutral-500">•</span>
  } else if (block.type === 'todo') {
    prefix = (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label="Marcar tarea"
        data-todo-checkbox
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={() => toggleChecked(block.id)}
        className={`mt-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none transition ${
          checked
            ? 'border-blue-500 bg-blue-500 text-white'
            : 'border-neutral-600 hover:border-neutral-400'
        }`}
      >
        {checked ? '✓' : ''}
      </button>
    )
  }

  const body = (
    <div className="relative min-w-0 flex-1">
      {block.text === '' && (
        <span
          className={`pointer-events-none absolute select-none text-neutral-600 ${definition.textClasses}`}
        >
          {definition.placeholder}
        </span>
      )}
      <EditableText
        blockId={block.id}
        value={block.text}
        className={`w-full outline-none ${definition.textClasses} ${
          block.type === 'todo' && checked ? 'text-neutral-500 line-through' : ''
        }`}
        onInput={(text) => applyInput(block.id, text)}
        onKeyDown={handleKeyDown}
        onFocus={() => setActiveBlock(block.id)}
      />
    </div>
  )

  let content: ReactNode
  if (block.type === 'divider') {
    content = (
      <div className="py-2">
        <hr className="border-neutral-800" />
      </div>
    )
  } else if (block.type === 'code') {
    content = (
      <div className="my-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
        {body}
      </div>
    )
  } else {
    content = (
      <div className="flex items-start gap-2 py-0.5">
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
      data-checked={block.type === 'todo' ? String(checked) : undefined}
      onMouseDown={handleMouseDown}
      style={{ marginLeft: block.indent * 24 }}
      className={`group relative rounded ${selected ? 'bg-blue-500/10' : ''} ${
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
