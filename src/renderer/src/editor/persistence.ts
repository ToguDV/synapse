import type { Block, BlockType } from '../../../shared/types'
import { parseBlockContent, serializeContent } from './content'
import { getBlockDefinition } from './registry'
import type { EditorBlock } from './types'

const AUTOSAVE_DELAY_MS = 400

interface PersistedBlock {
  content: string
  type: BlockType
  indent: number
  position: number
}

export interface PersistenceHooks {
  currentPage: () => string | null
  currentBlocks: () => EditorBlock[]
  beginLoad: (pageId: string) => void
  applyLoaded: (pageId: string, blocks: EditorBlock[]) => void
  onLoadError: (pageId: string) => void
  resetEditor: () => void
  requestFocus: (blockId: string, caret: number) => void
}

export interface Persistence {
  flush(): Promise<void>
  loadPage(pageId: string): Promise<void>
  cancelLoad(pageId: string): () => void
  schedulePersist(): void
  clear(): void
  setPendingBlockFocus(focus: { pageId: string; blockId: string } | null): void
}

function toEditorBlock(row: Block): EditorBlock {
  const parsed = parseBlockContent(row.content)
  return {
    id: row.id,
    type: row.type,
    text: parsed.text,
    indent: row.indent,
    ...(getBlockDefinition(row.type).hasStatus ? { status: parsed.status } : {})
  }
}

export function createPersistence(hooks: PersistenceHooks): Persistence {
  let persisted = new Map<string, PersistedBlock>()
  let persistedPageId: string | null = null
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let flushQueue: Promise<void> = Promise.resolve()
  let loadQueue: Promise<void> = Promise.resolve()
  const cancelledLoads = new Set<string>()
  let pendingBlockFocus: { pageId: string; blockId: string } | null = null

  const isCurrent = (pageId: string): boolean => hooks.currentPage() === pageId

  const schedulePersist = (): void => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void flush().catch(() => undefined)
    }, AUTOSAVE_DELAY_MS)
  }

  const clear = (): void => {
    clearTimeout(persistTimer)
    persisted = new Map()
    persistedPageId = null
    pendingBlockFocus = null
  }

  const runFlush = async (): Promise<void> => {
    const pageId = hooks.currentPage()
    const blocks = hooks.currentBlocks()
    if (!pageId || pageId !== persistedPageId) return
    const ids = new Set(blocks.map((block) => block.id))
    for (const id of [...persisted.keys()]) {
      if (ids.has(id)) continue
      await window.api.blocks.remove(id)
      persisted.delete(id)
    }
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]
      const content = serializeContent(block.text, block.status ?? 'todo')
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

  const abortCancelledLoad = (pageId: string): boolean => {
    if (!cancelledLoads.has(pageId)) return false
    if (isCurrent(pageId)) hooks.resetEditor()
    return true
  }

  const performLoad = async (pageId: string): Promise<void> => {
    await flush()
    if (cancelledLoads.has(pageId)) return
    if (pendingBlockFocus && pendingBlockFocus.pageId !== pageId) pendingBlockFocus = null
    persisted = new Map()
    persistedPageId = pageId
    hooks.beginLoad(pageId)
    try {
      let rows = await window.api.blocks.list(pageId)
      if (abortCancelledLoad(pageId) || !isCurrent(pageId)) return
      if (rows.length === 0) {
        try {
          rows = [await window.api.blocks.create({ pageId })]
        } catch (error) {
          if (abortCancelledLoad(pageId) || !isCurrent(pageId)) return
          throw error
        }
        if (abortCancelledLoad(pageId) || !isCurrent(pageId)) return
      }
      for (const row of rows) {
        persisted.set(row.id, {
          content: row.content,
          type: row.type,
          indent: row.indent,
          position: row.position
        })
      }
      hooks.applyLoaded(
        pageId,
        rows.map(toEditorBlock)
      )
      if (pendingBlockFocus && pendingBlockFocus.pageId === pageId) {
        const { blockId } = pendingBlockFocus
        pendingBlockFocus = null
        hooks.requestFocus(blockId, 0)
      }
    } catch (error) {
      hooks.onLoadError(pageId)
      if (pendingBlockFocus?.pageId === pageId) pendingBlockFocus = null
      throw error
    }
  }

  const flush = (): Promise<void> => {
    clearTimeout(persistTimer)
    flushQueue = flushQueue.then(runFlush, runFlush)
    return flushQueue
  }

  return {
    flush,
    loadPage: (pageId) => {
      cancelledLoads.delete(pageId)
      loadQueue = loadQueue.then(
        () => performLoad(pageId),
        () => performLoad(pageId)
      )
      return loadQueue
    },
    cancelLoad: (pageId) => {
      cancelledLoads.add(pageId)
      return () => {
        cancelledLoads.delete(pageId)
      }
    },
    schedulePersist,
    clear,
    setPendingBlockFocus: (focus) => {
      pendingBlockFocus = focus
    }
  }
}
