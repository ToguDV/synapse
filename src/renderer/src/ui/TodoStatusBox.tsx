import type { TodoStatus } from '../../../shared/content'
import { Icon } from './Icon'

const STATUS_CLASSES: Record<TodoStatus, string> = {
  backlog: 'border-dotted border-faint text-transparent hover:border-muted',
  todo: 'border-faint text-transparent hover:border-muted',
  'in-progress':
    'border-warning bg-[linear-gradient(90deg,var(--warning)_50%,transparent_50%)] text-transparent',
  done: 'border-success bg-success text-canvas',
  cancelled: 'border-faintest bg-faintest text-canvas'
}

export function TodoStatusBox({
  status,
  className = ''
}: {
  status: TodoStatus
  className?: string
}) {
  return (
    <span
      data-status-box={status}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] transition ${STATUS_CLASSES[status]} ${className}`}
    >
      {status === 'done' && <Icon name="check" size={12} className="text-current" />}
      {status === 'cancelled' && <Icon name="x" size={12} className="text-current" />}
    </span>
  )
}
