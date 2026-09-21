import type { CSSProperties, ReactNode } from 'react'
import type { IconTone } from './Icon'
import { Kbd } from './Kbd'

export function MenuItem({
  icon,
  label,
  hint,
  danger,
  disabled,
  tone,
  action,
  onSelect
}: {
  icon: ReactNode
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  tone?: IconTone
  action: string
  onSelect: () => void
}) {
  const toned = tone && tone !== 'neutral'
  const tileStyle: CSSProperties | undefined = toned
    ? {
        borderColor: `color-mix(in srgb, var(--icon-${tone}) 26%, transparent)`,
        background: `color-mix(in srgb, var(--icon-${tone}) 12%, transparent)`
      }
    : undefined

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
        style={tileStyle}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-2xs font-semibold ${
          toned ? '' : `border-border bg-panel ${danger ? 'text-error' : 'text-ink-soft'}`
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 truncate font-medium">{label}</span>
      {hint && <Kbd>{hint}</Kbd>}
    </button>
  )
}
