import type { PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '../i18n'
import { Icon } from '../ui/Icon'

interface BlockHandleProps {
  visible: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

export function BlockHandle({ visible, onPointerDown }: BlockHandleProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-block-handle
      aria-label={t('blocks.handle.label')}
      onPointerDown={onPointerDown}
      className={`absolute top-1 -left-7 flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-faint transition hover:bg-hover hover:text-ink active:cursor-grabbing ${
        visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <Icon name="grip" size={16} />
    </button>
  )
}
