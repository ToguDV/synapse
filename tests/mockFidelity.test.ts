import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import vm from 'node:vm'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { createPagesRepo } from '../src/main/db/repositories/pages'
import { createBlocksRepo } from '../src/main/db/repositories/blocks'
import { createSearchRepo } from '../src/main/db/repositories/search'
import { collectDescendantIds as collectFromDomain } from '../src/shared/domain'
import { collectDescendantIds as collectFromPageTree } from '../src/renderer/src/store/pageTree'

// Conformance entre e2e/mock-api.js (segunda implementación del contrato Api,
// inyectada como script clásico sin resolución de módulos) y los repositorios
// reales. Si esta suite falla, el mock y la app divergieron: los E2E dejarían
// de ser un oráculo de la app. La semántica canónica vive en
// src/shared/domain.ts.

const MOCK_SOURCE = readFileSync(
  fileURLToPath(new URL('../e2e/mock-api.js', import.meta.url)),
  'utf8'
)
const MOCK_KEY = '__synapse_e2e_mock__'

interface SeedPage {
  id: string
  title: string
  parentId: string | null
  icon?: string | null
  position: number
  createdAt: number
  updatedAt: number
}

interface SeedBlock {
  id: string
  pageId: string
  content: string
  position: number
  type?: string
  indent?: number
  createdAt: number
  updatedAt: number
}

// El mock es JavaScript plano (corre como script clásico en el navegador).
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type MockApi = any

interface MockState {
  pages: SeedPage[]
  blocks: SeedBlock[]
  settings: Record<string, string>
  calls: unknown[][]
}

function createMock(seed?: { pages?: SeedPage[]; blocks?: SeedBlock[] }) {
  const storage = new Map<string, string>()
  const window: Record<string, unknown> = {}
  const sandbox = {
    window,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key)
    }
  }
  if (seed) {
    storage.set(
      MOCK_KEY,
      JSON.stringify({ pages: seed.pages ?? [], blocks: seed.blocks ?? [], settings: {} })
    )
  }
  vm.createContext(sandbox)
  vm.runInContext(MOCK_SOURCE, sandbox, { filename: 'mock-api.js' })
  return { api: window.api as MockApi, state: () => window.__mockState() as MockState }
}

function seedRepo(
  db: Database.Database,
  pages: SeedPage[],
  blocks: SeedBlock[] = []
): void {
  const insertPage = db.prepare(
    `INSERT INTO pages (id, title, parent_id, icon, position, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`
  )
  const insertBlock = db.prepare(
    `INSERT INTO blocks (id, page_id, type, content, position, indent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  db.transaction(() => {
    for (const page of pages) {
      insertPage.run(page.id, page.title, page.parentId, page.position, page.createdAt, page.updatedAt)
    }
    for (const block of blocks) {
      insertBlock.run(
        block.id,
        block.pageId,
        block.type ?? 'paragraph',
        block.content,
        block.position,
        block.indent ?? 0,
        block.createdAt,
        block.updatedAt
      )
    }
  })()
}

const pageShape = (pages: SeedPage[]) =>
  new Map(pages.map((page) => [page.id, { parentId: page.parentId, position: page.position }]))

const TREE_PAGES: SeedPage[] = [
  { id: 'p1', title: 'Root A', parentId: null, position: 0, createdAt: 1, updatedAt: 1 },
  { id: 'p2', title: 'Root B', parentId: null, position: 1, createdAt: 2, updatedAt: 2 },
  { id: 'p3', title: 'Moving', parentId: 'p1', position: 0, createdAt: 3, updatedAt: 3 },
  { id: 'p4', title: 'Sibling', parentId: 'p1', position: 1, createdAt: 4, updatedAt: 4 },
  { id: 'p5', title: 'Target', parentId: null, position: 2, createdAt: 5, updatedAt: 5 },
  { id: 'p6', title: 'First', parentId: 'p5', position: 0, createdAt: 6, updatedAt: 6 },
  { id: 'p7', title: 'Child', parentId: 'p1', position: 2, createdAt: 7, updatedAt: 7 },
  { id: 'p8', title: 'Grandchild', parentId: 'p7', position: 0, createdAt: 8, updatedAt: 8 }
]

const MOVE_SCENARIOS: Array<[string, string | null, number]> = [
  ['p2', null, 0], // reordena entre raíces
  ['p3', 'p5', 1], // cruza de padre con índice exacto
  ['p4', 'p5', 99], // cruza de padre recortando el índice
  ['p8', 'p1', 0] // descendiente profundo a la raíz
]

describe('conformance mock ↔ repositorio: pages.move', () => {
  it('produce el mismo árbol tras una secuencia de movimientos válidos', async () => {
    const db = openDatabase(':memory:')
    const repo = createPagesRepo(db)
    const mock = createMock({ pages: TREE_PAGES })
    seedRepo(db, TREE_PAGES)

    for (const [id, parentId, position] of MOVE_SCENARIOS) {
      await mock.api.pages.move(id, { parentId, position })
      repo.move(id, { parentId, position })
    }

    expect(pageShape(repo.list())).toEqual(pageShape(mock.state().pages))
    db.close()
  })

  it('rechaza con los mismos mensajes los movimientos inválidos', async () => {
    const db = openDatabase(':memory:')
    const repo = createPagesRepo(db)
    const mock = createMock({ pages: TREE_PAGES })
    seedRepo(db, TREE_PAGES)

    const invalid: Array<[string, string | null, number, RegExp]> = [
      ['no-existe', null, 0, /not found/i],
      ['p1', 'no-existe', 0, /not found/i],
      ['p1', 'p1', 0, /subtree/i],
      ['p1', 'p8', 0, /subtree/i]
    ]
    for (const [id, parentId, position, message] of invalid) {
      expect(() => repo.move(id, { parentId, position }), `repo: ${id}`).toThrow(message)
      await expect(
        mock.api.pages.move(id, { parentId, position }),
        `mock: ${id}`
      ).rejects.toThrow(message)
    }
    expect(pageShape(repo.list())).toEqual(pageShape(mock.state().pages))
    db.close()
  })
})

describe('conformance mock ↔ repositorio: remove en cascada', () => {
  it('borra el mismo conjunto de páginas y bloques', async () => {
    const blocks: SeedBlock[] = [
      {
        id: 'b1',
        pageId: 'p3',
        content: '{"text":"uno"}',
        position: 0,
        createdAt: 10,
        updatedAt: 10
      },
      {
        id: 'b2',
        pageId: 'p8',
        content: '{"text":"dos"}',
        position: 0,
        createdAt: 11,
        updatedAt: 11
      }
    ]
    const db = openDatabase(':memory:')
    const repo = createPagesRepo(db)
    const mock = createMock({ pages: TREE_PAGES, blocks })
    seedRepo(db, TREE_PAGES, blocks)

    await mock.api.pages.remove('p1')
    repo.remove('p1')

    // p3, p4, p7 y p8 son descendientes de p1: sus bloques (b1 y b2) también
    // desaparecen en cascada. Solo quedan p5 y p6.
    const repoBlocks = (
      db.prepare('SELECT id FROM blocks ORDER BY id').all() as Array<{ id: string }>
    ).map((row) => row.id)
    expect(repoBlocks).toEqual([])
    expect(pageShape(repo.list())).toEqual(pageShape(mock.state().pages))
    expect(mock.state().blocks).toEqual([])
    db.close()
  })
})

describe('conformance mock ↔ repositorio: search', () => {
  const pages: SeedPage[] = [
    { id: 'p1', title: 'Test', parentId: null, position: 0, createdAt: 1, updatedAt: 5 },
    { id: 'p2', title: 'Canción', parentId: null, position: 1, createdAt: 2, updatedAt: 3 },
    { id: 'p3', title: 'CANCIÓN', parentId: null, position: 2, createdAt: 3, updatedAt: 4 }
  ]
  const blocks: SeedBlock[] = [
    {
      id: 'b1',
      pageId: 'p1',
      content: '{"text":"hola mundo"}',
      position: 0,
      createdAt: 10,
      updatedAt: 2
    },
    {
      id: 'b2',
      pageId: 'p2',
      content: '{"text":"Hola Canción ñandú"}',
      position: 0,
      createdAt: 11,
      updatedAt: 1
    }
  ]

  const terms = [
    '',
    '   ',
    'test',
    'TEST',
    'Test',
    'canción',
    'Canción',
    'CANCIÓN',
    'cancion',
    'hola',
    'HOLA',
    'ñandú',
    'ÑANDÚ',
    'zzz'
  ]

  it('devuelve resultados idénticos (orden, contenido y límite)', async () => {
    const db = openDatabase(':memory:')
    const repo = createSearchRepo(db)
    const mock = createMock({ pages, blocks })
    seedRepo(db, pages, blocks)

    for (const term of terms) {
      expect(await mock.api.search.query(term), `mock sin límite: "${term}"`).toEqual(
        repo.search(term)
      )
      expect(await mock.api.search.query(term, 1), `mock con límite: "${term}"`).toEqual(
        repo.search(term, 1)
      )
    }
    db.close()
  })
})

describe('conformance mock ↔ repositorio: orden de listas', () => {
  it('ordena blocks por posición y createdAt', async () => {
    const db = openDatabase(':memory:')
    const repo = createBlocksRepo(db)
    const blocks: SeedBlock[] = [
      { id: 'b1', pageId: 'p1', content: '{"text":"a"}', position: 0, createdAt: 20, updatedAt: 20 },
      { id: 'b2', pageId: 'p1', content: '{"text":"b"}', position: 0, createdAt: 10, updatedAt: 10 },
      { id: 'b3', pageId: 'p1', content: '{"text":"c"}', position: 1, createdAt: 5, updatedAt: 5 }
    ]
    const mock = createMock({
      pages: [{ id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 }],
      blocks
    })
    seedRepo(
      db,
      [{ id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 }],
      blocks
    )

    expect((await mock.api.blocks.list('p1')).map((b: SeedBlock) => b.id)).toEqual(
      repo.list('p1').map((block) => block.id)
    )
    db.close()
  })
})

describe('conformance mock ↔ repositorio: sync de bloques', () => {
  const projectRow = (row: SeedBlock) => ({
    id: row.id,
    pageId: row.pageId,
    type: row.type,
    content: row.content,
    position: row.position,
    indent: row.indent
  })
  const project = (rows: SeedBlock[]) =>
    [...rows]
      .sort((a, b) => a.position - b.position)
      .map(projectRow)

  it('sync aplica removes, upserts nuevos, updates y positions en una sola llamada', async () => {
    const db = openDatabase(':memory:')
    const repo = createBlocksRepo(db)
    const pages: SeedPage[] = [
      { id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 },
      { id: 'p2', title: 'Q', parentId: null, position: 1, createdAt: 2, updatedAt: 2 }
    ]
    const blocks: SeedBlock[] = [
      { id: 'b1', pageId: 'p1', content: '{"text":"a"}', position: 0, createdAt: 1, updatedAt: 1 },
      { id: 'b2', pageId: 'p1', content: '{"text":"b"}', position: 1, createdAt: 2, updatedAt: 2 },
      { id: 'b3', pageId: 'p1', content: '{"text":"c"}', position: 2, createdAt: 3, updatedAt: 3 },
      { id: 'o1', pageId: 'p2', content: '{"text":"otra"}', position: 0, createdAt: 4, updatedAt: 4 }
    ]
    const mock = createMock({ pages, blocks })
    seedRepo(db, pages, blocks)

    const input = {
      upserts: [
        { id: 'b2', type: 'heading' as const, content: '{"text":"b2"}', position: 0, indent: 1 },
        { id: 'n1', type: 'paragraph' as const, content: '{"text":"nuevo"}', position: 1, indent: 0 },
        { id: 'b1', type: 'paragraph' as const, content: '{"text":"a2"}', position: 2, indent: 1 }
      ],
      removeIds: ['b3']
    }

    const repoRows = repo.sync('p1', input)
    const mockRows = await mock.api.blocks.sync('p1', input)

    expect(project(mockRows)).toEqual(project(repoRows))
    expect(project(mockRows)).toEqual([
      { id: 'b2', pageId: 'p1', type: 'heading', content: '{"text":"b2"}', position: 0, indent: 1 },
      { id: 'n1', pageId: 'p1', type: 'paragraph', content: '{"text":"nuevo"}', position: 1, indent: 0 },
      { id: 'b1', pageId: 'p1', type: 'paragraph', content: '{"text":"a2"}', position: 2, indent: 1 }
    ])
    expect((await mock.api.blocks.list('p2')).map((b: SeedBlock) => b.id)).toEqual(['o1'])
    db.close()
  })

  it('sync ignora removeIds desconocidos y rechaza upserts de otra página', async () => {
    const db = openDatabase(':memory:')
    const repo = createBlocksRepo(db)
    const pages: SeedPage[] = [
      { id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 },
      { id: 'p2', title: 'Q', parentId: null, position: 1, createdAt: 2, updatedAt: 2 }
    ]
    const blocks: SeedBlock[] = [
      { id: 'b1', pageId: 'p1', content: '{"text":"a"}', position: 0, createdAt: 1, updatedAt: 1 },
      { id: 'o1', pageId: 'p2', content: '{"text":"otra"}', position: 0, createdAt: 2, updatedAt: 2 }
    ]
    const mock = createMock({ pages, blocks })
    seedRepo(db, pages, blocks)

    await mock.api.blocks.sync('p1', { upserts: [], removeIds: ['no-existe'] })
    expect(() => repo.sync('p1', { upserts: [], removeIds: ['no-existe'] })).not.toThrow()
    expect((await mock.api.blocks.list('p1')).map((b: SeedBlock) => b.id)).toEqual(['b1'])

    const crossPage = {
      upserts: [
        { id: 'o1', type: 'paragraph' as const, content: '{"text":"x"}', position: 0, indent: 0 }
      ],
      removeIds: []
    }
    await expect(mock.api.blocks.sync('p1', crossPage)).rejects.toThrow(/another page/i)
    expect(() => repo.sync('p1', crossPage)).toThrow(/another page/i)
    db.close()
  })
})

describe('fidelidad del mock (regresiones propias)', () => {
  it('genera ids de bloques únicos aunque se eliminen filas', async () => {
    const mock = createMock({
      pages: [{ id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 }]
    })
    const first = await mock.api.blocks.create({ pageId: 'p1' })
    const second = await mock.api.blocks.create({ pageId: 'p1' })
    await mock.api.blocks.remove(first.id)
    const third = await mock.api.blocks.create({ pageId: 'p1' })

    expect(new Set([first.id, second.id, third.id]).size).toBe(3)
  })

  it('genera ids de páginas únicos', async () => {
    const mock = createMock({
      pages: [{ id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 }]
    })
    const created = [
      await mock.api.pages.create(),
      await mock.api.pages.create(),
      await mock.api.pages.create()
    ]
    expect(new Set(created.map((page: SeedPage) => page.id)).size).toBe(3)
  })

  it('blocks.update aplica solo las claves definidas y lanza si no existe', async () => {
    const mock = createMock({
      pages: [{ id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 }],
      blocks: [
        {
          id: 'b1',
          pageId: 'p1',
          content: '{"text":"a"}',
          position: 0,
          indent: 2,
          createdAt: 10,
          updatedAt: 10
        }
      ]
    })

    const updated = await mock.api.blocks.update('b1', { type: 'heading' })
    expect(updated).toMatchObject({ type: 'heading', content: '{"text":"a"}', indent: 2 })

    const untouched = await mock.api.blocks.update('b1', {})
    expect(untouched).toMatchObject({ type: 'heading', content: '{"text":"a"}', indent: 2 })

    await expect(mock.api.blocks.update('no-existe', { indent: 1 })).rejects.toThrow(/not found/i)
  })

  it('rename y setIcon lanzan si la página no existe', async () => {
    const mock = createMock({
      pages: [{ id: 'p1', title: 'P', parentId: null, position: 0, createdAt: 1, updatedAt: 1 }]
    })
    await expect(mock.api.pages.rename('no-existe', 'X')).rejects.toThrow(/not found/i)
    await expect(mock.api.pages.setIcon('no-existe', '📝')).rejects.toThrow(/not found/i)
  })

  it('remove en cascada incluye los descendientes en la llamada', async () => {
    const mock = createMock({ pages: TREE_PAGES })
    await mock.api.pages.remove('p1')
    const removeCall = mock
      .state()
      .calls.find((call: unknown[]) => call[0] === 'page-remove') as unknown[] | undefined
    expect(removeCall?.[2]).toEqual(['p1', ...collectFromDomain(TREE_PAGES, 'p1')].sort())
  })
})

describe('puente de módulos', () => {
  it('pageTree re-exporta collectDescendantIds desde shared/domain', () => {
    expect(collectFromPageTree).toBe(collectFromDomain)
  })
})
