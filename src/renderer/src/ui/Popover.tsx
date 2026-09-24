import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { RectAnchor } from '../editor/types'
import { Sheet } from './Sheet'
import { useAnchoredPosition } from './rectAnchor'
import { usePopoverDismiss } from './usePopoverDismiss'
import { useTouchInput } from './useMediaQuery'

interface PopoverProps {
  anchor: RectAnchor
  getAnchor?: () => RectAnchor
  align?: 'left' | 'right'
  onClose: () => void
  data?: Record<string, string>
  role?: string
  ariaLabel?: string
  width?: number
  className?: string
  sheetLabel: string
  sheetId: string
  children: ReactNode
}

export function Popover({
  anchor,
  getAnchor,
  align,
  onClose,
  data,
  role,
  ariaLabel,
  width,
  className = '',
  sheetLabel,
  sheetId,
  children
}: PopoverProps) {
  const asSheet = useTouchInput()
  const { ref, style } = useAnchoredPosition(anchor, { align, getAnchor })
  usePopoverDismiss(ref, onClose, !asSheet)

  if (asSheet) {
    return (
      <Sheet label={sheetLabel} id={sheetId} onClose={onClose}>
        {children}
      </Sheet>
    )
  }

  return createPortal(
    <div
      ref={ref}
      {...data}
      role={role}
      aria-label={ariaLabel}
      style={width ? { ...style, width } : style}
      className={`fixed z-50 rounded-lg border border-border bg-surface p-1 shadow-pop ${className}`}
    >
      {children}
    </div>,
    document.body
  )
}
