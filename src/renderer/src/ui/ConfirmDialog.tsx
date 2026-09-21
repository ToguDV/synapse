import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from '../i18n'

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  return (
    <div
      data-confirm-dialog
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--backdrop)] p-4 backdrop-blur-[4px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-modal"
      >
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-xs text-faint">{message}</p>
        <div className="mt-[18px] flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-confirm-cancel
            onClick={onCancel}
            className="flex h-10 items-center rounded-md px-3 text-xs font-medium text-muted transition hover:bg-hover hover:text-ink sm:h-7 sm:px-2.5"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-confirm-accept
            onClick={onConfirm}
            className="flex h-10 items-center rounded-md border border-error/40 px-3 text-xs font-medium text-error transition hover:bg-error/12 sm:h-7 sm:px-2.5"
          >
            {confirmLabel ?? t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
