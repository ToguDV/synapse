import { usePagesStore } from '../store/pagesStore'

export function Sidebar() {
  const pages = usePagesStore((state) => state.pages)
  const activePageId = usePagesStore((state) => state.activePageId)
  const selectPage = usePagesStore((state) => state.selectPage)
  const createPage = usePagesStore((state) => state.createPage)

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold tracking-wide text-neutral-300">Synapse</span>
        <button
          type="button"
          onClick={() => void createPage()}
          title="Nueva página"
          className="rounded-md px-2 text-lg leading-6 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
        >
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => selectPage(page.id)}
            className={`mb-0.5 block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition ${
              page.id === activePageId
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
            }`}
          >
            {page.title || 'Sin título'}
          </button>
        ))}
      </nav>
    </aside>
  )
}
