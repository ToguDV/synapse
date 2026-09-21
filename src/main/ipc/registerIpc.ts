import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import {
  BLOCK_TYPES,
  type BlockCreateInput,
  type BlockType,
  type BlockUpdatePatch,
  type PageCreateInput
} from '../../shared/types'
import { createPagesRepo } from '../db/repositories/pages'
import { createBlocksRepo } from '../db/repositories/blocks'
import { createSearchRepo } from '../db/repositories/search'
import { createSettingsRepo } from '../db/repositories/settings'
import { applyThemePreference } from '../theme'
import { THEME_PREFERENCE_KEY } from '../../shared/theme'

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`)
  return value
}

function requireId(value: unknown, name = 'id'): string {
  const id = requireString(value, name)
  if (id.length === 0) throw new Error(`${name} cannot be empty`)
  return id
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
}

function requireBlockType(value: unknown): BlockType {
  if (typeof value !== 'string' || !BLOCK_TYPES.includes(value as BlockType)) {
    throw new Error(`Invalid block type: ${String(value)}`)
  }
  return value as BlockType
}

function parsePageCreateInput(value: unknown): PageCreateInput {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object') throw new Error('Invalid page input')
  const input = value as Record<string, unknown>
  const parsed: PageCreateInput = {}
  if (input.title !== undefined) parsed.title = requireString(input.title, 'title')
  if (input.parentId !== undefined) {
    parsed.parentId = input.parentId === null ? null : requireId(input.parentId, 'parentId')
  }
  return parsed
}

function parseBlockCreateInput(value: unknown): BlockCreateInput {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid block input')
  const input = value as Record<string, unknown>
  const parsed: BlockCreateInput = { pageId: requireId(input.pageId, 'pageId') }
  if (input.id !== undefined) parsed.id = requireId(input.id)
  if (input.type !== undefined) parsed.type = requireBlockType(input.type)
  if (input.content !== undefined) parsed.content = requireString(input.content, 'content')
  if (input.position !== undefined) parsed.position = requireNumber(input.position, 'position')
  if (input.indent !== undefined) parsed.indent = requireNumber(input.indent, 'indent')
  return parsed
}

function parseBlockPatch(value: unknown): BlockUpdatePatch {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid block patch')
  const patch = value as Record<string, unknown>
  const parsed: BlockUpdatePatch = {}
  if (patch.type !== undefined) parsed.type = requireBlockType(patch.type)
  if (patch.content !== undefined) parsed.content = requireString(patch.content, 'content')
  if (patch.indent !== undefined) parsed.indent = requireNumber(patch.indent, 'indent')
  return parsed
}

export function registerIpc(db: Database.Database): void {
  const pages = createPagesRepo(db)
  const blocks = createBlocksRepo(db)
  const search = createSearchRepo(db)
  const settings = createSettingsRepo(db)

  ipcMain.handle('pages:list', () => pages.list())
  ipcMain.handle('pages:get', (_event, id: unknown) => pages.get(requireId(id)))
  ipcMain.handle('pages:create', (_event, input: unknown) => pages.create(parsePageCreateInput(input)))
  ipcMain.handle('pages:rename', (_event, payload: unknown) => {
    const { id, title } = payload as Record<string, unknown>
    return pages.rename(requireId(id), requireString(title, 'title'))
  })
  ipcMain.handle('pages:setIcon', (_event, payload: unknown) => {
    const { id, icon } = payload as Record<string, unknown>
    return pages.setIcon(requireId(id), icon === null ? null : requireString(icon, 'icon'))
  })
  ipcMain.handle('pages:move', (_event, payload: unknown) => {
    const { id, parentId, position } = payload as Record<string, unknown>
    return pages.move(requireId(id), {
      parentId: parentId === null ? null : requireId(parentId, 'parentId'),
      position: requireNumber(position, 'position')
    })
  })
  ipcMain.handle('pages:remove', (_event, id: unknown) => pages.remove(requireId(id)))

  ipcMain.handle('blocks:list', (_event, pageId: unknown) => blocks.list(requireId(pageId, 'pageId')))
  ipcMain.handle('blocks:create', (_event, input: unknown) => blocks.create(parseBlockCreateInput(input)))
  ipcMain.handle('blocks:update', (_event, payload: unknown) => {
    const { id, patch } = payload as Record<string, unknown>
    return blocks.update(requireId(id), parseBlockPatch(patch))
  })
  ipcMain.handle('blocks:reorder', (_event, payload: unknown) => {
    const { pageId, orderedIds } = payload as Record<string, unknown>
    if (!Array.isArray(orderedIds)) throw new Error('orderedIds must be an array')
    return blocks.reorder(
      requireId(pageId, 'pageId'),
      orderedIds.map((id) => requireId(id, 'orderedIds[]'))
    )
  })
  ipcMain.handle('blocks:remove', (_event, id: unknown) => blocks.remove(requireId(id)))

  ipcMain.handle('search:query', (_event, payload: unknown) => {
    const { term, limit } = (payload ?? {}) as Record<string, unknown>
    const text = requireString(term, 'term').trim()
    if (text.length === 0) return []
    const parsedLimit =
      limit === undefined ? 20 : Math.min(50, Math.max(1, Math.floor(requireNumber(limit, 'limit'))))
    return search.search(text, parsedLimit)
  })

  ipcMain.handle('settings:get', (_event, key: unknown) => settings.get(requireId(key, 'key')))
  ipcMain.handle('settings:set', (_event, payload: unknown) => {
    const { key, value } = payload as Record<string, unknown>
    const parsedKey = requireId(key, 'key')
    const parsedValue = requireString(value, 'value')
    settings.set(parsedKey, parsedValue)
    if (parsedKey === THEME_PREFERENCE_KEY) applyThemePreference(parsedValue)
  })
}
