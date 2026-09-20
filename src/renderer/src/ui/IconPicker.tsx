import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { RectAnchor } from '../editor/types'
import { PAGE_EMOJIS } from './emojis'
import { useAnchoredPosition } from './rectAnchor'

interface IconPickerProps {
  anchor: RectAnchor
  current: string | null
  getAnchor?: () => RectAnchor
  onSelect: (icon: string | null) => void
  onClose: () => void
}

const PICKER_WIDTH = 296

export function IconPicker({ anchor, current, getAnchor, onSelect, onClose }: IconPickerProps) {
  const { ref, style } = useAnchoredPosition(anchor, { getAnchor })

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (ref.current && target instanceof Node && ref.current.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      data-icon-picker
      style={{ ...style, width: PICKER_WIDTH }}
      className="fixed z-[70] max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
    >
      {current && (
        <button
          type="button"
          data-icon-remove
          onClick={() => onSelect(null)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100"
        >
          <span className="text-neutral-500">✕</span> Quitar icono
        </button>
      )}
      <div className="grid grid-cols-8 gap-1 p-2">
        {PAGE_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            data-icon-option={emoji}
            title={emoji}
            onClick={() => onSelect(emoji)}
            className={`flex h-8 items-center justify-center rounded-md text-lg transition hover:bg-neutral-700 ${
              emoji === current ? 'bg-neutral-700' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
