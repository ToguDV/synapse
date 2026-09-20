import { create } from 'zustand'
import type { BlockType } from '../../../shared/types'
import { matchInputRule } from './commands'
import { parseBlockContent, serializeContent } from './content'
import { getBlockDefinition } from './registry'
import * as tx from './transforms'
import type { EditorBlock, FocusTarget } from './types'

const AUTOSAVE_DELAY_MS = 400
const TEXT_COALESCE_MS = 600
const HISTORY_LIMIT = 200

interface HistoryEntry {
  blocks: EditorBlock[]
  activeBlockId: string | null
}

interface PersistedBlock {
  content: string
  type: BlockType
  indent: number
  position: number
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
  flush: () => Promise<void>
  setActiveBlock: (id: string | null) => void
  requestFocus: (blockId: string, caret?: number) => void
  consumeFocus: () => void
  setText: (id: string, text: string) => void
  applyInput: (id: string, text: string) => void
  toggleChecked: (id: string) => void
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
  let persisted = new Map<string, PersistedBlock>()
  let persistedPageId: string | null = null
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let flushQueue: Promise<void> = Promise.resolve()
  let loadQueue: Promise<void> = Promise.resolve()
  let lastTextEdit: { blockId: string; at: number } | null = null

  const schedulePersist = (): void => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void get().flush()
    }, AUTOSAVE_DELAY_MS)
  }

  const snapshot = (): HistoryEntry => ({
    blocks: get().blocks,
    activeBlockId: get().activeBlockId
  })

  const pushHistory = (): void => {
    const entry = snapshot()
    set((state) => ({ past: [...state.past, entry].slice(-HISTORY_LIMIT), future: [] }))
  }

  const commit = (blocks: EditorBlock[], focus?: FocusTarget): void => {
    set({ blocks })
    if (focus) get().requestFocus(focus.blockId, focus.caret)
    schedulePersist()
  }

  const clearSelection = (): void => {
    if (get().selectedIds.length > 0 || get().selectionAnchor !== null) {
      set({ selectedIds: [], selectionAnchor: null })
    }
  }

  const performLoad = async (pageId: string): Promise<void> => {
    await get().flush()
    persisted = new Map()
    persistedPageId = pageId
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
    try {
      let rows = await window.api.blocks.list(pageId)
      if (get().pageId !== pageId) return
      if (rows.length === 0) {
        rows = [await window.api.blocks.create({ pageId })]
        if (get().pageId !== pageId) return
      }
      for (const row of rows) {
        persisted.set(row.id, {
          content: row.content,
          type: row.type,
          indent: row.indent,
          position: row.position
        })
      }
      set({
        blocks: rows.map((row) => {
          const parsed = parseBlockContent(row.content)
          return {
            id: row.id,
            type: row.type,
            text: parsed.text,
            indent: row.indent,
            ...(parsed.checked ? { checked: true } : {})
          }
        }),
        loading: false
      })
    } catch (error) {
      if (get().pageId === pageId) set({ loading: false })
      throw error
    }
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

    loadPage: (pageId) => {
      loadQueue = loadQueue.then(
        () => performLoad(pageId),
        () => performLoad(pageId)
      )
      return loadQueue
    },

    flush: () => {
      clearTimeout(persistTimer)
      const run = async (): Promise<void> => {
        const { pageId, blocks } = get()
        if (!pageId || pageId !== persistedPageId) return
        const ids = new Set(blocks.map((block) => block.id))
        for (const id of [...persisted.keys()]) {
          if (ids.has(id)) continue
          await window.api.blocks.remove(id)
          persisted.delete(id)
        }
        for (let index = 0; index < blocks.length; index++) {
          const block = blocks[index]
          const content = serializeContent(block.text, block.checked ?? false)
          const stored = persisted.get(block.id)
          if (!stored) {
            await window.api.blocks.create({
              id: block.id,
              pageId,
              type: block.type,
              content,
              position: index,
              indent: block.indent
            })
            persisted.set(block.id, {
              content,
              type: block.type,
              indent: block.indent,
              position: index
            })
            continue
          }
          if (
            stored.content !== content ||
            stored.type !== block.type ||
            stored.indent !== block.indent
          ) {
            await window.api.blocks.update(block.id, {
              type: block.type,
              content,
              indent: block.indent
            })
            stored.content = content
            stored.type = block.type
            stored.indent = block.indent
          }
        }
        if (
          blocks.length > 0 &&
          blocks.some((block, index) => persisted.get(block.id)?.position !== index)
        ) {
          await window.api.blocks.reorder(
            pageId,
            blocks.map((block) => block.id)
          )
          blocks.forEach((block, index) => {
            const stored = persisted.get(block.id)
            if (stored) stored.position = index
          })
        }
      }
      flushQueue = flushQueue.then(run, run)
      return flushQueue
    },

    setActiveBlock: (id) => set({ activeBlockId: id }),

    requestFocus: (blockId, caret = 0) =>
      set((state) => ({
        focusRequest: { blockId, caret, nonce: (state.focusRequest?.nonce ?? 0) + 1 }
      })),

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
      schedulePersist()
    },

    applyInput: (id, text) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const definition = getBlockDefinition(found.block.type)
      const rule =
        definition.textual && found.block.type !== 'code' ? matchInputRule(text) : null
      if (!rule || rule.type === found.block.type) {
        get().setText(id, text)
        return
      }
      clearSelection()
      pushHistory()
      lastTextEdit = null
      const sameType = get().blocks
      if (rule.type === 'divider') {
        const paragraphId = createBlockId()
        let blocks = tx.changeType(sameType, id, 'divider')
        blocks = tx.updateText(blocks, id, '')
        blocks = tx.insertAfter(blocks, id, [{ id: paragraphId, type: 'paragraph' }])
        commit(blocks, { blockId: paragraphId, caret: 0 })
        return
      }
      let blocks = tx.changeType(sameType, id, rule.type)
      if (rule.type === 'todo') blocks = tx.updateChecked(blocks, id, false)
      blocks = tx.updateText(blocks, id, rule.text)
      commit(blocks, { blockId: id, caret: rule.text.length })
    },

    toggleChecked: (id) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const blocks = tx.updateChecked(get().blocks, id, !(found.block.checked ?? false))
      if (blocks === get().blocks) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      commit(blocks)
    },

    splitAt: (id, offset) => {
      clearSelection()
      pushHistory()
      lastTextEdit = null
      const result = tx.splitBlock(get().blocks, id, offset, createBlockId())
      commit(result.blocks, result.focus)
    },

    mergeBackward: (id) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const { block, index } = found
      if (block.text === '' && block.type !== 'paragraph') {
        clearSelection()
        pushHistory()
        lastTextEdit = null
        commit(tx.changeType(get().blocks, id, 'paragraph'))
        get().requestFocus(id, 0)
        return
      }
      if (index === 0) return
      const previous = get().blocks[index - 1]
      if (!tx.isTextualBlock(previous)) {
        clearSelection()
        pushHistory()
        lastTextEdit = null
        const result = tx.removeBlocks(get().blocks, [previous.id])
        commit(result.blocks, { blockId: id, caret: 0 })
        return
      }
      clearSelection()
      pushHistory()
      lastTextEdit = null
      const result = tx.mergeWithPrevious(get().blocks, id)
      commit(result.blocks, result.focus)
    },

    mergeForward: (id) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      const nextBlock = get().blocks[found.index + 1]
      if (!nextBlock) return
      if (!tx.isTextualBlock(nextBlock)) {
        clearSelection()
        pushHistory()
        lastTextEdit = null
        const result = tx.removeBlocks(get().blocks, [nextBlock.id])
        commit(result.blocks, { blockId: id, caret: found.block.text.length })
        return
      }
      const result = tx.mergeWithNext(get().blocks, id)
      if (result.blocks === get().blocks) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      commit(result.blocks, result.focus)
    },

    indentBlock: (id) => {
      const blocks = tx.indentBlock(get().blocks, id)
      if (blocks === get().blocks) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      commit(blocks)
    },

    outdentBlock: (id) => {
      const blocks = tx.outdentBlock(get().blocks, id)
      if (blocks === get().blocks) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      commit(blocks)
    },

    setBlockType: (id, type) => {
      const blocks = tx.changeType(get().blocks, id, type)
      if (blocks === get().blocks) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      commit(blocks)
    },

    convertBlock: (id, type) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found || found.block.type === type) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      if (type === 'divider') {
        const following = tx.nearestTextualBlock(get().blocks, found.index + 1, 1)
        let blocks = tx.changeType(get().blocks, id, 'divider')
        blocks = tx.updateText(blocks, id, '')
        let focusId = following?.id
        if (!focusId) {
          focusId = createBlockId()
          blocks = tx.insertAfter(blocks, id, [{ id: focusId, type: 'paragraph' }])
        }
        commit(blocks, { blockId: focusId, caret: 0 })
        return
      }
      let blocks = tx.changeType(get().blocks, id, type)
      if (type === 'todo') blocks = tx.updateChecked(blocks, id, false)
      commit(blocks, { blockId: id, caret: found.block.text.length })
    },

    applySlashCommand: (id, type) => {
      const found = tx.blockAt(get().blocks, id)
      if (!found) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      const { block } = found
      const inPlace = block.text === ''
      if (type === 'divider') {
        if (inPlace) {
          const paragraphId = createBlockId()
          let blocks = tx.changeType(get().blocks, id, 'divider')
          blocks = tx.insertAfter(blocks, id, [{ id: paragraphId, type: 'paragraph' }])
          commit(blocks, { blockId: paragraphId, caret: 0 })
        } else {
          const dividerId = createBlockId()
          const paragraphId = createBlockId()
          const blocks = tx.insertAfter(get().blocks, id, [
            { id: dividerId, type: 'divider', indent: 0 },
            { id: paragraphId, type: 'paragraph', indent: 0 }
          ])
          commit(blocks, { blockId: paragraphId, caret: 0 })
        }
        return
      }
      if (inPlace) {
        let blocks = tx.changeType(get().blocks, id, type)
        if (type === 'todo') blocks = tx.updateChecked(blocks, id, false)
        commit(blocks, { blockId: id, caret: 0 })
        return
      }
      const newBlockId = createBlockId()
      const blocks = tx.insertAfter(get().blocks, id, [
        {
          id: newBlockId,
          type,
          indent: block.indent,
          ...(type === 'todo' ? { checked: false } : {})
        }
      ])
      commit(blocks, { blockId: newBlockId, caret: 0 })
    },

    removeBlock: (id) => {
      get().deleteBlocks([id])
    },

    deleteBlocks: (ids) => {
      const targets = ids && ids.length > 0 ? ids : get().selectedIds
      if (targets.length === 0) return
      const result = tx.removeBlocks(get().blocks, targets)
      if (result.blocks === get().blocks) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
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
      commit(blocks, focus)
    },

    duplicateBlocks: (ids) => {
      const targets = ids && ids.length > 0 ? ids : get().selectedIds
      if (targets.length === 0) return
      const result = tx.duplicateBlocks(get().blocks, targets, createBlockId)
      if (result.blocks === get().blocks) return
      pushHistory()
      lastTextEdit = null
      set({ selectedIds: result.newIds, selectionAnchor: result.newIds[0] ?? null })
      commit(result.blocks)
    },

    moveBlockTo: (id, toIndex, indent) => {
      const blocks = tx.moveBlock(get().blocks, id, toIndex, indent)
      if (blocks === get().blocks) return
      clearSelection()
      pushHistory()
      lastTextEdit = null
      commit(blocks)
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
      schedulePersist()
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
      schedulePersist()
    }
  }
})
