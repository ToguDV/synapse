import { create } from 'zustand'
import type { Page } from '../../../shared/types'
import { useEditorStore } from '../editor/editorStore'
import { collectDescendantIds, nextPageAfterDelete, pageAncestors } from './pageTree'

interface PagesState {
  pages: Page[]
  activePageId: string | null
  ready: boolean
  expandedIds: string[]
  initialize: () => Promise<void>
  selectPage: (id: string) => void
  createPage: (parentId?: string | null) => Promise<void>
  deletePage: (id: string) => Promise<void>
  renamePage: (id: string, title: string) => void
  setPageIcon: (id: string, icon: string | null) => void
  toggleExpanded: (id: string) => void
}

const AUTOSAVE_DELAY_MS = 500
const DEFAULT_TITLE = 'Página sin título'

let initPromise: Promise<void> | null = null
const renameTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearRenameTimer(id: string): void {
  const timer = renameTimers.get(id)
  if (timer === undefined) return
  clearTimeout(timer)
  renameTimers.delete(id)
}

function parentsWithChildren(pages: Page[]): string[] {
  const parents = new Set<string>()
  for (const page of pages) {
    if (page.parentId) parents.add(page.parentId)
  }
  return [...parents]
}

export const usePagesStore = create<PagesState>((set, get) => ({
  pages: [],
  activePageId: null,
  ready: false,
  expandedIds: [],

  initialize: () => {
    initPromise ??= (async () => {
      const pages = await window.api.pages.list()
      if (pages.length === 0) {
        const page = await window.api.pages.create({ title: DEFAULT_TITLE })
        set({ pages: [page], activePageId: page.id, expandedIds: [], ready: true })
        return
      }
      set({
        pages,
        activePageId: pages[0].id,
        expandedIds: parentsWithChildren(pages),
        ready: true
      })
    })()
    return initPromise
  },

  selectPage: (id) => {
    const { pages, expandedIds } = get()
    const ancestors = pageAncestors(pages, id).map((page) => page.id)
    const merged = new Set([...expandedIds, ...ancestors])
    set({ activePageId: id, expandedIds: [...merged] })
  },

  createPage: async (parentId = null) => {
    const page = await window.api.pages.create({ title: DEFAULT_TITLE, parentId })
    set((state) => ({
      pages: [...state.pages, page],
      activePageId: page.id,
      expandedIds:
        parentId && !state.expandedIds.includes(parentId)
          ? [...state.expandedIds, parentId]
          : state.expandedIds
    }))
  },

  deletePage: async (id) => {
    const { pages, activePageId } = get()
    const doomed = new Set([id, ...collectDescendantIds(pages, id)])
    const editor = useEditorStore.getState()
    const editorIsDoomed = editor.pageId !== null && doomed.has(editor.pageId)
    if (editorIsDoomed) await editor.flush()
    for (const doomedId of doomed) clearRenameTimer(doomedId)
    await window.api.pages.remove(id)
    if (editorIsDoomed) useEditorStore.getState().reset()
    const remaining = pages.filter((page) => !doomed.has(page.id))
    set({
      pages: remaining,
      expandedIds: get().expandedIds.filter((candidate) => !doomed.has(candidate))
    })
    if (remaining.length === 0) {
      set({ activePageId: null })
      await get().createPage()
      return
    }
    if (activePageId !== null && doomed.has(activePageId)) {
      set({ activePageId: nextPageAfterDelete(pages, id) ?? remaining[0].id })
    }
  },

  renamePage: (id, title) => {
    set((state) => ({
      pages: state.pages.map((page) => (page.id === id ? { ...page, title } : page))
    }))
    clearRenameTimer(id)
    renameTimers.set(
      id,
      setTimeout(() => {
        renameTimers.delete(id)
        void window.api.pages.rename(id, title).catch(() => undefined)
      }, AUTOSAVE_DELAY_MS)
    )
  },

  setPageIcon: (id, icon) => {
    set((state) => ({
      pages: state.pages.map((page) => (page.id === id ? { ...page, icon } : page))
    }))
    void window.api.pages.setIcon(id, icon).catch(() => undefined)
  },

  toggleExpanded: (id) =>
    set((state) => ({
      expandedIds: state.expandedIds.includes(id)
        ? state.expandedIds.filter((candidate) => candidate !== id)
        : [...state.expandedIds, id]
    }))
}))
