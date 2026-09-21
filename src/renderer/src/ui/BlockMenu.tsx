import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore } from '../editor/editorStore'
import { BLOCK_MENU_ORDER, getBlockDefinition } from '../editor/registry'
import type { RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { Icon } from './Icon'
import { MenuItem } from './MenuItem'
import { Sheet } from './Sheet'
import { useAnchoredPosition } from './rectAnchor'
import { useTouchInput } from './useMediaQuery'

interface BlockMenuProps {
  blockId: string
  anchor: RectAnchor
  getAnchor?: () => RectAnchor
  onClose: () => void
}

export function BlockMenu({ blockId, anchor, getAnchor, onClose }: BlockMenuProps) {
  const { t } = useTranslation()
  const [view, setView] = useState<'main' | 'convert'>('main')
  const asSheet = useTouchInput()
  const { ref, style } = useAnchoredPosition(anchor, { align: 'right', getAnchor })
  const blocks = useEditorStore((state) => state.blocks)
  const duplicateBlocks = useEditorStore((state) => state.duplicateBlocks)
  const deleteBlocks = useEditorStore((state) => state.deleteBlocks)
  const moveBlockTo = useEditorStore((state) => state.moveBlockTo)
  const convertBlock = useEditorStore((state) => state.convertBlock)
  const index = blocks.findIndex((block) => block.id === blockId)
  const block = index >= 0 ? blocks[index] : null

  useEffect(() => {
    if (asSheet) return
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
  }, [asSheet, onClose, ref])

  if (!block) return null

  const items =
    view === 'main' ? (
      <>
        <MenuItem
          action="convert"
          icon={<Icon name="swap" size={16} />}
          label={t('blockMenu.convert')}
          touch={asSheet}
          onSelect={() => setView('convert')}
        />
        <MenuItem
          action="duplicate"
          icon={<Icon name="copy" size={16} />}
          label={t('blockMenu.duplicate')}
          hint="Ctrl+D"
          touch={asSheet}
          onSelect={() => {
            duplicateBlocks([blockId])
            onClose()
          }}
        />
        <MenuItem
          action="move-up"
          icon={<Icon name="arrow-up" size={16} />}
          label={t('blockMenu.moveUp')}
          touch={asSheet}
          disabled={index === 0}
          onSelect={() => {
            moveBlockTo(blockId, index - 1, block.indent)
            onClose()
          }}
        />
        <MenuItem
          action="move-down"
          icon={<Icon name="arrow-down" size={16} />}
          label={t('blockMenu.moveDown')}
          touch={asSheet}
          disabled={index === blocks.length - 1}
          onSelect={() => {
            moveBlockTo(blockId, index + 1, block.indent)
            onClose()
          }}
        />
        <div className="my-1 border-t border-border" />
        <MenuItem
          action="delete"
          icon={<Icon name="trash" size={16} />}
          tone="error"
          label={t('blockMenu.delete')}
          hint="Del"
          touch={asSheet}
          danger
          onSelect={() => {
            deleteBlocks([blockId])
            onClose()
          }}
        />
      </>
    ) : (
      <>
        <MenuItem
          action="back"
          icon={<Icon name="arrow-left" size={16} />}
          label={t('blockMenu.convert')}
          touch={asSheet}
          onSelect={() => setView('main')}
        />
        <div className="my-1 border-t border-border" />
        {BLOCK_MENU_ORDER.map((type) => {
          const definition = getBlockDefinition(type)
          return (
            <MenuItem
              key={type}
              action={`convert-${type}`}
              icon={definition.icon}
              label={t(`blocks.${type}.label`)}
              touch={asSheet}
              disabled={type === block.type}
              onSelect={() => {
                convertBlock(blockId, type)
                onClose()
              }}
            />
          )
        })}
      </>
    )

  if (asSheet) {
    return (
      <Sheet label={t('blocks.handle.label')} id="block-menu" onClose={onClose}>
        {items}
      </Sheet>
    )
  }

  return createPortal(
    <div
      ref={ref}
      data-block-menu
      style={style}
      className="fixed z-50 w-[292px] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-pop"
    >
      {items}
    </div>,
    document.body
  )
}
