// Mock en memoria de window.api para los E2E con Playwright (sin preload de Electron).
// Persiste en localStorage para sobrevivir a page.reload(), ya que addInitScript
// se re-ejecuta en cada navegación.
;(() => {
  const KEY = '__synapse_e2e_mock__'
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    stored = null
  }
  const seed =
    stored && Array.isArray(stored.pages) && stored.pages.length > 0
      ? stored
      : {
          pages: [
            {
              id: 'p1',
              title: 'Test',
              parentId: null,
              icon: null,
              position: 0,
              createdAt: 1,
              updatedAt: 1
            }
          ],
          blocks: []
        }

  const pages = seed.pages
  const blocks = seed.blocks
  const calls = []
  window.__calls = calls
  window.__mockState = () => JSON.parse(JSON.stringify({ pages, blocks, calls }))
  window.__mockReset = () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pages, blocks }))
    } catch {
      /* ignore */
    }
  }

  window.api = {
    versions: { electron: 'test', node: 'test' },
    pages: {
      list: async () => pages.map((p) => ({ ...p })),
      get: async (id) => pages.find((p) => p.id === id) ?? null,
      create: async (input = {}) => {
        const p = {
          id: 'p' + (pages.length + 1),
          title: input.title ?? '',
          parentId: input.parentId ?? null,
          icon: null,
          position: pages.length,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        pages.push(p)
        persist()
        return { ...p }
      },
      rename: async (id, title) => {
        const p = pages.find((x) => x.id === id)
        p.title = title
        persist()
        return { ...p }
      },
      setIcon: async (id, icon) => {
        const p = pages.find((x) => x.id === id)
        p.icon = icon
        persist()
        return { ...p }
      },
      move: async () => pages[0],
      remove: async () => {}
    },
    blocks: {
      list: async (pageId) => {
        calls.push(['list', pageId])
        return blocks
          .filter((b) => b.pageId === pageId)
          .sort((a, b) => a.position - b.position)
          .map((b) => ({ ...b }))
      },
      create: async (input) => {
        calls.push(['create', input])
        const b = {
          id: input.id ?? 'b' + blocks.length,
          pageId: input.pageId,
          type: input.type ?? 'paragraph',
          content: input.content ?? '{"text":""}',
          position: input.position ?? blocks.length,
          indent: input.indent ?? 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        blocks.push(b)
        persist()
        return { ...b }
      },
      update: async (id, patch) => {
        calls.push(['update', id, patch])
        const b = blocks.find((x) => x.id === id)
        Object.assign(b, patch)
        persist()
        return { ...b }
      },
      reorder: async (pageId, ids) => {
        calls.push(['reorder', pageId, ids])
        ids.forEach((id, i) => {
          const b = blocks.find((x) => x.id === id)
          if (b) b.position = i
        })
        persist()
        return blocks
          .filter((b) => b.pageId === pageId)
          .sort((a, b) => a.position - b.position)
          .map((b) => ({ ...b }))
      },
      remove: async (id) => {
        calls.push(['remove', id])
        const i = blocks.findIndex((x) => x.id === id)
        if (i >= 0) blocks.splice(i, 1)
        persist()
      }
    }
  }
})()
