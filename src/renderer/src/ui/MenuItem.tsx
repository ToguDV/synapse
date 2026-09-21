import type { ReactNode } from 'react'
import { Kbd } from './Kbd'

export function MenuItem({
  icon,
  label,
  hint,
  danger,
  disabled,
  action,
  onSelect
}: {
  icon: ReactNode
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  action: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-menu-action={action}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition disabled:cursor-default disabled:text-faintest ${
        danger
          ? 'text-error enabled:hover:bg-error/10'
          : 'text-ink-soft enabled:hover:bg-hover enabled:hover:text-ink'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel font-mono text-2xs font-semibold ${
          danger ? 'text-error' : 'text-ink-soft'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 truncate font-medium">{label}</span>
      {hint && <Kbd>{hint}</Kbd>}
    </button>
  )
}
