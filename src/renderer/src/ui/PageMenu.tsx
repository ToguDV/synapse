import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { Icon } from './Icon'
import { MenuItem } from './MenuItem'
import { Sheet } from './Sheet'
import { useAnchoredPosition } from './rectAnchor'
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
  const { ref, style } = useAnchoredPosition(anchor, { align: 'right', getAnchor })

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

  if (asSheet) {
    return (
      <Sheet label={t('sidebar.pageOptions')} id="page-menu" onClose={onClose}>
        {items}
      </Sheet>
    )
  }

  return createPortal(
    <div
      ref={ref}
      data-page-menu={pageId}
      style={style}
      className="fixed z-50 w-56 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-pop"
    >
      {items}
    </div>,
    document.body
  )
}
