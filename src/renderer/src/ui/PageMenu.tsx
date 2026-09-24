import type { RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { Icon } from './Icon'
import { MenuItem } from './MenuItem'
import { Popover } from './Popover'
import { useTouchInput } from './useMediaQuery'

interface PageMenuProps {
  pageId: string
  anchor: RectAnchor
  getAnchor?: () => RectAnchor
  onRename: () => void
  onAddChild: () => void
  onIcon: () => void
  onDelete: () => void
  onClose: () => void
}

export function PageMenu({
  pageId,
  anchor,
  getAnchor,
  onRename,
  onAddChild,
  onIcon,
  onDelete,
  onClose
}: PageMenuProps) {
  const { t } = useTranslation()
  const asSheet = useTouchInput()

  const items = (
    <>
      <MenuItem
        action="rename"
        icon={<Icon name="pencil" size={16} />}
        label={t('pageMenu.rename')}
        touch={asSheet}
        onSelect={() => {
          onRename()
          onClose()
        }}
      />
      <MenuItem
        action="add-child"
        icon={<Icon name="plus" size={16} />}
        label={t('pageMenu.addSubpage')}
        touch={asSheet}
        onSelect={() => {
          onAddChild()
          onClose()
        }}
      />
      <MenuItem
        action="icon"
        icon={<Icon name="smile" size={16} />}
        label={t('pageMenu.changeIcon')}
        touch={asSheet}
        onSelect={() => {
          onIcon()
          onClose()
        }}
      />
      <div className="my-1 border-t border-border" />
      <MenuItem
        action="delete"
        icon={<Icon name="trash" size={16} />}
        tone="error"
        label={t('pageMenu.delete')}
        touch={asSheet}
        danger
        onSelect={() => {
          onDelete()
          onClose()
        }}
      />
    </>
  )

  return (
    <Popover
      anchor={anchor}
      getAnchor={getAnchor}
      align="right"
      onClose={onClose}
      data={{ 'data-page-menu': pageId }}
      className="w-56 overflow-hidden"
      sheetLabel={t('sidebar.pageOptions')}
      sheetId="page-menu"
    >
      {items}
    </Popover>
  )
}
