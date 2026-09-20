import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { RectAnchor } from '../editor/types'
import { MenuItem } from './MenuItem'
import { useAnchoredPosition } from './rectAnchor'

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
  const { ref, style } = useAnchoredPosition(anchor, { align: 'right', getAnchor })

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

  return createPortal(
    <div
      ref={ref}
      data-page-menu={pageId}
      style={style}
      className="fixed z-50 w-56 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl"
    >
      <MenuItem
        action="rename"
        icon="✏️"
        label="Renombrar"
        onSelect={() => {
          onRename()
          onClose()
        }}
      />
      <MenuItem
        action="add-child"
        icon="↳"
        label="Añadir subpágina"
        onSelect={() => {
          onAddChild()
          onClose()
        }}
      />
      <MenuItem
        action="icon"
        icon="😀"
        label="Cambiar icono"
        onSelect={() => {
          onIcon()
          onClose()
        }}
      />
      <div className="my-1 border-t border-neutral-800" />
      <MenuItem
        action="delete"
        icon="⌫"
        label="Eliminar"
        onSelect={() => {
          onDelete()
          onClose()
        }}
      />
    </div>,
    document.body
  )
}
