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
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-confirm-cancel
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted transition hover:bg-hover hover:text-ink"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-confirm-accept
            onClick={onConfirm}
            className="rounded-md border border-error/40 px-3 py-1.5 text-sm font-medium text-error transition hover:bg-error/10"
          >
            {confirmLabel ?? t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
