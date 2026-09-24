import { useState } from 'react'
import { useEditorStore } from '../editor/editorStore'
import { BLOCK_MENU_ORDER, getBlockDefinition } from '../editor/registry'
import type { RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { Icon } from './Icon'
import { MenuItem } from './MenuItem'
import { Popover } from './Popover'
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
  const blocks = useEditorStore((state) => state.blocks)
  const duplicateBlocks = useEditorStore((state) => state.duplicateBlocks)
  const deleteBlocks = useEditorStore((state) => state.deleteBlocks)
  const moveBlockTo = useEditorStore((state) => state.moveBlockTo)
  const convertBlock = useEditorStore((state) => state.convertBlock)
  const index = blocks.findIndex((block) => block.id === blockId)
  const block = index >= 0 ? blocks[index] : null

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

  return (
    <Popover
      anchor={anchor}
      getAnchor={getAnchor}
      align="right"
      onClose={onClose}
      data={{ 'data-block-menu': 'true' }}
      className="w-[292px] overflow-hidden"
      sheetLabel={t('blocks.handle.label')}
      sheetId="block-menu"
    >
      {items}
    </Popover>
  )
}
