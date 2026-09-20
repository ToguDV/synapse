import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RectAnchor } from './editor/types'
import { usePagesStore } from './store/pagesStore'
import { Sidebar } from './ui/Sidebar'
import { BlockList } from './blocks/BlockList'
import { Breadcrumbs } from './ui/Breadcrumbs'
import { IconPicker } from './ui/IconPicker'
import { rectAnchor, rectAnchorIfConnected } from './ui/rectAnchor'
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
  const ready = usePagesStore((state) => state.ready)
  const initialize = usePagesStore((state) => state.initialize)
  const pages = usePagesStore((state) => state.pages)
  const activePageId = usePagesStore((state) => state.activePageId)
  const renamePage = usePagesStore((state) => state.renamePage)
  const setPageIcon = usePagesStore((state) => state.setPageIcon)
  const activePage = pages.find((page) => page.id === activePageId) ?? null
  const iconButtonRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const [iconAnchor, setIconAnchor] = useState<RectAnchor | null>(null)
  const [titleSize, setTitleSize] = useState(TITLE_FONT_MAX)
  const title = activePage?.title ?? ''

  useEffect(() => {
    void initialize()
  }, [initialize])

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
    <div className="flex h-screen bg-neutral-900 text-neutral-100">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto">
        {!ready || !activePage ? (
          <p className="mt-24 self-center text-sm text-neutral-500">Cargando…</p>
        ) : (
          <div className="w-full max-w-2xl self-center px-8 py-16">
            <Breadcrumbs pageId={activePage.id} />
            <div className="group flex items-start gap-2">
              <button
                ref={iconButtonRef}
                type="button"
                data-icon-button
                title={activePage.icon ? 'Cambiar icono' : 'Añadir icono'}
                onClick={(event) => setIconAnchor(rectAnchor(event.currentTarget))}
                style={{
                  marginTop: titleIconOffset(titleSize, iconButtonRef.current?.offsetHeight ?? 48)
                }}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-3xl transition hover:bg-neutral-800 ${
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
                placeholder="Sin título"
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
                style={{ fontSize: `${titleSize}px`, lineHeight: `${titleLineHeight(titleSize)}px` }}
                className="w-full resize-none overflow-hidden break-words bg-transparent font-bold tracking-tight outline-none placeholder:text-neutral-700"
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
        )}
      </main>
    </div>
  )
}

export default App
