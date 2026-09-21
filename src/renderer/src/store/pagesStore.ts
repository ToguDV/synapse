import { create } from 'zustand'
import type { Page } from '../../../shared/types'
import { useEditorStore } from '../editor/editorStore'
import { t } from '../i18n'
import {
  collectDescendantIds,
  movePage as movePageInTree,
  nextPageAfterDelete,
  pageAncestors
} from './pageTree'

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
  movePage: (id: string, parentId: string | null, position: number) => Promise<void>
  toggleExpanded: (id: string) => void
}

const AUTOSAVE_DELAY_MS = 500

let initPromise: Promise<void> | null = null
const renameTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearRenameTimer(id: string): void {
  const timer = renameTimers.get(id)
  if (timer === undefined) return
  clearTimeout(timer)
  renameTimers.delete(id)
}

function fireAndForget(promise: Promise<unknown>): void {
  void promise.catch(() => undefined)
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
        const page = await window.api.pages.create({ title: t('common.untitledPage') })
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
    let page: Page
    try {
      page = await window.api.pages.create({ title: t('common.untitledPage'), parentId })
    } catch (error) {
      console.error('Failed to create page', error)
      return
    }
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
    const { pages } = get()
    const doomed = new Set([id, ...collectDescendantIds(pages, id)])
    const editor = useEditorStore.getState()
    const editorIsDoomed = editor.pageId !== null && doomed.has(editor.pageId)
    const restoreLoads = [...doomed].map((doomedId) => editor.cancelLoad(doomedId))
    if (editorIsDoomed) await editor.flush()
    try {
      await window.api.pages.remove(id)
    } catch (error) {
      for (const restoreLoad of restoreLoads) restoreLoad()
      console.error('Failed to delete page', error)
      const activeId = get().activePageId
      const editorNow = useEditorStore.getState()
      if (activeId !== null && editorNow.pageId !== activeId) {
        fireAndForget(editorNow.loadPage(activeId))
      }
      return
    }
    for (const doomedId of doomed) clearRenameTimer(doomedId)
    if (editorIsDoomed) {
      const editorNow = useEditorStore.getState()
      if (editorNow.pageId === null || doomed.has(editorNow.pageId)) editorNow.reset()
    }
    const current = get().pages
    const remaining = current.filter((page) => !doomed.has(page.id))
    set({
      pages: remaining,
      expandedIds: get().expandedIds.filter((candidate) => !doomed.has(candidate))
    })
    if (remaining.length === 0) {
      set({ activePageId: null })
      await get().createPage()
      return
    }
    const currentActiveId = get().activePageId
    if (currentActiveId !== null && doomed.has(currentActiveId)) {
      set({ activePageId: nextPageAfterDelete(current, id) ?? remaining[0].id })
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
        fireAndForget(window.api.pages.rename(id, title))
      }, AUTOSAVE_DELAY_MS)
    )
  },

  setPageIcon: (id, icon) => {
    set((state) => ({
      pages: state.pages.map((page) => (page.id === id ? { ...page, icon } : page))
    }))
    fireAndForget(window.api.pages.setIcon(id, icon))
  },

  movePage: async (id, parentId, position) => {
    const { pages, expandedIds } = get()
    const next = movePageInTree(pages, id, parentId, position)
    if (next === pages) return
    set({
      pages: next,
      expandedIds:
        parentId && !expandedIds.includes(parentId) ? [...expandedIds, parentId] : expandedIds
    })
    try {
      await window.api.pages.move(id, { parentId, position })
    } catch (error) {
      console.error('Failed to move page', error)
      if (get().pages === next) set({ pages })
    }
  },

  toggleExpanded: (id) =>
    set((state) => ({
      expandedIds: state.expandedIds.includes(id)
        ? state.expandedIds.filter((candidate) => candidate !== id)
        : [...state.expandedIds, id]
    }))
}))
