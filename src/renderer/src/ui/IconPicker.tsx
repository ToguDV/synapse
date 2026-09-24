import type { RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { PAGE_EMOJIS } from './emojis'
import { Icon } from './Icon'
import { Popover } from './Popover'
import { useTouchInput } from './useMediaQuery'

interface IconPickerProps {
  anchor: RectAnchor
  current: string | null
  getAnchor?: () => RectAnchor
  onSelect: (icon: string | null) => void
  onClose: () => void
}

const PICKER_WIDTH = 296

export function IconPicker({ anchor, current, getAnchor, onSelect, onClose }: IconPickerProps) {
  const { t } = useTranslation()
  const asSheet = useTouchInput()

  const items = (
    <>
      {current && (
        <button
          type="button"
          data-icon-remove
          onClick={() => onSelect(null)}
          className={`flex w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted transition hover:bg-hover hover:text-ink ${
            asSheet ? 'min-h-11 py-2' : 'py-1.5'
          }`}
        >
          <Icon name="x" size={15} /> {t('iconPicker.remove')}
        </button>
      )}
      <div className="grid grid-cols-8 gap-0.5 p-1">
        {PAGE_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            data-icon-option={emoji}
            title={emoji}
            onClick={() => onSelect(emoji)}
            className={`flex items-center justify-center rounded-md transition hover:bg-hover ${
              asSheet ? 'h-11 text-xl' : 'h-8 text-lg'
            } ${emoji === current ? 'bg-selected' : ''}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <Popover
      anchor={anchor}
      getAnchor={getAnchor}
      onClose={onClose}
      data={{ 'data-icon-picker': 'true' }}
      width={PICKER_WIDTH}
      className="z-[70] max-h-[70vh] overflow-y-auto"
      sheetLabel={t('app.changeIcon')}
      sheetId="icon-picker"
    >
      {items}
    </Popover>
  )
}
