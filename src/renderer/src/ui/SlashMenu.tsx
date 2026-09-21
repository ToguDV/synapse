import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BlockType } from '../../../shared/types'
import { filterSlashCommands, buildSlashCommands } from '../editor/commands'
import type { RectAnchor } from '../editor/types'
import { useTranslation } from '../i18n'
import { useAnchoredPosition } from './rectAnchor'

interface SlashMenuProps {
  anchor: RectAnchor
  getAnchor?: () => RectAnchor
  onSelect: (type: BlockType) => void
  onClose: (query: string) => void
}

export function SlashMenu({ anchor, getAnchor, onSelect, onClose }: SlashMenuProps) {
  const { t, locale } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const { ref: listRef, style } = useAnchoredPosition(anchor, { getAnchor })
  const queryRef = useRef(query)
  const activeRef = useRef(activeIndex)
  const commands = useMemo(() => filterSlashCommands(query, buildSlashCommands()), [query, locale])

  useEffect(() => {
    queryRef.current = query
    activeRef.current = activeIndex
  })

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose(queryRef.current)
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        if (commands.length === 0) return
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((index) => (index + delta + commands.length) % commands.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        const command = commands[activeRef.current]
        if (command) onSelect(command.type)
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        setQuery((value) => value.slice(0, -1))
        return
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        event.stopPropagation()
        setQuery((value) => value + event.key)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [commands, onSelect, onClose])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (listRef.current && target instanceof Node && listRef.current.contains(target)) return
      onClose(queryRef.current)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-slash-index="${activeIndex}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return createPortal(
    <div
      ref={listRef}
      data-slash-menu
      style={style}
      className="fixed z-50 w-72 overflow-y-auto rounded-lg border border-border-strong bg-surface py-1 shadow-2xl"
    >
      {commands.length === 0 ? (
        <p className="px-3 py-2 text-sm text-faint">{t('common.noResults')}</p>
      ) : (
        commands.map((command, index) => (
          <button
            key={command.type}
            type="button"
            data-slash-item={command.type}
            data-slash-index={index}
            data-active={index === activeIndex}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command.type)}
            className={`flex w-full items-center gap-3 px-2 py-1.5 text-left transition ${
              index === activeIndex ? 'bg-hover' : 'hover:bg-hover/60'
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border-strong bg-panel text-xs text-ink-soft">
              {command.icon}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-ink">{command.label}</span>
              <span className="truncate text-xs text-faint">{command.description}</span>
            </span>
          </button>
        ))
      )}
    </div>,
    document.body
  )
}
