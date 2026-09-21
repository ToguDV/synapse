import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { createPagesRepo } from '../src/main/db/repositories/pages'
import { createBlocksRepo } from '../src/main/db/repositories/blocks'

// better-sqlite3 v13 usa prebuilds N-API, así que el mismo binario carga bajo
// Node (vitest) y bajo Electron: no hace falta ELECTRON_RUN_AS_NODE.

let db: Database.Database

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

describe('pages repo', () => {
  it('crea páginas con posición incremental por padre', () => {
    const pages = createPagesRepo(db)

    const first = pages.create({ title: 'Primera' })
    const second = pages.create()
    const childA = pages.create({ parentId: first.id })
    const childB = pages.create({ parentId: first.id })

    expect(first).toMatchObject({ title: 'Primera', parentId: null, icon: null, position: 0 })
    expect(first.id).toBeTruthy()
    expect(second).toMatchObject({ title: '', position: 1 })
    expect(childA.position).toBe(0)
    expect(childB.position).toBe(1)
  })

  it('lista en orden de posición', () => {
    const pages = createPagesRepo(db)

    const a = pages.create({ title: 'A' })
    const b = pages.create({ title: 'B' })
    const c = pages.create({ title: 'C' })
    pages.move(a.id, { parentId: null, position: 5 })

    expect(pages.list().map((page) => page.id)).toEqual([b.id, c.id, a.id])
  })

  it('renombra y asigna icono', () => {
    const pages = createPagesRepo(db)
    const page = pages.create({ title: 'Vieja' })

    expect(pages.rename(page.id, 'Nueva').title).toBe('Nueva')
    expect(pages.setIcon(page.id, '📝').icon).toBe('📝')
    expect(pages.setIcon(page.id, null).icon).toBeNull()
    expect(pages.get(page.id)?.title).toBe('Nueva')
  })

  it('mueve una página a otro padre y posición', () => {
    const pages = createPagesRepo(db)
    const parent = pages.create({ title: 'Padre' })
    const page = pages.create({ title: 'Hija' })

    const moved = pages.move(page.id, { parentId: parent.id, position: 3 })

    expect(moved).toMatchObject({ parentId: parent.id, position: 3 })
  })

  it('devuelve null y lanza al operar sobre una página inexistente', () => {
    const pages = createPagesRepo(db)

    expect(pages.get('no-existe')).toBeNull()
    expect(() => pages.rename('no-existe', 'X')).toThrow(/not found/i)
    expect(() => pages.move('no-existe', { parentId: null, position: 0 })).toThrow()
  })

  it('elimina en cascada páginas hijas y bloques', () => {
    const pages = createPagesRepo(db)
    const blocks = createBlocksRepo(db)

    const parent = pages.create({ title: 'Padre' })
    const child = pages.create({ parentId: parent.id, title: 'Hija' })
    const grandchild = pages.create({ parentId: child.id })
    blocks.create({ pageId: child.id, content: '{"text":"hola"}' })

    pages.remove(parent.id)

    expect(pages.get(parent.id)).toBeNull()
    expect(pages.get(child.id)).toBeNull()
    expect(pages.get(grandchild.id)).toBeNull()
    expect(blocks.list(child.id)).toEqual([])
    expect(pages.list()).toEqual([])
  })
})

describe('blocks repo', () => {
  function withPage() {
    const pages = createPagesRepo(db)
    const blocks = createBlocksRepo(db)
    const page = pages.create({ title: 'Página' })
    return { page, blocks }
  }

  it('crea bloques con valores por defecto y posición incremental', () => {
    const { page, blocks } = withPage()

    const first = blocks.create({ pageId: page.id })
    const second = blocks.create({ pageId: page.id })

    expect(first).toMatchObject({
      pageId: page.id,
      type: 'paragraph',
      content: '{"text":""}',
      position: 0,
      indent: 0
    })
    expect(second.position).toBe(1)
  })

  it('acepta id, tipo, contenido, posición e indent explícitos', () => {
    const { page, blocks } = withPage()

    const block = blocks.create({
      id: 'id-del-renderer',
      pageId: page.id,
      type: 'heading',
      content: '{"text":"Título"}',
      position: 5,
      indent: 2
    })

    expect(block).toMatchObject({
      id: 'id-del-renderer',
      type: 'heading',
      content: '{"text":"Título"}',
      position: 5,
      indent: 2
    })
    expect(blocks.get('id-del-renderer')?.id).toBe('id-del-renderer')
  })

  it('lista bloques de una página en orden de posición', () => {
    const { page, blocks } = withPage()
    const other = withPage()

    const a = blocks.create({ pageId: page.id, content: '{"text":"a"}' })
    const b = blocks.create({ pageId: page.id, content: '{"text":"b"}' })
    const c = blocks.create({ pageId: page.id, content: '{"text":"c"}' })
    blocks.create({ pageId: other.page.id })

    blocks.reorder(page.id, [c.id, a.id, b.id])

    expect(blocks.list(page.id).map((block) => block.id)).toEqual([c.id, a.id, b.id])
    expect(blocks.list(other.page.id)).toHaveLength(1)
  })

  it('actualiza type, content e indent, y devuelve el bloque si el patch está vacío', () => {
    const { page, blocks } = withPage()
    const block = blocks.create({ pageId: page.id })

    const updated = blocks.update(block.id, {
      type: 'todo',
      content: '{"text":"comprar pan"}',
      indent: 1
    })

    expect(updated).toMatchObject({ type: 'todo', content: '{"text":"comprar pan"}', indent: 1 })
    expect(blocks.update(block.id, {})).toEqual(updated)
    expect(() => blocks.update('no-existe', { indent: 1 })).toThrow(/not found/i)
  })

  it('reordena asignando posiciones consecutivas desde 0', () => {
    const { page, blocks } = withPage()
    const a = blocks.create({ pageId: page.id })
    const b = blocks.create({ pageId: page.id })
    const c = blocks.create({ pageId: page.id })

    const result = blocks.reorder(page.id, [b.id, c.id, a.id])

    expect(result.map((block) => block.id)).toEqual([b.id, c.id, a.id])
    expect(result.map((block) => block.position)).toEqual([0, 1, 2])
  })

  it('elimina bloques', () => {
    const { page, blocks } = withPage()
    const block = blocks.create({ pageId: page.id })

    blocks.remove(block.id)

    expect(blocks.get(block.id)).toBeNull()
    expect(blocks.list(page.id)).toEqual([])
  })
})
