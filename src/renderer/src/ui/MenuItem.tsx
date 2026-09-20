import type { ReactNode } from 'react'

export function MenuItem({
  icon,
  label,
  hint,
  disabled,
  action,
  onSelect
}: {
  icon: ReactNode
  label: string
  hint?: string
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
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-neutral-200 transition enabled:hover:bg-neutral-800 disabled:cursor-default disabled:text-neutral-600"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-neutral-400">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-xs text-neutral-600">{hint}</span>}
    </button>
  )
}
