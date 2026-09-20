import type Database from 'better-sqlite3'
import { parseContent } from '../../../shared/content'
import type {
  BlockType,
  SearchBlockResult,
  SearchPageResult,
  SearchResult
} from '../../../shared/types'

// Cubierto por tests/search.test.ts (mismo prebuild N-API que el resto de repos).

const LIKE_ESCAPE = '\\'

function likePattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (char) => `${LIKE_ESCAPE}${char}`)
  return `%${escaped}%`
}

interface PageMatchRow {
  id: string
  title: string
  icon: string | null
  updated_at: number
}

interface BlockMatchRow {
  id: string
  page_id: string
  type: string
  content: string
  updated_at: number
  page_title: string
  page_icon: string | null
}

export function createSearchRepo(db: Database.Database) {
  const selectPages = db.prepare(
    `SELECT id, title, icon, updated_at FROM pages
     WHERE title LIKE @pattern ESCAPE '${LIKE_ESCAPE}'
     ORDER BY updated_at DESC, position, created_at
     LIMIT @limit`
  )
  const selectBlocks = db.prepare(
    `SELECT b.id, b.page_id, b.type, b.content, b.updated_at,
            p.title AS page_title, p.icon AS page_icon
     FROM blocks b
     JOIN pages p ON p.id = b.page_id
     WHERE b.content LIKE @pattern ESCAPE '${LIKE_ESCAPE}'
     ORDER BY b.updated_at DESC, b.position
     LIMIT @limit`
  )

  const searchPages = (term: string, limit: number): SearchPageResult[] =>
    (selectPages.all({ pattern: likePattern(term), limit }) as PageMatchRow[]).map((row) => ({
      kind: 'page',
      pageId: row.id,
      title: row.title,
      icon: row.icon,
      updatedAt: row.updated_at
    }))

  const searchBlocks = (term: string, limit: number): SearchBlockResult[] => {
    const results: SearchBlockResult[] = []
    for (const row of selectBlocks.all({ pattern: likePattern(term), limit }) as BlockMatchRow[]) {
      const text = parseContent(row.content)
      if (text === '') continue
      results.push({
        kind: 'block',
        blockId: row.id,
        pageId: row.page_id,
        pageTitle: row.page_title,
        pageIcon: row.page_icon,
        blockType: row.type as BlockType,
        text,
        updatedAt: row.updated_at
      })
    }
    return results
  }

  const search = (term: string, limit = 20): SearchResult[] => {
    const trimmed = term.trim()
    if (trimmed === '' || limit <= 0) return []
    return [...searchPages(trimmed, limit), ...searchBlocks(trimmed, limit)]
  }

  return { search }
}

export type SearchRepo = ReturnType<typeof createSearchRepo>
