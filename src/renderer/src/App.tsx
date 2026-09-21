import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SearchResult } from '../../shared/types'
import type { RectAnchor } from './editor/types'
import { useEditorStore } from './editor/editorStore'
import { useTranslation } from './i18n'
import { usePagesStore } from './store/pagesStore'
import { useThemeStore } from './store/themeStore'
import { Sidebar } from './ui/Sidebar'
import { BlockList } from './blocks/BlockList'
import { Breadcrumbs } from './ui/Breadcrumbs'
import { Icon } from './ui/Icon'
import { IconPicker } from './ui/IconPicker'
import { Kbd } from './ui/Kbd'
import { SearchPalette } from './ui/SearchPalette'
import { rectAnchor, rectAnchorIfConnected } from './ui/rectAnchor'
import { useHorizontalSwipe } from './ui/swipe'
import { useIsMobile } from './ui/useMediaQuery'
import { fitTitleFontSize, TITLE_FONT_MAX, titleIconOffset, titleLineHeight } from './ui/titleFit'

let measureCanvas: HTMLCanvasElement | null = null

function titleMeasurer(el: HTMLElement, text: string): (size: number) => number {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return () => 0
  const style = getComputedStyle(el)
  const currentSize = Number.parseFloat(style.fontSize)
  const spacingRatio = currentSize > 0 ? Number.parseFloat(style.letterSpacing) / currentSize : 0
  const spacing = Number.isFinite(spacingRatio) ? spacingRatio : 0
  return (size) => {
    ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`
    ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${spacing * size}px`
    return ctx.measureText(text || ' ').width
  }
}

function App() {
  const { t } = useTranslation()
  const ready = usePagesStore((state) => state.ready)
  const initialize = usePagesStore((state) => state.initialize)
  const initializeTheme = useThemeStore((state) => state.initialize)
  const pages = usePagesStore((state) => state.pages)
  const activePageId = usePagesStore((state) => state.activePageId)
  const selectPage = usePagesStore((state) => state.selectPage)
  const renamePage = usePagesStore((state) => state.renamePage)
  const setPageIcon = usePagesStore((state) => state.setPageIcon)
  const activePage = pages.find((page) => page.id === activePageId) ?? null
  const iconButtonRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const [iconAnchor, setIconAnchor] = useState<RectAnchor | null>(null)
  const [titleSize, setTitleSize] = useState(TITLE_FONT_MAX)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()
  const title = activePage?.title ?? ''
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  /* El drawer se cierra al navegar (elegir página, crear subpágina, borrar…). */
  useEffect(() => {
    setSidebarOpen(false)
  }, [activePageId])

  const edgeSwipe = useHorizontalSwipe((direction) => {
    if (direction === 'right') setSidebarOpen(true)
  })

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    void initializeTheme()
  }, [initializeTheme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const navigateToResult = useCallback(
    (result: SearchResult): void => {
      setSearchOpen(false)
      selectPage(result.pageId)
      if (result.kind === 'block') {
        useEditorStore.getState().focusBlock(result.pageId, result.blockId)
      }
    },
    [selectPage]
  )

  const syncTitle = useCallback(() => {
    const el = titleRef.current
    if (!el) return
    const next = fitTitleFontSize(el.clientWidth, titleMeasurer(el, el.value))
    setTitleSize((current) => (current === next ? current : next))
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    syncTitle()
  }, [syncTitle, title, titleSize, activePageId])

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      syncTitle()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [syncTitle, ready, activePageId])

  useEffect(() => {
    void document.fonts.ready.then(syncTitle)
  }, [syncTitle, ready, activePageId])

  return (
    <div className="flex h-dvh bg-canvas text-ink">
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        onOpenSearch={() => setSearchOpen(true)}
      />
      {isMobile && sidebarOpen && (
        <div
          data-sidebar-backdrop
          aria-hidden="true"
          onPointerDown={closeSidebar}
          className="fixed inset-0 z-30 bg-[var(--backdrop)]"
        />
      )}
      {isMobile && !sidebarOpen && (
        <div
          data-edge-swipe
          aria-hidden="true"
          {...edgeSwipe}
          className="fixed inset-y-0 left-0 z-20 w-4 touch-pan-y"
        />
      )}
      <main data-editor-scroll className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {!ready || !activePage ? (
          <p className="mt-24 self-center text-sm text-faint">{t('common.loading')}</p>
        ) : (
          <>
            <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-canvas py-2 pr-3 pl-2 sm:gap-2.5 sm:pl-4">
              <button
                type="button"
                data-sidebar-toggle
                aria-label={t('sidebar.openSidebar')}
                title={t('sidebar.openSidebar')}
                onClick={() => setSidebarOpen(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-hover hover:text-ink md:hidden"
              >
                <Icon name="menu" size={18} />
              </button>
              <Breadcrumbs pageId={activePage.id} />
              <button
                type="button"
                data-search-trigger-top
                aria-label={t('sidebar.search')}
                title={t('sidebar.searchTooltip')}
                onClick={() => setSearchOpen(true)}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted transition hover:bg-hover hover:text-ink"
              >
                <Icon name="search" size={15} />
                <span className="hidden sm:inline">{t('sidebar.search')}</span>
                <span className="ml-1 hidden md:inline-flex">
                  <Kbd>Ctrl K</Kbd>
                </span>
              </button>
            </div>
            <div className="mx-auto w-full max-w-[640px] pt-6 pr-4 pb-10 pl-9 sm:px-8 sm:pt-10 lg:px-14">
              <div className="group flex items-start gap-2">
                <button
                  ref={iconButtonRef}
                  type="button"
                  data-icon-button
                  title={activePage.icon ? t('app.changeIcon') : t('app.addIcon')}
                  onClick={(event) => setIconAnchor(rectAnchor(event.currentTarget))}
                  style={{
                    marginTop: titleIconOffset(titleSize, iconButtonRef.current?.offsetHeight ?? 40)
                  }}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl transition hover:bg-hover ${
                    activePage.icon ? '' : 'opacity-40 group-hover:opacity-100'
                  }`}
                >
                  {activePage.icon ?? '😀'}
                </button>
                <textarea
                  ref={titleRef}
                  data-page-title-input
                  rows={1}
                  value={activePage.title}
                  placeholder={t('common.untitled')}
                  onChange={(event) => {
                    const raw = event.target.value
                    const clean = raw.replace(/[\r\n]+/g, ' ')
                    renamePage(activePage.id, clean)
                    if (clean !== raw) {
                      const caret = raw
                        .slice(0, event.target.selectionStart)
                        .replace(/[\r\n]+/g, ' ').length
                      requestAnimationFrame(() => {
                        titleRef.current?.setSelectionRange(caret, caret)
                      })
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                    }
                  }}
                  style={{
                    fontSize: `${titleSize}px`,
                    lineHeight: `${titleLineHeight(titleSize)}px`
                  }}
                  className="w-full resize-none overflow-hidden break-words bg-transparent font-semibold tracking-[-0.03em] outline-none placeholder:text-faint"
                />
              </div>
              <BlockList pageId={activePage.id} />
              {iconAnchor && (
                <IconPicker
                  anchor={iconAnchor}
                  getAnchor={() => rectAnchorIfConnected(iconButtonRef.current, iconAnchor)}
                  current={activePage.icon}
                  onSelect={(icon) => {
                    setPageIcon(activePage.id, icon)
                    setIconAnchor(null)
                  }}
                  onClose={() => setIconAnchor(null)}
                />
              )}
            </div>
          </>
        )}
      </main>
      {searchOpen && (
        <SearchPalette onNavigate={navigateToResult} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  )
}

export default App
