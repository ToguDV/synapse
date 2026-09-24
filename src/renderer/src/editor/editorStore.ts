import { create } from 'zustand'
import type { TodoStatus } from '../../../shared/content'
import type { BlockType } from '../../../shared/types'
import { matchInputRule } from './commands'
import { getBlockDefinition } from './registry'
import { createPersistence, type PersistenceHooks } from './persistence'
import * as tx from './transforms'
import type { EditorBlock, FocusTarget } from './types'

const TEXT_COALESCE_MS = 600
const HISTORY_LIMIT = 200

interface HistoryEntry {
  blocks: EditorBlock[]
  activeBlockId: string | null
}

export interface FocusRequest extends FocusTarget {
  nonce: number
}

export type SelectionMode = 'replace' | 'toggle' | 'range'

export interface EditorState {
  pageId: string | null
  blocks: EditorBlock[]
  loading: boolean
  activeBlockId: string | null
  focusRequest: FocusRequest | null
  selectedIds: string[]
  selectionAnchor: string | null
  past: HistoryEntry[]
  future: HistoryEntry[]
  loadPage: (pageId: string) => Promise<void>
  cancelLoad: (pageId: string) => () => void
  reset: () => void
  flush: () => Promise<void>
  setActiveBlock: (id: string | null) => void
  requestFocus: (blockId: string, caret?: number) => void
  focusBlock: (pageId: string, blockId: string) => void
  consumeFocus: () => void
  setText: (id: string, text: string) => void
  applyInput: (id: string, text: string) => void
  toggleDone: (id: string) => void
  setStatus: (id: string, status: TodoStatus) => void
  splitAt: (id: string, offset: number) => void
  mergeBackward: (id: string) => void
  mergeForward: (id: string) => void
  indentBlock: (id: string) => void
  outdentBlock: (id: string) => void
  setBlockType: (id: string, type: BlockType) => void
  convertBlock: (id: string, type: BlockType) => void
  applySlashCommand: (id: string, type: BlockType) => void
  removeBlock: (id: string) => void
  deleteBlocks: (ids?: string[]) => void
  duplicateBlocks: (ids?: string[]) => void
  moveBlockTo: (id: string, toIndex: number, indent?: number) => void
  selectBlock: (id: string, mode: SelectionMode) => void
  extendSelection: (id: string, direction: -1 | 1) => void
  clearSelection: () => void
  focusSibling: (id: string, direction: -1 | 1) => void
  undo: () => void
  redo: () => void
}

function createBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const useEditorStore = create<EditorState>((set, get) => {
  let lastTextEdit: { blockId: string; at: number } | null = null

  const snapshot = (): HistoryEntry => ({
    blocks: get().blocks,
    activeBlockId: get().activeBlockId
  })

  const pushHistory = (): void => {
    const entry = snapshot()
    set((state) => ({ past: [...state.past, entry].slice(-HISTORY_LIMIT), future: [] }))
  }

  const clearSelection = (): void => {
    if (get().selectedIds.length > 0 || get().selectionAnchor !== null) {
      set({ selectedIds: [], selectionAnchor: null })
    }
  }

  const resetLocal = (): void => {
    lastTextEdit = null
    set({
      pageId: null,
      blocks: [],
      loading: false,
      activeBlockId: null,
      focusRequest: null,
      selectedIds: [],
      selectionAnchor: null,
      past: [],
      future: []
    })
  }

  const hooks: PersistenceHooks = {
    currentPage: () => get().pageId,
    currentBlocks: () => get().blocks,
    beginLoad: (pageId) => {
      lastTextEdit = null
      set({
        pageId,
        blocks: [],
        loading: true,
        activeBlockId: null,
        focusRequest: null,
        selectedIds: [],
        selectionAnchor: null,
        past: [],
        future: []
      })
    },
    applyLoaded: (pageId, blocks) => {
      if (get().pageId !== pageId) return
      set({ blocks, loading: false })
    },
    onLoadError: (pageId) => {
      if (get().pageId === pageId) set({ loading: false })
    },
    resetEditor: resetLocal,
    requestFocus: (blockId, caret) => get().requestFocus(blockId, caret)
  }

  const persistence = createPersistence(hooks)

  const commit = (blocks: EditorBlock[], focus?: FocusTarget): void => {
    set({ blocks })
    if (focus) get().requestFocus(focus.blockId, focus.caret)
    persistence.schedulePersist()
  }

  const mutate = (
    blocks: EditorBlock[],
    focus?: FocusTarget,
    selection?: { ids: string[]; anchor: string | null }
  ): void => {
    clearSelection()
    pushHistory()
    lastTextEdit = null
    if (selection) set({ selectedIds: selection.ids, selectionAnchor: selection.anchor })
    commit(blocks, focus)
  }

  return {
    pageId: null,
    blocks: [],
    loading: false,
    activeBlockId: null,
    focusRequest: null,
    selectedIds: [],
    selectionAnchor: null,
    past: [],
    future: [],

    loadPage: (pageId) => persistence.loadPage(pageId),

    cancelLoad: (pageId) => persistence.cancelLoad(pageId),

    reset: () => {
      persistence.clear()
      resetLocal()
    },

    flush: () => persistence.flush(),

    setActiveBlock: (id) => set({ activeBlockId: id }),

    requestFocus: (blockId, caret = 0) =>
      set((state) => ({
        focusRequest: { blockId, caret, nonce: (state.focusRequest?.nonce ?? 0) + 1 }
      })),

    focusBlock: (pageId, blockId) => {
      if (get().pageId === pageId && !get().loading) {
        get().requestFocus(blockId, 0)
        return
      }
      persistence.setPendingBlockFocus({ pageId, blockId })
    },

    consumeFocus: () => set({ focusRequest: null }),

    setText: (id, text) => {
      const current = get().blocks
      const blocks = tx.updateText(current, id, text)
      if (blocks === current) return
      clearSelection()
      const now = Date.now()
      if (
        !lastTextEdit ||
        lastTextEdit.blockId !== id ||
        now - lastTextEdit.at > TEXT_COALESCE_MS
      ) {
        pushHistory()
      }
      lastTextEdit = { blockId: id, at: now }
      set({ blocks, future: [] })
      persistence.schedulePersist()
    },

    applyInput: (id, text) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const definition = getBlockDefinition(found.block.type)
      const rule =
        definition.textual && definition.layout === 'text' ? matchInputRule(text) : null
      if (!rule || rule.type === found.block.type) {
        get().setText(id, text)
        return
      }
      const ruleDefinition = getBlockDefinition(rule.type)
      const sameType = get().blocks
      if (ruleDefinition.appendsParagraph) {
        const paragraphId = createBlockId()
        let blocks = tx.changeType(sameType, id, rule.type)
        blocks = tx.updateText(blocks, id, '')
        blocks = tx.insertAfter(blocks, id, [{ id: paragraphId, type: 'paragraph' }])
        mutate(blocks, { blockId: paragraphId, caret: 0 })
        return
      }
      let blocks = tx.changeType(sameType, id, rule.type)
      if (ruleDefinition.hasStatus) blocks = tx.updateStatus(blocks, id, 'todo')
      blocks = tx.updateText(blocks, id, rule.text)
      mutate(blocks, { blockId: id, caret: rule.text.length })
    },

    toggleDone: (id) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      get().setStatus(id, (found.block.status ?? 'todo') === 'done' ? 'todo' : 'done')
    },

    setStatus: (id, status) => {
      const blocks = tx.updateStatus(get().blocks, id, status)
      if (blocks === get().blocks) return
      mutate(blocks)
    },

    splitAt: (id, offset) => {
      const result = tx.splitBlock(get().blocks, id, offset, createBlockId())
      mutate(result.blocks, result.focus)
    },

    mergeBackward: (id) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const { block, index } = found
      if (block.text === '' && block.type !== 'paragraph') {
        mutate(tx.changeType(get().blocks, id, 'paragraph'), { blockId: id, caret: 0 })
        return
      }
      if (index === 0) return
      const previous = get().blocks[index - 1]
      if (!tx.isTextualBlock(previous)) {
        const result = tx.removeBlocks(get().blocks, [previous.id])
        mutate(result.blocks, { blockId: id, caret: 0 })
        return
      }
      const result = tx.mergeWithPrevious(get().blocks, id)
      mutate(result.blocks, result.focus)
    },

    mergeForward: (id) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const nextBlock = get().blocks[found.index + 1]
      if (!nextBlock) return
      if (!tx.isTextualBlock(nextBlock)) {
        const result = tx.removeBlocks(get().blocks, [nextBlock.id])
        mutate(result.blocks, { blockId: id, caret: found.block.text.length })
        return
      }
      const result = tx.mergeWithNext(get().blocks, id)
      if (result.blocks === get().blocks) return
      mutate(result.blocks, result.focus)
    },

    indentBlock: (id) => {
      const blocks = tx.indentBlock(get().blocks, id)
      if (blocks === get().blocks) return
      mutate(blocks)
    },

    outdentBlock: (id) => {
      const blocks = tx.outdentBlock(get().blocks, id)
      if (blocks === get().blocks) return
      mutate(blocks)
    },

    setBlockType: (id, type) => {
      const blocks = tx.changeType(get().blocks, id, type)
      if (blocks === get().blocks) return
      mutate(blocks)
    },

    convertBlock: (id, type) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found || found.block.type === type) return
      const definition = getBlockDefinition(type)
      if (definition.appendsParagraph) {
        const following = tx.nearestTextualBlock(get().blocks, found.index + 1, 1)
        let blocks = tx.changeType(get().blocks, id, type)
        blocks = tx.updateText(blocks, id, '')
        let focusId = following?.id
        if (!focusId) {
          focusId = createBlockId()
          blocks = tx.insertAfter(blocks, id, [{ id: focusId, type: 'paragraph' }])
        }
        mutate(blocks, { blockId: focusId, caret: 0 })
        return
      }
      let blocks = tx.changeType(get().blocks, id, type)
      if (definition.hasStatus) blocks = tx.updateStatus(blocks, id, 'todo')
      mutate(blocks, { blockId: id, caret: found.block.text.length })
    },

    applySlashCommand: (id, type) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const definition = getBlockDefinition(type)
      const { block } = found
      const inPlace = block.text === ''
      if (definition.appendsParagraph) {
        if (inPlace) {
          const paragraphId = createBlockId()
          let blocks = tx.changeType(get().blocks, id, type)
          blocks = tx.insertAfter(blocks, id, [{ id: paragraphId, type: 'paragraph' }])
          mutate(blocks, { blockId: paragraphId, caret: 0 })
        } else {
          const dividerId = createBlockId()
          const paragraphId = createBlockId()
          const blocks = tx.insertAfter(get().blocks, id, [
            { id: dividerId, type, indent: 0 },
            { id: paragraphId, type: 'paragraph', indent: 0 }
          ])
          mutate(blocks, { blockId: paragraphId, caret: 0 })
        }
        return
      }
      if (inPlace) {
        let blocks = tx.changeType(get().blocks, id, type)
        if (definition.hasStatus) blocks = tx.updateStatus(blocks, id, 'todo')
        mutate(blocks, { blockId: id, caret: 0 })
        return
      }
      const newBlockId = createBlockId()
      const blocks = tx.insertAfter(get().blocks, id, [
        {
          id: newBlockId,
          type,
          indent: block.indent,
          ...(definition.hasStatus ? { status: 'todo' as const } : {})
        }
      ])
      mutate(blocks, { blockId: newBlockId, caret: 0 })
    },

    removeBlock: (id) => {
      get().deleteBlocks([id])
    },

    deleteBlocks: (ids) => {
      const targets = ids && ids.length > 0 ? ids : get().selectedIds
      if (targets.length === 0) return
      const result = tx.removeBlocks(get().blocks, targets)
      if (result.blocks === get().blocks) return
      let blocks = result.blocks
      let focus = result.focus
      if (blocks.length === 0) {
        const id = createBlockId()
        blocks = [{ id, type: 'paragraph', text: '', indent: 0 }]
        focus = { blockId: id, caret: 0 }
      } else if (!focus) {
        const id = createBlockId()
        blocks = [...blocks, { id, type: 'paragraph', text: '', indent: 0 }]
        focus = { blockId: id, caret: 0 }
      }
      mutate(blocks, focus)
    },

    duplicateBlocks: (ids) => {
      const targets = ids && ids.length > 0 ? ids : get().selectedIds
      if (targets.length === 0) return
      const result = tx.duplicateBlocks(get().blocks, targets, createBlockId)
      if (result.blocks === get().blocks) return
      mutate(result.blocks, undefined, {
        ids: result.newIds,
        anchor: result.newIds[0] ?? null
      })
    },

    moveBlockTo: (id, toIndex, indent) => {
      const blocks = tx.moveBlock(get().blocks, id, toIndex, indent)
      if (blocks === get().blocks) return
      mutate(blocks)
    },

    selectBlock: (id, mode) => {
      const { blocks, activeBlockId, selectedIds, selectionAnchor } = get()
      if (mode === 'range') {
        const anchor = selectionAnchor ?? activeBlockId ?? id
        const anchorIndex = blocks.findIndex((block) => block.id === anchor)
        const targetIndex = blocks.findIndex((block) => block.id === id)
        if (anchorIndex === -1 || targetIndex === -1) {
          set({ selectedIds: [id], selectionAnchor: id })
          return
        }
        const from = Math.min(anchorIndex, targetIndex)
        const to = Math.max(anchorIndex, targetIndex)
        set({
          selectedIds: blocks.slice(from, to + 1).map((block) => block.id),
          selectionAnchor: anchor
        })
        return
      }
      if (mode === 'toggle') {
        const anchor = selectionAnchor ?? id
        const next = selectedIds.includes(id)
          ? selectedIds.filter((candidate) => candidate !== id)
          : [...selectedIds, id]
        set({ selectedIds: next, selectionAnchor: next.length > 0 ? anchor : null })
        return
      }
      set({ selectedIds: [], selectionAnchor: id })
    },

    extendSelection: (id, direction) => {
      const { blocks, activeBlockId, selectionAnchor } = get()
      const currentIndex = blocks.findIndex((block) => block.id === id)
      const targetIndex = currentIndex + direction
      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= blocks.length) return
      const anchor = selectionAnchor ?? activeBlockId ?? id
      const anchorIndex = blocks.findIndex((block) => block.id === anchor)
      const from = Math.min(anchorIndex === -1 ? currentIndex : anchorIndex, targetIndex)
      const to = Math.max(anchorIndex === -1 ? currentIndex : anchorIndex, targetIndex)
      const target = tx.nearestTextualBlock(blocks, targetIndex, direction)
      set({
        selectedIds: blocks.slice(from, to + 1).map((block) => block.id),
        selectionAnchor: anchor
      })
      if (target) get().requestFocus(target.id, direction < 0 ? target.text.length : 0)
    },

    clearSelection,

    focusSibling: (id, direction) => {
      const { blocks } = get()
      const index = blocks.findIndex((block) => block.id === id)
      if (index === -1) return
      const target = tx.nearestTextualBlock(blocks, index + direction, direction)
      if (!target) return
      get().requestFocus(target.id, direction < 0 ? target.text.length : 0)
    },

    undo: () => {
      const { past, future, blocks, activeBlockId } = get()
      if (past.length === 0) return
      const entry = past[past.length - 1]
      lastTextEdit = null
      set({
        past: past.slice(0, -1),
        future: [{ blocks, activeBlockId }, ...future].slice(0, HISTORY_LIMIT),
        blocks: entry.blocks,
        activeBlockId: entry.activeBlockId,
        selectedIds: [],
        selectionAnchor: null
      })
      const target =
        entry.blocks.find((block) => block.id === entry.activeBlockId) ?? entry.blocks[0]
      if (target) get().requestFocus(target.id, target.text.length)
      persistence.schedulePersist()
    },

    redo: () => {
      const { past, future, blocks, activeBlockId } = get()
      if (future.length === 0) return
      const entry = future[0]
      lastTextEdit = null
      set({
        past: [...past, { blocks, activeBlockId }].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        blocks: entry.blocks,
        activeBlockId: entry.activeBlockId,
        selectedIds: [],
        selectionAnchor: null
      })
      const target =
        entry.blocks.find((block) => block.id === entry.activeBlockId) ?? entry.blocks[0]
      if (target) get().requestFocus(target.id, target.text.length)
      persistence.schedulePersist()
    }
  }
})
