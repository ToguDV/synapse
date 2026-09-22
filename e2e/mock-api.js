// Mock en memoria de window.api para los E2E con Playwright (sin preload de Electron).
// Persiste en localStorage para sobrevivir a page.reload(), ya que addInitScript
// se re-ejecuta en cada navegación.
//
// El contrato `Api` se implementa aquí como script clásico (addInitScript no
// resuelve módulos), así que la semántica de dominio vive REPLICADA abajo
// (comparePageOrder / collectDescendantIds / likeFold): es una copia fiel de
// src/shared/domain.ts y del comportamiento SQLite de los repositorios
// (substrings con LIKE, plegado ASCII de mayúsculas). Cualquier cambio de
// semántica en la app debe reflejarse aquí: tests/mockFidelity.test.ts pina
// mock ↔ repositorio para detectar divergencias en `npm test`.
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
          blocks: [],
          settings: {}
        }

  const pages = seed.pages
  const blocks = seed.blocks
  const settings = seed.settings ?? {}
  const calls = []
  window.__calls = calls
  window.__mockState = () => JSON.parse(JSON.stringify({ pages, blocks, settings, calls }))
  window.__mockReset = () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pages, blocks, settings }))
    } catch {
      /* ignore */
    }
  }

  // ---- Réplica de src/shared/domain.ts (pinned por tests/mockFidelity.test.ts) ----
  const comparePageOrder = (a, b) =>
    a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id)

  const collectDescendantIds = (pages, id) => {
    const childrenOf = new Map()
    for (const page of pages) {
      if (!page.parentId) continue
      const list = childrenOf.get(page.parentId)
      if (list) list.push(page.id)
      else childrenOf.set(page.parentId, [page.id])
    }
    const result = []
    const seen = new Set([id])
    const queue = [...(childrenOf.get(id) ?? [])]
    while (queue.length > 0) {
      const next = queue.shift()
      if (seen.has(next)) continue
      seen.add(next)
      result.push(next)
      queue.push(...(childrenOf.get(next) ?? []))
    }
    return result
  }

  // Plegado solo-ASCII de mayúsculas, igual que LIKE en SQLite (los acentos
  // NO se pliegan: 'Canción' no encuentra 'CANCIÓN').
  const likeFold = (value) => String(value).replace(/[A-Z]/g, (c) => c.toLowerCase())
  // ---- Fin de la réplica ----

  // Id sin colisiones aunque se eliminen filas (los índices descendentes).
  const nextId = (list, prefix) => {
    let max = 0
    for (const item of list) {
      const raw = String(item.id)
      const suffix = parseInt(raw.slice(prefix.length), 10)
      if (raw.startsWith(prefix) && Number.isFinite(suffix) && suffix > max) max = suffix
    }
    return prefix + (max + 1)
  }

  const pageOrThrow = (id) => {
    const page = pages.find((x) => x.id === id)
    if (!page) throw new Error(`Page not found: ${id}`)
    return page
  }
  const blockOrThrow = (id) => {
    const block = blocks.find((x) => x.id === id)
    if (!block) throw new Error(`Block not found: ${id}`)
    return block
  }

  const blockText = (content) => {
    try {
      const parsed = JSON.parse(content)
      return parsed && typeof parsed.text === 'string' ? parsed.text : ''
    } catch {
      return ''
    }
  }

  window.api = {
    versions: { electron: 'test', node: 'test' },
    pages: {
      list: async () =>
        [...pages]
          .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
          .map((p) => ({ ...p })),
      get: async (id) => pages.find((p) => p.id === id) ?? null,
      create: async (input = {}) => {
        const parentId = input.parentId ?? null
        const p = {
          id: nextId(pages, 'p'),
          title: input.title ?? '',
          parentId,
          icon: null,
          position: pages.filter((x) => x.parentId === parentId).length,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        pages.push(p)
        calls.push(['page-create', p.id, parentId])
        persist()
        return { ...p }
      },
      rename: async (id, title) => {
        const p = pageOrThrow(id)
        p.title = title
        calls.push(['page-rename', id, title])
        persist()
        return { ...p }
      },
      setIcon: async (id, icon) => {
        const p = pageOrThrow(id)
        p.icon = icon
        calls.push(['page-set-icon', id, icon])
        persist()
        return { ...p }
      },
      move: async (id, input) => {
        const p = pageOrThrow(id)
        const parentId = input.parentId ?? null
        if (parentId !== null && !pages.some((x) => x.id === parentId)) {
          throw new Error(`Page not found: ${parentId}`)
        }
        if (
          parentId !== null &&
          (parentId === id || collectDescendantIds(pages, id).includes(parentId))
        ) {
          throw new Error(`Cannot move page ${id} into its own subtree`)
        }
        const previousParent = p.parentId
        p.parentId = parentId
        const siblings = pages
          .filter((x) => x.parentId === parentId && x.id !== id)
          .sort(comparePageOrder)
        const index = Math.max(0, Math.min(input.position, siblings.length))
        siblings.splice(index, 0, p)
        siblings.forEach((x, i) => {
          x.position = i
        })
        if (previousParent !== p.parentId) {
          pages
            .filter((x) => x.parentId === previousParent)
            .sort(comparePageOrder)
            .forEach((x, i) => {
              x.position = i
            })
        }
        calls.push(['page-move', id, parentId, index])
        persist()
        return { ...p }
      },
      remove: async (id) => {
        // El repositorio delega el borrado en FK ON DELETE CASCADE: para un id
        // inexistente es un no-op silencioso (no lanza).
        const doomed = new Set([id, ...collectDescendantIds(pages, id)])
        for (let i = pages.length - 1; i >= 0; i--) {
          if (doomed.has(pages[i].id)) pages.splice(i, 1)
        }
        for (let i = blocks.length - 1; i >= 0; i--) {
          if (doomed.has(blocks[i].pageId)) blocks.splice(i, 1)
        }
        calls.push(['page-remove', id, [...doomed]])
        persist()
      }
    },
    blocks: {
      list: async (pageId) => {
        calls.push(['list', pageId])
        return blocks
          .filter((b) => b.pageId === pageId)
          .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
          .map((b) => ({ ...b }))
      },
      create: async (input) => {
        calls.push(['create', input])
        const b = {
          id: input.id ?? nextId(blocks, 'b'),
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
        const b = blockOrThrow(id)
        if (patch.type !== undefined) b.type = patch.type
        if (patch.content !== undefined) b.content = patch.content
        if (patch.indent !== undefined) b.indent = patch.indent
        persist()
        return { ...b }
      },
      reorder: async (pageId, ids) => {
        calls.push(['reorder', pageId, ids])
        ids.forEach((id, i) => {
          const b = blocks.find((x) => x.id === id && x.pageId === pageId)
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
    },
    search: {
      query: async (term, limit = 20) => {
        calls.push(['search', term, limit])
        const needle = likeFold(String(term).trim())
        if (needle === '') return []
        const pageHits = pages
          .filter((p) => likeFold(p.title).includes(needle))
          .sort(
            (a, b) => b.updatedAt - a.updatedAt || a.position - b.position || a.createdAt - b.createdAt
          )
          .slice(0, limit)
          .map((p) => ({
            kind: 'page',
            pageId: p.id,
            title: p.title,
            icon: p.icon ?? null,
            updatedAt: p.updatedAt
          }))
        const blockHits = blocks
          .map((b) => ({ b, p: pages.find((x) => x.id === b.pageId) }))
          .filter(({ b, p }) => p && likeFold(blockText(b.content)).includes(needle))
          .sort((x, y) => y.b.updatedAt - x.b.updatedAt || x.b.position - y.b.position)
          .slice(0, limit)
          .map(({ b, p }) => ({
            kind: 'block',
            blockId: b.id,
            pageId: p.id,
            pageTitle: p.title,
            pageIcon: p.icon ?? null,
            blockType: b.type ?? 'paragraph',
            text: blockText(b.content),
            updatedAt: b.updatedAt
          }))
        return [...pageHits, ...blockHits]
      }
    },
    settings: {
      get: async (key) => {
        calls.push(['settings-get', key])
        return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : null
      },
      set: async (key, value) => {
        calls.push(['settings-set', key, value])
        settings[key] = value
        persist()
      }
    }
  }
})()
