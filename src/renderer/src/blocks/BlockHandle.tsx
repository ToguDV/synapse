import type { PointerEvent as ReactPointerEvent } from 'react'

interface BlockHandleProps {
  visible: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

export function BlockHandle({ visible, onPointerDown }: BlockHandleProps) {
  return (
    <button
      type="button"
      data-block-handle
      aria-label="Opciones de bloque"
      onPointerDown={onPointerDown}
      className={`absolute -left-7 top-1 flex h-6 w-6 cursor-grab items-center justify-center rounded text-faint transition hover:bg-hover hover:text-ink-soft active:cursor-grabbing ${
        visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
        <circle cx="2" cy="2" r="1.4" />
        <circle cx="8" cy="2" r="1.4" />
        <circle cx="2" cy="8" r="1.4" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="2" cy="14" r="1.4" />
        <circle cx="8" cy="14" r="1.4" />
      </svg>
    </button>
  )
}
