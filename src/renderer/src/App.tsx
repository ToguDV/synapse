import { useEffect, useState } from 'react'
import { usePagesStore } from './store/pagesStore'
import { Sidebar } from './ui/Sidebar'
import { BlockList } from './blocks/BlockList'
import { Breadcrumbs } from './ui/Breadcrumbs'
import { IconPicker } from './ui/IconPicker'
import { rectAnchor } from './ui/rectAnchor'

function App() {
  const ready = usePagesStore((state) => state.ready)
  const initialize = usePagesStore((state) => state.initialize)
  const pages = usePagesStore((state) => state.pages)
  const activePageId = usePagesStore((state) => state.activePageId)
  const renamePage = usePagesStore((state) => state.renamePage)
  const setPageIcon = usePagesStore((state) => state.setPageIcon)
  const activePage = pages.find((page) => page.id === activePageId) ?? null
  const [iconAnchor, setIconAnchor] = useState<ReturnType<typeof rectAnchor> | null>(null)

  useEffect(() => {
    void initialize()
  }, [initialize])

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
                type="button"
                data-icon-button
                title={activePage.icon ? 'Cambiar icono' : 'Añadir icono'}
                onClick={(event) => setIconAnchor(rectAnchor(event.currentTarget))}
                className={`mt-1.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-3xl transition hover:bg-neutral-800 ${
                  activePage.icon ? '' : 'opacity-40 group-hover:opacity-100'
                }`}
              >
                {activePage.icon ?? '😀'}
              </button>
              <input
                value={activePage.title}
                onChange={(event) => renamePage(activePage.id, event.target.value)}
                placeholder="Sin título"
                className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-neutral-700"
              />
            </div>
            <BlockList pageId={activePage.id} />
            {iconAnchor && (
              <IconPicker
                anchor={iconAnchor}
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
