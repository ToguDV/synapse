import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BlockType } from '../../../shared/types'
import { filterSlashCommands } from '../editor/commands'
import type { RectAnchor } from '../editor/types'

interface SlashMenuProps {
  anchor: RectAnchor
  onSelect: (type: BlockType) => void
  onClose: (query: string) => void
}

const MENU_WIDTH = 288
const MENU_HEIGHT = 300

export function SlashMenu({ anchor, onSelect, onClose }: SlashMenuProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const queryRef = useRef(query)
  const activeRef = useRef(activeIndex)
  const commands = useMemo(() => filterSlashCommands(query), [query])

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

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - MENU_WIDTH - 8))
  const openUp = anchor.bottom + MENU_HEIGHT + 8 > window.innerHeight
  const top = openUp ? Math.max(8, anchor.top - MENU_HEIGHT - 6) : anchor.bottom + 6

  return createPortal(
    <div
      ref={listRef}
      data-slash-menu
      style={{ left, top }}
      className="fixed z-50 w-72 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-2xl"
    >
      {commands.length === 0 ? (
        <p className="px-3 py-2 text-sm text-neutral-500">Sin resultados</p>
      ) : (
        commands.map((command, index) => (
          <button
            key={command.type}
            type="button"
            data-slash-item={command.type}
            data-slash-index={index}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command.type)}
            className={`flex w-full items-center gap-3 px-2 py-1.5 text-left transition ${
              index === activeIndex ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-950 text-xs text-neutral-300">
              {command.icon}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-neutral-100">{command.label}</span>
              <span className="truncate text-xs text-neutral-500">{command.description}</span>
            </span>
          </button>
        ))
      )}
    </div>,
    document.body
  )
}
