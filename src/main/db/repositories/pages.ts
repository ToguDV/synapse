import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Page, PageCreateInput, PageMoveInput } from '../../../shared/types'

// Cubierto por tests/persistence.test.ts (better-sqlite3 v13 usa prebuilds N-API,
// por lo que carga igual bajo Node/vitest y bajo Electron).

interface PageRow {
  id: string
  title: string
  parent_id: string | null
  icon: string | null
  position: number
  created_at: number
  updated_at: number
}

function toPage(row: PageRow): Page {
  return {
    id: row.id,
    title: row.title,
    parentId: row.parent_id,
    icon: row.icon,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createPagesRepo(db: Database.Database) {
  const selectAll = db.prepare('SELECT * FROM pages ORDER BY position, created_at')
  const selectById = db.prepare('SELECT * FROM pages WHERE id = ?')
  const insert = db.prepare(
    `INSERT INTO pages (id, title, parent_id, icon, position, created_at, updated_at)
     VALUES (@id, @title, @parentId, @icon, @position, @createdAt, @updatedAt)`
  )
  const update = db.prepare(
    `UPDATE pages SET title = @title, parent_id = @parentId, icon = @icon,
     position = @position, updated_at = @updatedAt WHERE id = @id`
  )
  const updatePosition = db.prepare('UPDATE pages SET position = ? WHERE id = ?')
  const remove = db.prepare('DELETE FROM pages WHERE id = ?')

  const now = (): number => Date.now()

  const list = (): Page[] => (selectAll.all() as PageRow[]).map(toPage)

  const get = (id: string): Page | null => {
    const row = selectById.get(id) as PageRow | undefined
    return row ? toPage(row) : null
  }

  const getOrThrow = (id: string): Page => {
    const page = get(id)
    if (!page) throw new Error(`Page not found: ${id}`)
    return page
  }

  const nextPosition = (parentId: string | null): number => {
    const row = db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM pages WHERE parent_id IS ?')
      .get(parentId) as { next: number }
    return row.next
  }

  const create = (input: PageCreateInput = {}): Page => {
    const parentId = input.parentId ?? null
    const page: Page = {
      id: randomUUID(),
      title: input.title ?? '',
      parentId,
      icon: null,
      position: nextPosition(parentId),
      createdAt: now(),
      updatedAt: now()
    }
    insert.run(page)
    return page
  }

  const write = (page: Page): Page => {
    update.run({
      id: page.id,
      title: page.title,
      parentId: page.parentId,
      icon: page.icon,
      position: page.position,
      updatedAt: now()
    })
    return getOrThrow(page.id)
  }

  const rename = (id: string, title: string): Page => write({ ...getOrThrow(id), title })

  const setIcon = (id: string, icon: string | null): Page => write({ ...getOrThrow(id), icon })

  const orderedChildren = (parentId: string | null, excludeId?: string): PageRow[] =>
    (selectAll.all() as PageRow[])
      .filter((row) => row.parent_id === parentId && row.id !== excludeId)
      .sort(
        (a, b) =>
          a.position - b.position ||
          a.created_at - b.created_at ||
          a.id.localeCompare(b.id)
      )

  const isDescendant = (candidateId: string, ancestorId: string): boolean => {
    const seen = new Set<string>()
    let current: string | null = candidateId
    while (current) {
      if (current === ancestorId) return true
      if (seen.has(current)) return false
      seen.add(current)
      current = (selectById.get(current) as PageRow | undefined)?.parent_id ?? null
    }
    return false
  }

  // `position` es un índice de inserción entre los hermanos del padre destino
  // (excluyendo la propia página): se recorta a [0, hermanos] y renumera ambos
  // padres para que las posiciones queden consecutivas.
  const move = (id: string, input: PageMoveInput): Page => {
    const page = getOrThrow(id)
    const parentId = input.parentId ?? null
    if (parentId !== null && !get(parentId)) throw new Error(`Page not found: ${parentId}`)
    if (parentId !== null && isDescendant(parentId, id)) {
      throw new Error(`Cannot move page ${id} into its own subtree`)
    }
    const run = db.transaction((): Page => {
      const oldParentId = page.parentId
      const siblingIds = orderedChildren(parentId, id).map((row) => row.id)
      const position = Math.max(0, Math.min(input.position, siblingIds.length))
      siblingIds.splice(position, 0, id)
      siblingIds.forEach((siblingId, index) => {
        if (siblingId === id) return
        const row = selectById.get(siblingId) as PageRow
        if (index !== row.position) updatePosition.run(index, siblingId)
      })
      if (oldParentId !== parentId) {
        orderedChildren(oldParentId, id).forEach((row, index) => {
          if (index !== row.position) updatePosition.run(index, row.id)
        })
      }
      return write({ ...page, parentId, position })
    })
    return run()
  }

  const removePage = (id: string): void => {
    remove.run(id)
  }

  return { list, get, create, rename, setIcon, move, remove: removePage }
}

export type PagesRepo = ReturnType<typeof createPagesRepo>
