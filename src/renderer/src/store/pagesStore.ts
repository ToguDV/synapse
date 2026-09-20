import { create } from 'zustand'
import type { Page } from '../../../shared/types'

interface PagesState {
  pages: Page[]
  activePageId: string | null
  ready: boolean
  initialize: () => Promise<void>
  selectPage: (id: string) => void
  createPage: () => Promise<void>
  renamePage: (id: string, title: string) => void
}

const AUTOSAVE_DELAY_MS = 500
const DEFAULT_TITLE = 'Página sin título'

let initPromise: Promise<void> | null = null
let renameTimer: ReturnType<typeof setTimeout> | undefined

export const usePagesStore = create<PagesState>((set) => ({
  pages: [],
  activePageId: null,
  ready: false,

  initialize: () => {
    initPromise ??= (async () => {
      const pages = await window.api.pages.list()
      if (pages.length === 0) {
        const page = await window.api.pages.create({ title: DEFAULT_TITLE })
        set({ pages: [page], activePageId: page.id, ready: true })
        return
      }
      set({ pages, activePageId: pages[0].id, ready: true })
    })()
    return initPromise
  },

  selectPage: (id) => set({ activePageId: id }),

  createPage: async () => {
    const page = await window.api.pages.create({ title: DEFAULT_TITLE })
    set((state) => ({ pages: [...state.pages, page], activePageId: page.id }))
  },

  renamePage: (id, title) => {
    set((state) => ({
      pages: state.pages.map((page) => (page.id === id ? { ...page, title } : page))
    }))
    clearTimeout(renameTimer)
    renameTimer = setTimeout(() => {
      void window.api.pages.rename(id, title)
    }, AUTOSAVE_DELAY_MS)
  }
}))
