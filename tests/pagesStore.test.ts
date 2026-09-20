import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Block, Page } from '../src/shared/types'

let counter = 0

function makePage(partial: Partial<Page> & { id: string }): Page {
  counter += 1
  return {
    title: partial.id,
    parentId: null,
    icon: null,
    position: 0,
    createdAt: counter,
    updatedAt: counter,
    ...partial
  }
}

function installApi(initial: Page[] = []) {
  const pages = [...initial]
  let seq = initial.length
  const api = {
    pages: {
      list: vi.fn(async () => pages.map((page) => ({ ...page }))),
      get: vi.fn(async (id: string) => pages.find((page) => page.id === id) ?? null),
      create: vi.fn(async (input: { title?: string; parentId?: string | null } = {}) => {
        seq += 1
        const parentId = input.parentId ?? null
        const page = makePage({
          id: `gen-${seq}`,
          title: input.title ?? '',
          parentId,
          position: pages.filter((candidate) => candidate.parentId === parentId).length
        })
        pages.push(page)
        return { ...page }
      }),
      rename: vi.fn(async (id: string, title: string) => {
        const page = pages.find((candidate) => candidate.id === id)
        if (!page) throw new Error(`Página no encontrada: ${id}`)
        page.title = title
        return { ...page }
      }),
      setIcon: vi.fn(async (id: string, icon: string | null) => {
        const page = pages.find((candidate) => candidate.id === id)
        if (!page) throw new Error(`Página no encontrada: ${id}`)
        page.icon = icon
        return { ...page }
      }),
      move: vi.fn(async (id: string, input: { parentId: string | null; position: number }) => {
        const page = pages.find((candidate) => candidate.id === id)!
        page.parentId = input.parentId
        page.position = input.position
        return { ...page }
      }),
      remove: vi.fn(async (id: string) => {
        const doomed = new Set([id])
        let added = true
        while (added) {
          added = false
          for (const page of pages) {
            if (page.parentId && doomed.has(page.parentId) && !doomed.has(page.id)) {
              doomed.add(page.id)
              added = true
            }
          }
        }
        for (let index = pages.length - 1; index >= 0; index--) {
          if (doomed.has(pages[index].id)) pages.splice(index, 1)
        }
      })
    },
    blocks: {
      list: vi.fn(async () => [] as Block[]),
      create: vi.fn(async (input: { id?: string; pageId: string }) => ({
        id: input.id ?? 'block-1',
        pageId: input.pageId,
        type: 'paragraph' as const,
        content: '{"text":""}',
        position: 0,
        indent: 0,
        createdAt: 1,
        updatedAt: 1
      })),
      update: vi.fn(async () => {
        throw new Error('no debería llamarse')
      }),
      reorder: vi.fn(async () => [] as Block[]),
      remove: vi.fn(async () => undefined)
    }
  }
  vi.stubGlobal('window', { api })
  return { api, pages }
}

async function loadStores() {
  const { usePagesStore } = await import('../src/renderer/src/store/pagesStore')
  const { useEditorStore } = await import('../src/renderer/src/editor/editorStore')
  return { usePagesStore, useEditorStore }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pagesStore', () => {
  it('initialize crea una página por defecto cuando no hay ninguna', async () => {
    const { api } = installApi()
    const { usePagesStore } = await loadStores()

    await usePagesStore.getState().initialize()

    expect(api.pages.create).toHaveBeenCalledWith({ title: 'Página sin título' })
    const state = usePagesStore.getState()
    expect(state.pages).toHaveLength(1)
    expect(state.activePageId).toBe(state.pages[0].id)
    expect(state.ready).toBe(true)
  })

  it('initialize selecciona la primera y expande los padres con hijas', async () => {
    installApi([
      makePage({ id: 'root', position: 0 }),
      makePage({ id: 'child', parentId: 'root', position: 0 })
    ])
    const { usePagesStore } = await loadStores()

    await usePagesStore.getState().initialize()

    const state = usePagesStore.getState()
    expect(state.activePageId).toBe('root')
    expect(state.expandedIds).toEqual(['root'])
  })

  it('createPage anida, selecciona y expande el padre', async () => {
    installApi([makePage({ id: 'root' })])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    await usePagesStore.getState().createPage('root')

    const state = usePagesStore.getState()
    expect(state.pages).toHaveLength(2)
    expect(state.pages[1].parentId).toBe('root')
    expect(state.activePageId).toBe(state.pages[1].id)
    expect(state.expandedIds).toContain('root')
  })

  it('selectPage expande los ancestros de la página', async () => {
    installApi([
      makePage({ id: 'root' }),
      makePage({ id: 'child', parentId: 'root' }),
      makePage({ id: 'grandchild', parentId: 'child' })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()
    usePagesStore.setState({ expandedIds: [] })

    usePagesStore.getState().selectPage('grandchild')

    expect(usePagesStore.getState().expandedIds.sort()).toEqual(['child', 'root'])
  })

  it('toggleExpanded alterna la página', async () => {
    installApi([makePage({ id: 'root' })])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    usePagesStore.getState().toggleExpanded('root')
    expect(usePagesStore.getState().expandedIds).toEqual(['root'])
    usePagesStore.getState().toggleExpanded('root')
    expect(usePagesStore.getState().expandedIds).toEqual([])
  })

  it('setPageIcon actualiza en optimista y confirma con el IPC', async () => {
    const { api } = installApi([makePage({ id: 'root' })])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    usePagesStore.getState().setPageIcon('root', '🚀')

    expect(usePagesStore.getState().pages[0].icon).toBe('🚀')
    await vi.waitFor(() => expect(api.pages.setIcon).toHaveBeenCalledWith('root', '🚀'))
  })

  // Regresión F5: la respuesta del IPC de setIcon no debe pisar un rename
  // optimista pendiente (el main devuelve el title viejo hasta el debounce).
  it('setPageIcon no pisa un rename optimista pendiente', async () => {
    vi.useFakeTimers()
    const { api } = installApi([makePage({ id: 'root' })])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    usePagesStore.getState().renamePage('root', 'Nueva')
    usePagesStore.getState().setPageIcon('root', '🚀')
    await vi.advanceTimersByTimeAsync(500)

    expect(api.pages.setIcon).toHaveBeenCalledWith('root', '🚀')
    expect(api.pages.rename).toHaveBeenCalledWith('root', 'Nueva')
    const page = usePagesStore.getState().pages[0]
    expect(page.title).toBe('Nueva')
    expect(page.icon).toBe('🚀')
  })

  // Regresión F5: el set de deletePage debe partir del estado actual y no del
  // snapshot previo a los await, para no descartar cambios concurrentes.
  it('deletePage conserva los cambios ocurridos durante el IPC de borrado', async () => {
    const { api } = installApi([
      makePage({ id: 'a', position: 0 }),
      makePage({ id: 'b', position: 1 })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    let release: () => void = () => {}
    api.pages.remove.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )

    const pending = usePagesStore.getState().deletePage('b')
    usePagesStore.getState().setPageIcon('a', '🚀')
    release()
    await pending

    const pages = usePagesStore.getState().pages
    expect(pages.map((page) => page.id)).toEqual(['a'])
    expect(pages[0].icon).toBe('🚀')
  })

  it('deletePage no toca el estado si el IPC de borrado falla', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { api } = installApi([
      makePage({ id: 'a', position: 0 }),
      makePage({ id: 'b', position: 1 })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()
    api.pages.remove.mockRejectedValueOnce(new Error('db caída'))

    await expect(usePagesStore.getState().deletePage('b')).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalled()
    expect(usePagesStore.getState().pages.map((page) => page.id)).toEqual(['a', 'b'])
    expect(usePagesStore.getState().activePageId).toBe('a')
  })

  // Regresión F5: si el usuario cambia de página durante el await del borrado,
  // el reset del editor no debe pisar la página que acaba de cargar.
  it('deletePage no resetea el editor si se cambió de página durante el borrado', async () => {
    const { api } = installApi([
      makePage({ id: 'a', position: 0 }),
      makePage({ id: 'b', position: 1 })
    ])
    const { usePagesStore, useEditorStore } = await loadStores()
    await usePagesStore.getState().initialize()
    await useEditorStore.getState().loadPage('a')

    let release: () => void = () => {}
    api.pages.remove.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )

    const pending = usePagesStore.getState().deletePage('a')
    usePagesStore.getState().selectPage('b')
    await useEditorStore.getState().loadPage('b')
    release()
    await pending

    expect(usePagesStore.getState().activePageId).toBe('b')
    expect(useEditorStore.getState().pageId).toBe('b')
    expect(useEditorStore.getState().blocks).toHaveLength(1)
  })

  it('renamePage actualiza en optimista y hace flush debounced', async () => {
    vi.useFakeTimers()
    const { api } = installApi([makePage({ id: 'root' })])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    usePagesStore.getState().renamePage('root', 'Nueva')
    expect(usePagesStore.getState().pages[0].title).toBe('Nueva')
    expect(api.pages.rename).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    expect(api.pages.rename).toHaveBeenCalledWith('root', 'Nueva')
  })

  it('deletePage de una hoja selecciona al padre y la quita del estado', async () => {
    const { api } = installApi([
      makePage({ id: 'root' }),
      makePage({ id: 'child', parentId: 'root' })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()
    usePagesStore.getState().selectPage('child')

    await usePagesStore.getState().deletePage('child')

    expect(api.pages.remove).toHaveBeenCalledWith('child')
    expect(usePagesStore.getState().pages.map((page) => page.id)).toEqual(['root'])
    expect(usePagesStore.getState().activePageId).toBe('root')
  })

  it('deletePage de un padre en cascada elige la página anterior visible', async () => {
    installApi([
      makePage({ id: 'root', position: 0 }),
      makePage({ id: 'first', position: 0 }),
      makePage({ id: 'child', parentId: 'first' }),
      makePage({ id: 'grandchild', parentId: 'child' }),
      makePage({ id: 'second', position: 1 })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()
    usePagesStore.getState().selectPage('grandchild')

    await usePagesStore.getState().deletePage('first')

    expect(usePagesStore.getState().pages.map((page) => page.id)).toEqual(['root', 'second'])
    expect(usePagesStore.getState().activePageId).toBe('root')
  })

  it('deletePage de la página activa resetea el editor', async () => {
    installApi([makePage({ id: 'only' })])
    const { usePagesStore, useEditorStore } = await loadStores()
    await usePagesStore.getState().initialize()
    await useEditorStore.getState().loadPage(usePagesStore.getState().activePageId!)

    await usePagesStore.getState().deletePage('only')

    expect(useEditorStore.getState().pageId).toBeNull()
    expect(useEditorStore.getState().blocks).toEqual([])
    expect(usePagesStore.getState().pages).toHaveLength(1)
    expect(usePagesStore.getState().activePageId).toBe(usePagesStore.getState().pages[0].id)
  })

  it('deletePage de una página no activa conserva la selección', async () => {
    installApi([
      makePage({ id: 'a', position: 0 }),
      makePage({ id: 'b', position: 1 })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    await usePagesStore.getState().deletePage('b')

    expect(usePagesStore.getState().pages.map((page) => page.id)).toEqual(['a'])
    expect(usePagesStore.getState().activePageId).toBe('a')
  })

  // Regresión F5: el debounce de renamePage debe persistir el rename de cada
  // página aunque se renombre otra (o se borre otra) antes de los 500 ms.
  it('persiste el rename de una página aunque se renombre otra antes del debounce', async () => {
    vi.useFakeTimers()
    const { api } = installApi([
      makePage({ id: 'a', position: 0 }),
      makePage({ id: 'b', position: 1 })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    usePagesStore.getState().renamePage('a', 'Página A')
    usePagesStore.getState().renamePage('b', 'Página B')
    await vi.advanceTimersByTimeAsync(500)

    expect(api.pages.rename).toHaveBeenCalledWith('a', 'Página A')
    expect(api.pages.rename).toHaveBeenCalledWith('b', 'Página B')
  })

  it('borrar otra página no cancela el rename pendiente', async () => {
    vi.useFakeTimers()
    const { api } = installApi([
      makePage({ id: 'a', position: 0 }),
      makePage({ id: 'b', position: 1 })
    ])
    const { usePagesStore } = await loadStores()
    await usePagesStore.getState().initialize()

    usePagesStore.getState().renamePage('a', 'Página A')
    await usePagesStore.getState().deletePage('b')
    await vi.advanceTimersByTimeAsync(500)

    expect(api.pages.rename).toHaveBeenCalledWith('a', 'Página A')
  })
})
