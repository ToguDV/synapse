import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { RectAnchor } from '../editor/types'
import { PAGE_EMOJIS } from './emojis'

interface IconPickerProps {
  anchor: RectAnchor
  current: string | null
  onSelect: (icon: string | null) => void
  onClose: () => void
}

const PICKER_WIDTH = 296
const PICKER_HEIGHT = 244

export function IconPicker({ anchor, current, onSelect, onClose }: IconPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

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

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - PICKER_WIDTH - 8))
  const openUp = anchor.bottom + PICKER_HEIGHT > window.innerHeight
  const top = openUp ? Math.max(8, anchor.top - PICKER_HEIGHT - 6) : anchor.bottom + 6

  return createPortal(
    <div
      ref={ref}
      data-icon-picker
      style={{ left, top, width: PICKER_WIDTH }}
      className="fixed z-[70] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
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
