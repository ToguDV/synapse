import { useEffect } from 'react'
import { usePagesStore } from './store/pagesStore'
import { Sidebar } from './ui/Sidebar'
import { BlockList } from './blocks/BlockList'

function App() {
  const ready = usePagesStore((state) => state.ready)
  const initialize = usePagesStore((state) => state.initialize)
  const pages = usePagesStore((state) => state.pages)
  const activePageId = usePagesStore((state) => state.activePageId)
  const renamePage = usePagesStore((state) => state.renamePage)
  const activePage = pages.find((page) => page.id === activePageId) ?? null

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
            <input
              value={activePage.title}
              onChange={(event) => renamePage(activePage.id, event.target.value)}
              placeholder="Sin título"
              className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-neutral-700"
            />
            <BlockList pageId={activePage.id} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
