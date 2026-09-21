import type { PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '../i18n'
import { Icon } from '../ui/Icon'

interface BlockHandleProps {
  visible: boolean
  active?: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

export function BlockHandle({ visible, active = false, onPointerDown }: BlockHandleProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-block-handle
      aria-label={t('blocks.handle.label')}
      onPointerDown={onPointerDown}
      className={`absolute top-1 -left-7 flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded-md transition select-none hover:bg-hover hover:text-ink active:cursor-grabbing coarse:-left-8 coarse:h-8 coarse:w-8 ${
        active ? 'text-ink' : 'text-muted'
      } ${visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 coarse:opacity-100'}`}
    >
      <Icon name="grip" size={17} />
    </button>
  )
}
