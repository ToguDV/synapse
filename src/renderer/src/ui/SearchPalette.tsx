import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { SearchResult } from '../../../shared/types'
import { getBlockDefinition } from '../editor/registry'
import { useTranslation } from '../i18n'
import { buildSnippet } from './searchResults'

const DEBOUNCE_MS = 120

interface SearchPaletteProps {
  onNavigate: (result: SearchResult) => void
  onClose: () => void
}

function resultLabel(result: SearchResult, untitled: string): string {
  if (result.kind === 'page') return result.title || untitled
  return result.pageTitle || untitled
}

export function SearchPalette({ onNavigate, onClose }: SearchPaletteProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const requestRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)
  const term = query.trim()

  useEffect(() => {
    if (term === '') {
      requestRef.current += 1
      setResults([])
      setActiveIndex(0)
      setSearching(false)
      return
    }
    setSearching(true)
    const nonce = ++requestRef.current
    const timer = setTimeout(() => {
      window.api.search
        .query(term)
        .then((found) => {
          if (nonce !== requestRef.current) return
          setResults(found)
          setActiveIndex(0)
          setSearching(false)
        })
        .catch(() => {
          if (nonce !== requestRef.current) return
          setResults([])
          setSearching(false)
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, results])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      setActiveIndex((current) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1
        return (current + delta + results.length) % results.length
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const active = results[activeIndex]
      if (active) onNavigate(active)
    }
  }

  const active = results[activeIndex] ?? null

  return (
    <div
      data-search-palette
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[60] flex justify-center bg-black/50 pt-24"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.ariaLabel')}
        onKeyDown={handleKeyDown}
        className="h-fit w-[36rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
      >
        <input
          data-search-input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search.placeholder')}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-faint"
        />
        <ul ref={listRef} data-search-results className="max-h-80 overflow-y-auto py-1">
          {term !== '' && !searching && results.length === 0 && (
            <li data-search-empty className="px-4 py-6 text-center text-sm text-faint">
              {t('search.empty', { term })}
            </li>
          )}
          {results.map((result, index) => {
            const isFirstBlock =
              result.kind === 'block' && (index === 0 || results[index - 1].kind === 'page')
            const isFirstPage = result.kind === 'page' && index === 0
            const snippet =
              result.kind === 'block' ? buildSnippet(result.text, term) : null
            return (
              <li key={`${result.kind}-${result.kind === 'page' ? result.pageId : result.blockId}`}>
                {isFirstPage && (
                  <p data-search-group="pages" className="px-4 pb-1 pt-2 text-xs text-faint">
                    {t('search.pagesGroup')}
                  </p>
                )}
                {isFirstBlock && (
                  <p data-search-group="blocks" className="px-4 pb-1 pt-2 text-xs text-faint">
                    {t('search.blocksGroup')}
                  </p>
                )}
                <button
                  type="button"
                  data-search-result
                  data-kind={result.kind}
                  data-page-id={result.pageId}
                  data-block-id={result.kind === 'block' ? result.blockId : undefined}
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onNavigate(result)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition ${
                    index === activeIndex
                      ? 'bg-hover text-ink'
                      : 'text-ink-soft hover:bg-hover/60'
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base">
                    {result.kind === 'page'
                      ? result.icon ?? '📄'
                      : getBlockDefinition(result.blockType).icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {resultLabel(result, t('common.untitled'))}
                    </span>
                    {snippet && (
                      <span className="block truncate text-xs text-muted">
                        {snippet.ellipsisStart && '…'}
                        {snippet.before}
                        <mark className="rounded-sm bg-accent-soft text-ink">
                          {snippet.match}
                        </mark>
                        {snippet.after}
                        {snippet.ellipsisEnd && '…'}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-faint">
                    {result.kind === 'page' ? t('search.pageKind') : t('search.blockKind')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {active && (
          <p className="border-t border-border px-4 py-2 text-xs text-faint">
            {t('search.help')}
          </p>
        )}
      </div>
    </div>
  )
}
