import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Block, BlockCreateInput, BlockUpdatePatch } from '../../../shared/types'

// Cubierto por tests/persistence.test.ts (better-sqlite3 v13 usa prebuilds N-API,
// por lo que carga igual bajo Node/vitest y bajo Electron).

interface BlockRow {
  id: string
  page_id: string
  type: string
  content: string
  position: number
  indent: number
  created_at: number
  updated_at: number
}

function toBlock(row: BlockRow): Block {
  return {
    id: row.id,
    pageId: row.page_id,
    type: row.type as Block['type'],
    content: row.content,
    position: row.position,
    indent: row.indent,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createBlocksRepo(db: Database.Database) {
  const selectByPage = db.prepare(
    'SELECT * FROM blocks WHERE page_id = ? ORDER BY position, created_at'
  )
  const selectById = db.prepare('SELECT * FROM blocks WHERE id = ?')
  const insert = db.prepare(
    `INSERT INTO blocks (id, page_id, type, content, position, indent, created_at, updated_at)
     VALUES (@id, @pageId, @type, @content, @position, @indent, @createdAt, @updatedAt)`
  )
  const remove = db.prepare('DELETE FROM blocks WHERE id = ?')
  const updatePosition = db.prepare(
    'UPDATE blocks SET position = ?, updated_at = ? WHERE id = ? AND page_id = ?'
  )

  const now = (): number => Date.now()

  const get = (id: string): Block | null => {
    const row = selectById.get(id) as BlockRow | undefined
    return row ? toBlock(row) : null
  }

  const getOrThrow = (id: string): Block => {
    const block = get(id)
    if (!block) throw new Error(`Block not found: ${id}`)
    return block
  }

  const list = (pageId: string): Block[] =>
    (selectByPage.all(pageId) as BlockRow[]).map(toBlock)

  const nextPosition = (pageId: string): number => {
    const row = db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM blocks WHERE page_id = ?')
      .get(pageId) as { next: number }
    return row.next
  }

  const create = (input: BlockCreateInput): Block => {
    const block: Block = {
      id: input.id ?? randomUUID(),
      pageId: input.pageId,
      type: input.type ?? 'paragraph',
      content: input.content ?? '{"text":""}',
      position: input.position ?? nextPosition(input.pageId),
      indent: input.indent ?? 0,
      createdAt: now(),
      updatedAt: now()
    }
    insert.run(block)
    return block
  }

  const update = (id: string, patch: BlockUpdatePatch): Block => {
    const fields: string[] = []
    const params: Record<string, unknown> = { id, updatedAt: now() }
    if (patch.type !== undefined) {
      fields.push('type = @type')
      params.type = patch.type
    }
    if (patch.content !== undefined) {
      fields.push('content = @content')
      params.content = patch.content
    }
    if (patch.indent !== undefined) {
      fields.push('indent = @indent')
      params.indent = patch.indent
    }
    if (fields.length === 0) return getOrThrow(id)
    db.prepare(`UPDATE blocks SET ${fields.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run(
      params
    )
    return getOrThrow(id)
  }

  const reorder = (pageId: string, orderedIds: string[]): Block[] => {
    const run = db.transaction((ids: string[]) => {
      ids.forEach((id, index) => updatePosition.run(index, now(), id, pageId))
    })
    run(orderedIds)
    return list(pageId)
  }

  const removeBlock = (id: string): void => {
    remove.run(id)
  }

  return { list, get, create, update, reorder, remove: removeBlock }
}

export type BlocksRepo = ReturnType<typeof createBlocksRepo>
