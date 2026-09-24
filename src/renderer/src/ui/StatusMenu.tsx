import { TODO_STATUSES, type TodoStatus } from '../../../shared/content'
import type { RectAnchor } from '../editor/types'
import { useTranslation, type MessageKey } from '../i18n'
import { Popover } from './Popover'
import { useTouchInput } from './useMediaQuery'
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
  const asSheet = useTouchInput()

  const items = TODO_STATUSES.map((status) => (
    <button
      key={status}
      type="button"
      role="menuitemradio"
      aria-checked={status === current}
      data-status-option={status}
      data-active={status === current ? 'true' : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(status)}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-ink-soft transition hover:bg-hover hover:text-ink aria-checked:bg-selected aria-checked:text-ink ${
        asSheet ? 'min-h-11 py-2' : 'py-1.5'
      }`}
    >
      <TodoStatusBox status={status} />
      <span className="flex-1 truncate">{t(TODO_STATUS_LABEL_KEYS[status])}</span>
    </button>
  ))

  return (
    <Popover
      anchor={anchor}
      getAnchor={getAnchor}
      onClose={onClose}
      data={{ 'data-status-menu': 'true' }}
      role="menu"
      ariaLabel={t('blocks.todo.statusLabel')}
      className="w-40 overflow-hidden"
      sheetLabel={t('blocks.todo.statusLabel')}
      sheetId="status-menu"
    >
      {items}
    </Popover>
  )
}
