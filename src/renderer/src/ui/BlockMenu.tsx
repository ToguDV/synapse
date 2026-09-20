import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore } from '../editor/editorStore'
import { BLOCK_MENU_ORDER, getBlockDefinition } from '../editor/registry'
import type { RectAnchor } from '../editor/types'
import { MenuItem } from './MenuItem'
import { useAnchoredPosition } from './rectAnchor'

interface BlockMenuProps {
  blockId: string
  anchor: RectAnchor
  getAnchor?: () => RectAnchor
  onClose: () => void
}

export function BlockMenu({ blockId, anchor, getAnchor, onClose }: BlockMenuProps) {
  const [view, setView] = useState<'main' | 'convert'>('main')
  const { ref, style } = useAnchoredPosition(anchor, { align: 'right', getAnchor })
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

  return createPortal(
    <div
      ref={ref}
      data-block-menu
      style={style}
      className="fixed z-50 w-60 overflow-hidden rounded-lg border border-border-strong bg-surface py-1 shadow-2xl"
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
          <div className="my-1 border-t border-border" />
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
          <div className="my-1 border-t border-border" />
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
