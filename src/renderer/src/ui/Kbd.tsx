import type { ReactNode } from 'react'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-[5px] font-mono text-2xs font-medium text-muted ${
        className ?? ''
      }`}
    >
      {children}
    </kbd>
  )
}
