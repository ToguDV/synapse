import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { TODO_STATUSES, type TodoStatus } from '../../../shared/content'
import type { RectAnchor } from '../editor/types'
import { useTranslation, type MessageKey } from '../i18n'
import { useAnchoredPosition } from './rectAnchor'
import { TodoStatusBox } from './TodoStatusBox'

export const TODO_STATUS_LABEL_KEYS: Record<TodoStatus, MessageKey> = {
  backlog: 'blocks.todo.status.backlog',
  todo: 'blocks.todo.status.todo',
  'in-progress': 'blocks.todo.status.inProgress',
  done: 'blocks.todo.status.done',
  cancelled: 'blocks.todo.status.cancelled'
}

interface StatusMenuProps {
  anchor: RectAnchor
  getAnchor?: () => RectAnchor
  current: TodoStatus
  onSelect: (status: TodoStatus) => void
  onClose: () => void
}

export function StatusMenu({ anchor, getAnchor, current, onSelect, onClose }: StatusMenuProps) {
  const { t } = useTranslation()
  const { ref, style } = useAnchoredPosition(anchor, { getAnchor })

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
  }, [onClose, ref])

  return createPortal(
    <div
      ref={ref}
      data-status-menu
      role="menu"
      aria-label={t('blocks.todo.statusLabel')}
      style={style}
      className="fixed z-50 w-40 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-pop"
    >
      {TODO_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          role="menuitemradio"
          aria-checked={status === current}
          data-status-option={status}
          data-active={status === current ? 'true' : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(status)}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-ink-soft transition hover:bg-hover hover:text-ink aria-checked:bg-selected aria-checked:text-ink"
        >
          <TodoStatusBox status={status} />
          <span className="flex-1 truncate">{t(TODO_STATUS_LABEL_KEYS[status])}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}
