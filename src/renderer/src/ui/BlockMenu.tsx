import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore } from '../editor/editorStore'
import { BLOCK_MENU_ORDER, getBlockDefinition } from '../editor/registry'
import type { RectAnchor } from '../editor/types'
import { MenuItem } from './MenuItem'

interface BlockMenuProps {
  blockId: string
  anchor: RectAnchor
  onClose: () => void
}

const MENU_WIDTH = 240
const MENU_HEIGHT = 260

export function BlockMenu({ blockId, anchor, onClose }: BlockMenuProps) {
  const [view, setView] = useState<'main' | 'convert'>('main')
  const ref = useRef<HTMLDivElement>(null)
  const blocks = useEditorStore((state) => state.blocks)
  const duplicateBlocks = useEditorStore((state) => state.duplicateBlocks)
  const deleteBlocks = useEditorStore((state) => state.deleteBlocks)
  const moveBlockTo = useEditorStore((state) => state.moveBlockTo)
  const convertBlock = useEditorStore((state) => state.convertBlock)
  const index = blocks.findIndex((block) => block.id === blockId)
  const block = index >= 0 ? blocks[index] : null

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (ref.current && target instanceof Node && ref.current.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  if (!block) return null

  const left = Math.max(8, Math.min(anchor.right + 6, window.innerWidth - MENU_WIDTH - 8))
  const openUp = anchor.top + MENU_HEIGHT + 8 > window.innerHeight
  const top = openUp ? Math.max(8, anchor.top - MENU_HEIGHT) : anchor.top

  return createPortal(
    <div
      ref={ref}
      data-block-menu
      style={{ left, top }}
      className="fixed z-50 w-60 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl"
    >
      {view === 'main' ? (
        <>
          <MenuItem
            action="convert"
            icon="⇄"
            label="Convertir en…"
            onSelect={() => setView('convert')}
          />
          <MenuItem
            action="duplicate"
            icon="⧉"
            label="Duplicar"
            hint="Ctrl+D"
            onSelect={() => {
              duplicateBlocks([blockId])
              onClose()
            }}
          />
          <MenuItem
            action="move-up"
            icon="↑"
            label="Mover arriba"
            disabled={index === 0}
            onSelect={() => {
              moveBlockTo(blockId, index - 1, block.indent)
              onClose()
            }}
          />
          <MenuItem
            action="move-down"
            icon="↓"
            label="Mover abajo"
            disabled={index === blocks.length - 1}
            onSelect={() => {
              moveBlockTo(blockId, index + 1, block.indent)
              onClose()
            }}
          />
          <div className="my-1 border-t border-neutral-800" />
          <MenuItem
            action="delete"
            icon="⌫"
            label="Eliminar"
            hint="Supr"
            onSelect={() => {
              deleteBlocks([blockId])
              onClose()
            }}
          />
        </>
      ) : (
        <>
          <MenuItem action="back" icon="←" label="Convertir en…" onSelect={() => setView('main')} />
          <div className="my-1 border-t border-neutral-800" />
          {BLOCK_MENU_ORDER.map((type) => {
            const definition = getBlockDefinition(type)
            return (
              <MenuItem
                key={type}
                action={`convert-${type}`}
                icon={definition.icon}
                label={definition.label}
                disabled={type === block.type}
                onSelect={() => {
                  convertBlock(blockId, type)
                  onClose()
                }}
              />
            )
          })}
        </>
      )}
    </div>,
    document.body
  )
}
