import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { createPagesRepo } from '../src/main/db/repositories/pages'
import { createBlocksRepo } from '../src/main/db/repositories/blocks'
import { createSearchRepo } from '../src/main/db/repositories/search'

let db: Database.Database

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

function seed() {
  const pages = createPagesRepo(db)
  const blocks = createBlocksRepo(db)
  const search = createSearchRepo(db)
  const notes = pages.create({ title: 'Notas de viaje' })
  const recipes = pages.create({ title: 'Recetas' })
  const icon = pages.create({ title: 'Ideas' })
  pages.setIcon(icon.id, '💡')
  const note = blocks.create({
    pageId: notes.id,
    content: '{"text":"Comprar pan y café en el mercado"}'
  })
  blocks.create({ pageId: notes.id, type: 'heading', content: '{"text":"Itinerario"}' })
  blocks.create({ pageId: recipes.id, content: '{"text":"Mezclar 100% cacao"}' })
  return { pages, blocks, search, notes, recipes, icon, note }
}

describe('search repo', () => {
  it('encuentra páginas por título sin distinguir mayúsculas', () => {
    const { search, notes } = seed()

    const results = search.search('viaje')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ kind: 'page', pageId: notes.id, title: 'Notas de viaje' })
  })

  it('encuentra bloques por contenido con su página y omite vacíos', () => {
    const { search, notes, note } = seed()

    const results = search.search('pan')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      kind: 'block',
      blockId: note.id,
      pageId: notes.id,
      pageTitle: 'Notas de viaje',
      blockType: 'paragraph',
      text: 'Comprar pan y café en el mercado'
    })
  })

  it('devuelve páginas antes que bloques e incluye el icono de la página', () => {
    const pages = createPagesRepo(db)
    const blocks = createBlocksRepo(db)
    const search = createSearchRepo(db)
    const page = pages.create({ title: 'Zeta' })
    pages.setIcon(page.id, '💡')
    blocks.create({ pageId: page.id, content: '{"text":"Zeta en un bloque"}' })

    const results = search.search('zeta')

    expect(results.map((result) => result.kind)).toEqual(['page', 'block'])
    expect(results[0]).toMatchObject({ kind: 'page', pageId: page.id, icon: '💡' })
    expect(results[1]).toMatchObject({ kind: 'block', pageId: page.id, pageIcon: '💡' })
  })

  it('escapa los comodines % y _ de LIKE', () => {
    const { search } = seed()

    expect(search.search('100%')).toHaveLength(1)
    expect(search.search('100_')).toEqual([])
    expect(search.search('%').map((result) => result.kind)).toEqual(['block'])
  })

  it('ignora términos vacíos o en blanco y respeta el límite por tipo', () => {
    const { search } = seed()

    expect(search.search('')).toEqual([])
    expect(search.search('   ')).toEqual([])
    expect(search.search('e', 1)).toHaveLength(2)
  })
})
