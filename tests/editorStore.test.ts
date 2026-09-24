import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../src/renderer/src/editor/editorStore'
import type {
  Block,
  BlockCreateInput,
  BlockSyncInput,
  BlockUpdatePatch
} from '../src/shared/types'

function makeBlock(partial: Partial<Block> & { id: string }): Block {
  return {
    pageId: 'p1',
    type: 'paragraph',
    content: '{"text":""}',
    position: 0,
    indent: 0,
    createdAt: 1,
    updatedAt: 1,
    ...partial
  }
}

function installApi(initial: Block[] = []) {
  const db = new Map<string, Block>(initial.map((block) => [block.id, block]))
  const blocks = {
    list: vi.fn(async (pageId: string) =>
      [...db.values()]
        .filter((block) => block.pageId === pageId)
        .sort((a, b) => a.position - b.position)
    ),
    create: vi.fn(async (input: BlockCreateInput) => {
      const created = makeBlock({
        id: input.id ?? `gen-${db.size}`,
        pageId: input.pageId,
        type: input.type ?? 'paragraph',
        content: input.content ?? '{"text":""}',
        position: input.position ?? db.size,
        indent: input.indent ?? 0
      })
      db.set(created.id, created)
      return created
    }),
    update: vi.fn(async (id: string, patch: BlockUpdatePatch) => {
      const block = db.get(id)
      if (!block) throw new Error(`Bloque no encontrado: ${id}`)
      const updated = { ...block, ...patch }
      db.set(id, updated)
      return updated
    }),
    reorder: vi.fn(async (pageId: string, orderedIds: string[]) => {
      orderedIds.forEach((id, index) => {
        const block = db.get(id)
        if (block) db.set(id, { ...block, position: index })
      })
      return [...db.values()]
        .filter((block) => block.pageId === pageId)
        .sort((a, b) => a.position - b.position)
    }),
    remove: vi.fn(async (id: string) => {
      db.delete(id)
    }),
    sync: vi.fn(async (pageId: string, input: BlockSyncInput) => {
      for (const id of input.removeIds) db.delete(id)
      for (const upsert of input.upserts) {
        const existing = db.get(upsert.id)
        if (!existing) {
          db.set(
            upsert.id,
            makeBlock({
              id: upsert.id,
              pageId,
              type: upsert.type,
              content: upsert.content,
              position: upsert.position,
              indent: upsert.indent
            })
          )
          continue
        }
        if (existing.pageId !== pageId) {
          throw new Error(`Block ${upsert.id} belongs to another page`)
        }
        db.set(upsert.id, {
          ...existing,
          type: upsert.type,
          content: upsert.content,
          indent: upsert.indent,
          position: upsert.position,
          updatedAt: 2
        })
      }
      return [...db.values()]
        .filter((block) => block.pageId === pageId)
        .sort((a, b) => a.position - b.position)
    })
  }
  vi.stubGlobal('window', { api: { blocks } })
  return { blocks, db }
}

const syncCall = (blocks: ReturnType<typeof installApi>['blocks']) =>
  blocks.sync as ReturnType<typeof vi.fn>

const state = () => useEditorStore.getState()
const load = () => useEditorStore.getState().loadPage('p1')
const advance = (ms = 500) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
  useEditorStore.setState({
    pageId: null,
    blocks: [],
    loading: false,
    loadError: false,
    activeBlockId: null,
    focusRequest: null,
    selectedIds: [],
    selectionAnchor: null,
    selectionFocus: null,
    past: [],
    future: []
  })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('editorStore · carga', () => {
  it('carga los bloques parseando el content JSON', async () => {
    installApi([
      makeBlock({ id: 'a', content: '{"text":"Hola"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"mundo"}', position: 1 })
    ])

    await load()

    expect(state().blocks).toEqual([
      { id: 'a', type: 'paragraph', text: 'Hola', indent: 0 },
      { id: 'b', type: 'paragraph', text: 'mundo', indent: 0 }
    ])
    expect(state().loading).toBe(false)
  })

  it('crea un bloque vacío cuando la página no tiene bloques', async () => {
    const { blocks } = installApi([])

    await load()

    expect(blocks.create).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'p1' }))
    expect(state().blocks).toHaveLength(1)
    expect(state().blocks[0].text).toBe('')
  })

  it('tolera content corrupto', async () => {
    installApi([makeBlock({ id: 'a', content: 'no-json' })])

    await load()

    expect(state().blocks[0].text).toBe('')
  })

  it('marca loadError cuando la carga falla y lo limpia al reintentar', async () => {
    const { blocks } = installApi([])
    blocks.list.mockRejectedValueOnce(new Error('db caída'))

    await expect(load()).rejects.toThrow('db caída')

    expect(state().loadError).toBe(true)
    expect(state().loading).toBe(false)

    await load()

    expect(state().loadError).toBe(false)
    expect(state().loading).toBe(false)
    expect(state().blocks).toHaveLength(1)
  })

  it('marca loadError cuando la creación del bloque por defecto falla', async () => {
    const { blocks } = installApi([])
    blocks.create.mockRejectedValueOnce(new Error('db caída'))

    await expect(load()).rejects.toThrow('db caída')

    expect(state().loadError).toBe(true)
    expect(state().loading).toBe(false)
    expect(state().blocks).toHaveLength(0)
  })

  it('reset limpia el loadError', async () => {
    const { blocks } = installApi([])
    blocks.list.mockRejectedValueOnce(new Error('db caída'))

    await expect(load()).rejects.toThrow('db caída')
    expect(state().loadError).toBe(true)

    state().reset()

    expect(state().loadError).toBe(false)
  })
})

describe('editorStore · cancelLoad', () => {
  it('cancelLoad impide cargar (y crear bloque) en una página ya borrada', async () => {
    const { blocks } = installApi([])

    const pending = load()
    state().cancelLoad('p1')
    await pending

    expect(blocks.list).not.toHaveBeenCalled()
    expect(blocks.create).not.toHaveBeenCalled()
    expect(state().pageId).toBeNull()
  })

  it('cancelLoad a mitad de carga evita el bloque inicial y limpia el estado', async () => {
    const { blocks } = installApi([])
    let release: () => void = () => {}
    blocks.list.mockImplementationOnce(
      () =>
        new Promise<Block[]>((resolve) => {
          release = () => resolve([])
        })
    )

    const pending = load()
    await vi.advanceTimersByTimeAsync(0)
    expect(blocks.list).toHaveBeenCalledWith('p1')

    state().cancelLoad('p1')
    release()
    await pending

    expect(blocks.create).not.toHaveBeenCalled()
    expect(state().pageId).toBeNull()
    expect(state().loading).toBe(false)
  })

  it('volver a cargar la misma página reactiva la carga cancelada', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])

    const cancelled = load()
    state().cancelLoad('p1')
    await cancelled

    await load()

    expect(state().pageId).toBe('p1')
    expect(state().blocks[0].text).toBe('Hola')
    expect(blocks.list).toHaveBeenCalledTimes(1)
  })
})

describe('editorStore · focusBlock', () => {
  it('enfoca al instante si la página ya está cargada', async () => {
    installApi([makeBlock({ id: 'a' })])
    await load()

    state().focusBlock('p1', 'a')

    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 0 })
  })

  it('aplica el foco pendiente al terminar la carga de su página', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])

    state().focusBlock('p1', 'a')
    expect(state().focusRequest).toBeNull()

    await load()

    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 0 })
  })

  it('no aplica un foco pendiente al cargar otra página', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])

    state().focusBlock('p1', 'a')
    await state().loadPage('p2')

    expect(state().focusRequest).toBeNull()
  })
})

describe('editorStore · edición', () => {
  it('setText actualiza el estado y guarda con debounce', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a' })])
    await load()

    state().setText('a', 'Hola')
    expect(state().blocks[0].text).toBe('Hola')
    expect(blocks.sync).not.toHaveBeenCalled()

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"Hola"}', position: 0, indent: 0 }
      ],
      removeIds: []
    })
  })

  it('splitAt inserta bloque, lo persiste y enfoca el nuevo', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"hola mundo"}' })])
    await load()

    state().splitAt('a', 5)
    const created = state().blocks[1]

    expect(state().blocks.map((block) => block.text)).toEqual(['hola ', 'mundo'])
    expect(state().focusRequest).toMatchObject({ blockId: created.id, caret: 0 })

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"hola "}', position: 0, indent: 0 },
        { id: created.id, type: 'paragraph', content: '{"text":"mundo"}', position: 1, indent: 0 }
      ],
      removeIds: []
    })
  })

  it('mergeBackward fusiona y elimina el bloque en la base', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"hola "}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"mundo"}', position: 1 })
    ])
    await load()

    state().mergeBackward('b')

    expect(state().blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'hola mundo', indent: 0 }])
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 5 })

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"hola mundo"}', position: 0, indent: 0 }
      ],
      removeIds: ['b']
    })
  })

  it('mergeForward fusiona el siguiente en el actual', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"hola "}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"mundo"}', position: 1 })
    ])
    await load()

    state().mergeForward('a')

    expect(state().blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'hola mundo', indent: 0 }])
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 5 })

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"hola mundo"}', position: 0, indent: 0 }
      ],
      removeIds: ['b']
    })
  })

  it('Backspace sobre bloque vacío no párrafo lo convierte en párrafo', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', type: 'heading' })])
    await load()

    state().mergeBackward('a')

    expect(state().blocks[0].type).toBe('paragraph')
    expect(blocks.sync).not.toHaveBeenCalled()
  })

  it('indentBlock y outdentBlock respetan las reglas', async () => {
    installApi([makeBlock({ id: 'a', position: 0 }), makeBlock({ id: 'b', position: 1 })])
    await load()

    state().indentBlock('a')
    expect(state().blocks[0].indent).toBe(0)

    state().indentBlock('b')
    expect(state().blocks[1].indent).toBe(1)

    state().indentBlock('b')
    expect(state().blocks[1].indent).toBe(1)

    state().outdentBlock('b')
    expect(state().blocks[1].indent).toBe(0)
  })

  it('indentación y reordenamientos se persisten', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 })
    ])
    await load()

    state().indentBlock('b')
    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"uno"}', position: 0, indent: 0 },
        { id: 'b', type: 'paragraph', content: '{"text":"dos"}', position: 1, indent: 1 }
      ],
      removeIds: []
    })
  })

  it('focusSibling mueve el caret entre bloques', async () => {
    installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 })
    ])
    await load()

    state().focusSibling('a', 1)
    expect(state().focusRequest).toMatchObject({ blockId: 'b', caret: 0 })

    state().focusSibling('b', -1)
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 3 })

    state().focusSibling('a', -1)
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 3 })
  })
})

describe('editorStore · undo/redo', () => {
  it('agrupa el tecleo seguido en un solo paso', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])
    await load()

    state().setText('a', 'Hola!')
    state().setText('a', 'Hola!!')
    expect(state().past).toHaveLength(1)

    state().undo()
    expect(state().blocks[0].text).toBe('Hola')

    state().redo()
    expect(state().blocks[0].text).toBe('Hola!!')
  })

  it('deshace y rehace un split', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"uno dos"}' })])
    await load()

    state().splitAt('a', 4)
    expect(state().blocks).toHaveLength(2)

    state().undo()
    expect(state().blocks).toHaveLength(1)
    expect(state().blocks[0].text).toBe('uno dos')

    state().redo()
    expect(state().blocks).toHaveLength(2)
    expect(state().blocks.map((block) => block.text)).toEqual(['uno ', 'dos'])
  })

  it('reemplaza un rango entre bloques como una operación única de undo/redo', async () => {
    installApi([
      makeBlock({ id: 'a', content: '{"text":"abcd"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"efgh"}', position: 1 }),
      makeBlock({ id: 'c', content: '{"text":"ijkl"}', position: 2 })
    ])
    await load()
    state().selectBlock('b', 'toggle')

    state().replaceTextRange(
      { start: { blockId: 'a', offset: 1 }, end: { blockId: 'c', offset: 2 } },
      'X'
    )

    expect(state().blocks.map((block) => block.text)).toEqual(['aX', '', 'kl'])
    expect(state().selectedIds).toEqual([])
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 2 })
    expect(state().past).toHaveLength(1)

    state().undo()
    expect(state().blocks.map((block) => block.text)).toEqual(['abcd', 'efgh', 'ijkl'])

    state().redo()
    expect(state().blocks.map((block) => block.text)).toEqual(['aX', '', 'kl'])
  })

  it('un cambio nuevo descarta el futuro', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])
    await load()

    state().setText('a', 'Hola!')
    state().undo()
    expect(state().future).toHaveLength(1)

    state().setText('a', 'Adiós')
    expect(state().future).toHaveLength(0)

    state().redo()
    expect(state().blocks[0].text).toBe('Adiós')
  })

  it('no hace nada si no hay historia', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])
    await load()

    state().undo()
    state().redo()

    expect(state().blocks[0].text).toBe('Hola')
  })

  it('teclear dentro de la ventana de coalescencia agrupa; fuera de ella separa', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])
    await load()

    state().setText('a', 'Hola!')
    await advance(700)
    state().setText('a', 'Hola!!')

    expect(state().past).toHaveLength(2)

    state().undo()
    expect(state().blocks[0].text).toBe('Hola!')
    state().undo()
    expect(state().blocks[0].text).toBe('Hola')
  })

  it('deshacer tras el autosave recrea en la base el bloque fusionado', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"hola "}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"mundo"}', position: 1 })
    ])
    await load()

    state().mergeBackward('b')
    await advance()
    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"hola mundo"}', position: 0, indent: 0 }
      ],
      removeIds: ['b']
    })

    state().undo()
    await advance()

    expect(blocks.sync).toHaveBeenLastCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"hola "}', position: 0, indent: 0 },
        { id: 'b', type: 'paragraph', content: '{"text":"mundo"}', position: 1, indent: 0 }
      ],
      removeIds: []
    })
  })
})

describe('editorStore · acciones restantes', () => {
  it('setBlockType cambia el tipo y lo persiste', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"T"}' })])
    await load()

    state().setBlockType('a', 'heading')
    expect(state().blocks[0].type).toBe('heading')

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [{ id: 'a', type: 'heading', content: '{"text":"T"}', position: 0, indent: 0 }],
      removeIds: []
    })
  })

  it('removeBlock elimina, enfoca el anterior y lo borra en la base', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 }),
      makeBlock({ id: 'c', content: '{"text":"tres"}', position: 2 })
    ])
    await load()

    state().removeBlock('b')

    expect(state().blocks.map((block) => block.id)).toEqual(['a', 'c'])
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 3 })

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"uno"}', position: 0, indent: 0 },
        { id: 'c', type: 'paragraph', content: '{"text":"tres"}', position: 1, indent: 0 }
      ],
      removeIds: ['b']
    })
  })

  it('carga tipo e indent además del texto', async () => {
    installApi([
      makeBlock({ id: 'a', type: 'heading', indent: 2, content: '{"text":"Título"}' })
    ])

    await load()

    expect(state().blocks[0]).toEqual({ id: 'a', type: 'heading', text: 'Título', indent: 2 })
  })

  it('insertar un bloque en medio fuerza reorder al persistir', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 }),
      makeBlock({ id: 'c', content: '{"text":"tres"}', position: 2 })
    ])
    await load()

    state().splitAt('a', 1)
    const insertedId = state().blocks[1].id
    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        { id: 'a', type: 'paragraph', content: '{"text":"u"}', position: 0, indent: 0 },
        { id: insertedId, type: 'paragraph', content: '{"text":"no"}', position: 1, indent: 0 },
        { id: 'b', type: 'paragraph', content: '{"text":"dos"}', position: 2, indent: 0 },
        { id: 'c', type: 'paragraph', content: '{"text":"tres"}', position: 3, indent: 0 }
      ],
      removeIds: []
    })
  })
})

describe('editorStore · setText sin cambios reales', () => {
  it('mismo texto: no añade historial ni programa autosave', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])
    await load()
    vi.clearAllMocks()

    state().setText('a', 'Hola')

    expect(state().blocks[0].text).toBe('Hola')
    expect(state().past).toHaveLength(0)
    expect(state().future).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)

    await advance(800)

    expect(blocks.sync).not.toHaveBeenCalled()
  })

  it('id inexistente: no añade historial, no toca bloques ni programa autosave', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])
    await load()
    const before = state().blocks
    vi.clearAllMocks()

    state().setText('zz', 'texto inventado')

    expect(state().blocks).toBe(before)
    expect(state().past).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)

    await advance(800)

    expect(blocks.sync).not.toHaveBeenCalled()
  })

  it('un cambio real añade exactamente una entrada y coalesce el tecleo seguido', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"Hola"}' })])
    await load()
    vi.clearAllMocks()

    state().setText('a', 'Hola!')
    expect(state().past).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    state().setText('a', 'Hola!!')
    state().setText('a', 'Hola!!!')
    expect(state().past).toHaveLength(1)

    await advance(800)

    expect(blocks.sync).toHaveBeenCalledTimes(1)
    expect(blocks.sync).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        upserts: [
          expect.objectContaining({ id: 'a', content: '{"text":"Hola!!!"}' })
        ]
      })
    )

    await advance(700)
    state().setText('a', 'Hola!!!!')
    expect(state().past).toHaveLength(2)

    await advance(800)

    expect(blocks.sync).toHaveBeenCalledTimes(2)
    expect(blocks.sync).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({
        upserts: [
          expect.objectContaining({ id: 'a', content: '{"text":"Hola!!!!"}' })
        ]
      })
    )
  })
})

describe('editorStore · markdown y status', () => {
  it('applyInput convierte "# " en heading y quita el disparador', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":""}' })])
    await load()

    state().applyInput('a', '# ')

    expect(state().blocks[0]).toMatchObject({ type: 'heading', text: '' })
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 0 })

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [{ id: 'a', type: 'heading', content: '{"text":""}', position: 0, indent: 0 }],
      removeIds: []
    })
  })

  it('applyInput convierte listas, tareas, citas y código', async () => {
    installApi([makeBlock({ id: 'a' })])
    await load()

    state().applyInput('a', '- ')
    expect(state().blocks[0].type).toBe('bullet')

    state().applyInput('a', '[] ')
    expect(state().blocks[0].type).toBe('todo')

    state().applyInput('a', '> ')
    expect(state().blocks[0].type).toBe('quote')

    state().applyInput('a', '```')
    expect(state().blocks[0].type).toBe('code')

    state().applyInput('a', 'texto')
    expect(state().blocks[0].text).toBe('texto')
  })

  it('applyInput convierte "---" en divider e inserta un párrafo enfocado', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":""}' })])
    await load()

    state().applyInput('a', '---')

    const created = state().blocks[1]
    expect(state().blocks.map((block) => block.type)).toEqual(['divider', 'paragraph'])
    expect(created.id).not.toBe('a')
    expect(created.text).toBe('')
    expect(state().focusRequest).toMatchObject({ blockId: created.id, caret: 0 })
  })

  it('si el tipo ya coincide no recorta el texto', async () => {
    installApi([makeBlock({ id: 'a', type: 'bullet', content: '{"text":"-"}' })])
    await load()

    state().applyInput('a', '- ')

    expect(state().blocks[0].text).toBe('- ')
    expect(state().blocks[0].type).toBe('bullet')
  })

  it('dentro de un bloque de código las reglas no aplican', async () => {
    installApi([makeBlock({ id: 'a', type: 'code', content: '{"text":""}' })])
    await load()

    state().applyInput('a', '```')

    expect(state().blocks[0].type).toBe('code')
    expect(state().blocks[0].text).toBe('```')
  })

  it('toggleDone actualiza, persiste y se deshace', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', type: 'todo', content: '{"text":"tarea"}' })
    ])
    await load()

    state().toggleDone('a')
    expect(state().blocks[0].status).toBe('done')

    await advance()
    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        {
          id: 'a',
          type: 'todo',
          content: '{"text":"tarea","status":"done"}',
          position: 0,
          indent: 0
        }
      ],
      removeIds: []
    })

    state().undo()
    expect(state().blocks[0].status).toBe('todo')

    await advance()
    expect(blocks.sync).toHaveBeenLastCalledWith('p1', {
      upserts: [{ id: 'a', type: 'todo', content: '{"text":"tarea"}', position: 0, indent: 0 }],
      removeIds: []
    })
  })

  it('toggleDone trata cualquier estado distinto de done como pendiente', async () => {
    installApi([makeBlock({ id: 'a', type: 'todo', content: '{"text":"tarea"}' })])
    await load()

    state().setStatus('a', 'in-progress')
    state().toggleDone('a')
    expect(state().blocks[0].status).toBe('done')

    state().setStatus('a', 'cancelled')
    expect(state().blocks[0].status).toBe('cancelled')
    state().toggleDone('a')
    expect(state().blocks[0].status).toBe('done')
  })

  it('setStatus persiste el estado elegido y no repite si no cambia', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', type: 'todo', content: '{"text":"t"}' })])
    await load()

    state().setStatus('a', 'backlog')
    expect(state().blocks[0].status).toBe('backlog')

    const history = state().past.length
    state().setStatus('a', 'backlog')
    expect(state().past.length).toBe(history)

    await advance()
    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [
        {
          id: 'a',
          type: 'todo',
          content: '{"text":"t","status":"backlog"}',
          position: 0,
          indent: 0
        }
      ],
      removeIds: []
    })
  })

  it('carga el status desde el content JSON y traduce el checked antiguo', async () => {
    installApi([
      makeBlock({ id: 'a', type: 'todo', content: '{"text":"tarea","checked":true}' }),
      makeBlock({ id: 'b', type: 'todo', content: '{"text":"otra"}', position: 1 }),
      makeBlock({
        id: 'c',
        type: 'todo',
        content: '{"text":"en curso","status":"in-progress"}',
        position: 2
      }),
      makeBlock({ id: 'd', type: 'paragraph', content: '{"text":"nota"}', position: 3 })
    ])
    await load()

    expect(state().blocks[0].status).toBe('done')
    expect(state().blocks[1].status).toBe('todo')
    expect(state().blocks[2].status).toBe('in-progress')
    expect(state().blocks[3].status).toBeUndefined()
  })
})

describe('editorStore · slash y conversión', () => {
  it('applySlashCommand en bloque vacío convierte en el sitio', async () => {
    installApi([makeBlock({ id: 'a' })])
    await load()

    state().applySlashCommand('a', 'heading')

    expect(state().blocks).toHaveLength(1)
    expect(state().blocks[0].type).toBe('heading')
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 0 })
  })

  it('applySlashCommand con texto inserta un bloque nuevo con el mismo indent', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"texto"}', indent: 1 })])
    await load()

    state().applySlashCommand('a', 'todo')

    expect(state().blocks.map((block) => block.type)).toEqual(['paragraph', 'todo'])
    expect(state().blocks[1]).toMatchObject({ text: '', indent: 1, status: 'todo' })
    expect(state().focusRequest).toMatchObject({ blockId: state().blocks[1].id, caret: 0 })
  })

  it('applySlashCommand divider inserta divisor y párrafo enfocado', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"texto"}' })])
    await load()

    state().applySlashCommand('a', 'divider')

    expect(state().blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'divider',
      'paragraph'
    ])
    expect(state().focusRequest).toMatchObject({ blockId: state().blocks[2].id, caret: 0 })
  })

  it('convertBlock a divider enfoca el siguiente o crea uno', async () => {
    installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 })
    ])
    await load()

    state().convertBlock('a', 'divider')
    expect(state().blocks.map((block) => block.type)).toEqual(['divider', 'paragraph'])
    expect(state().focusRequest).toMatchObject({ blockId: 'b', caret: 0 })

    state().convertBlock('b', 'divider')
    expect(state().blocks[2].type).toBe('paragraph')
    expect(state().focusRequest).toMatchObject({ blockId: state().blocks[2].id, caret: 0 })
  })

  it('convertBlock a otro tipo conserva texto e indent y enfoca el final', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"hola"}', indent: 1 })])
    await load()

    state().convertBlock('a', 'quote')

    expect(state().blocks[0]).toMatchObject({ type: 'quote', text: 'hola', indent: 1 })
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 4 })
  })
})

describe('editorStore · duplicar, borrar y mover', () => {
  it('duplicateBlocks inserta copias tras la selección y las selecciona', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 })
    ])
    await load()

    state().duplicateBlocks(['a'])

    expect(state().blocks.map((block) => block.text)).toEqual(['uno', 'uno', 'dos'])
    expect(state().selectedIds).toEqual([state().blocks[1].id])
    expect(state().selectionAnchor).toBe(state().blocks[1].id)

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        upserts: expect.arrayContaining([
          expect.objectContaining({ id: state().blocks[1].id, content: '{"text":"uno"}', position: 1 })
        ])
      })
    )
  })

  it('deleteBlocks elimina la selección y enfoca el bloque anterior', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 }),
      makeBlock({ id: 'c', content: '{"text":"tres"}', position: 2 })
    ])
    await load()

    state().selectBlock('b', 'toggle')
    state().selectBlock('c', 'toggle')
    state().deleteBlocks()

    expect(state().blocks.map((block) => block.id)).toEqual(['a'])
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 3 })
    expect(state().selectedIds).toEqual([])

    await advance()

    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [{ id: 'a', type: 'paragraph', content: '{"text":"uno"}', position: 0, indent: 0 }],
      removeIds: ['b', 'c']
    })
  })

  it('deleteBlocks del único bloque deja un párrafo vacío nuevo', async () => {
    installApi([makeBlock({ id: 'a', content: '{"text":"uno"}' })])
    await load()

    state().deleteBlocks(['a'])

    expect(state().blocks).toHaveLength(1)
    expect(state().blocks[0].id).not.toBe('a')
    expect(state().blocks[0]).toMatchObject({ type: 'paragraph', text: '' })
    expect(state().focusRequest).toMatchObject({ blockId: state().blocks[0].id, caret: 0 })
  })

  it('moveBlockTo reordena, indenta y persiste', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 }),
      makeBlock({ id: 'c', content: '{"text":"tres"}', position: 2 })
    ])
    await load()

    state().moveBlockTo('c', 0, 0)
    expect(state().blocks.map((block) => block.id)).toEqual(['c', 'a', 'b'])

    state().moveBlockTo('b', 1, 5)
    expect(state().blocks.map((block) => block.id)).toEqual(['c', 'b', 'a'])
    expect(state().blocks[1].indent).toBe(1)

    await advance()

    expect(blocks.sync).toHaveBeenLastCalledWith('p1', {
      upserts: [
        { id: 'c', type: 'paragraph', content: '{"text":"tres"}', position: 0, indent: 0 },
        { id: 'b', type: 'paragraph', content: '{"text":"dos"}', position: 1, indent: 1 },
        { id: 'a', type: 'paragraph', content: '{"text":"uno"}', position: 2, indent: 0 }
      ],
      removeIds: []
    })
  })
})

describe('editorStore · selección', () => {
  it('selectBlock range usa el ancla y toggle alterna', async () => {
    installApi([
      makeBlock({ id: 'a', position: 0 }),
      makeBlock({ id: 'b', position: 1 }),
      makeBlock({ id: 'c', position: 2 })
    ])
    await load()

    state().selectBlock('a', 'replace')
    expect(state().selectedIds).toEqual([])
    expect(state().selectionAnchor).toBe('a')

    state().selectBlock('c', 'range')
    expect(state().selectedIds).toEqual(['a', 'b', 'c'])
    expect(state().selectionAnchor).toBe('a')
    expect(state().selectionFocus).toBe('c')

    state().selectBlock('c', 'toggle')
    expect(state().selectedIds).toEqual(['a', 'b'])
  })

  it('extendSelection crece desde el ancla y enfoca el borde', async () => {
    installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 }),
      makeBlock({ id: 'c', content: '{"text":"tres"}', position: 2 })
    ])
    await load()

    state().setActiveBlock('a')
    state().extendSelection('a', 1)
    expect(state().selectedIds).toEqual(['a', 'b'])
    expect(state().focusRequest).toMatchObject({ blockId: 'b', caret: 0 })

    state().extendSelection('b', 1)
    expect(state().selectedIds).toEqual(['a', 'b', 'c'])
    expect(state().focusRequest).toMatchObject({ blockId: 'c', caret: 0 })

    state().extendSelection('c', 1)
    expect(state().selectedIds).toEqual(['a', 'b', 'c'])
  })

  it('extiende desde el extremo de un rango con ratón aunque el caret siga en el ancla', async () => {
    installApi([
      makeBlock({ id: 'a', position: 0 }),
      makeBlock({ id: 'b', position: 1 }),
      makeBlock({ id: 'c', position: 2 }),
      makeBlock({ id: 'd', position: 3 })
    ])
    await load()
    state().setActiveBlock('a')
    state().selectBlock('a', 'replace')
    state().selectBlock('c', 'range')

    state().extendSelection('a', 1)

    expect(state().selectedIds).toEqual(['a', 'b', 'c', 'd'])
    expect(state().selectionAnchor).toBe('a')
    expect(state().focusRequest).toMatchObject({ blockId: 'd', caret: 0 })
  })

  it('clearSelection limpia selección y ancla', async () => {
    installApi([makeBlock({ id: 'a' }), makeBlock({ id: 'b', position: 1 })])
    await load()

    state().selectBlock('a', 'toggle')
    state().clearSelection()

    expect(state().selectedIds).toEqual([])
    expect(state().selectionAnchor).toBeNull()
  })

  it('escribir en un bloque limpia la multi-selección', async () => {
    installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 1 })
    ])
    await load()

    state().selectBlock('a', 'toggle')
    state().selectBlock('b', 'toggle')
    state().setText('a', 'uno!')

    expect(state().selectedIds).toEqual([])
    expect(state().blocks[0].text).toBe('uno!')
  })
})

describe('editorStore · regresiones con divider', () => {
  it('mergeBackward elimina el divider anterior y conserva el párrafo', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', type: 'divider', content: '{"text":""}', position: 0 }),
      makeBlock({ id: 'b', content: '{"text":"texto"}', position: 1 })
    ])
    await load()

    state().mergeBackward('b')

    expect(state().blocks).toEqual([{ id: 'b', type: 'paragraph', text: 'texto', indent: 0 }])
    expect(state().focusRequest).toMatchObject({ blockId: 'b', caret: 0 })

    await advance()
    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [{ id: 'b', type: 'paragraph', content: '{"text":"texto"}', position: 0, indent: 0 }],
      removeIds: ['a']
    })
  })

  it('mergeForward elimina el divider siguiente y mantiene el foco', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', content: '{"text":"abc"}', position: 0 }),
      makeBlock({ id: 'd', type: 'divider', content: '{"text":""}', position: 1 })
    ])
    await load()

    state().mergeForward('a')

    expect(state().blocks.map((block) => block.id)).toEqual(['a'])
    expect(state().blocks[0].text).toBe('abc')
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 3 })

    await advance()
    expect(blocks.sync).toHaveBeenCalledWith('p1', {
      upserts: [{ id: 'a', type: 'paragraph', content: '{"text":"abc"}', position: 0, indent: 0 }],
      removeIds: ['d']
    })
  })

  it('focusSibling salta los divisores', async () => {
    installApi([
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 0 }),
      makeBlock({ id: 'd', type: 'divider', content: '{"text":""}', position: 1 }),
      makeBlock({ id: 'b', content: '{"text":"dos"}', position: 2 })
    ])
    await load()

    state().focusSibling('a', 1)
    expect(state().focusRequest).toMatchObject({ blockId: 'b', caret: 0 })

    state().focusSibling('b', -1)
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 3 })
  })

  it('convertBlock a divider limpia el texto y lo persiste', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"uno"}' })])
    await load()

    state().convertBlock('a', 'divider')

    expect(state().blocks[0]).toMatchObject({ type: 'divider', text: '' })

    await advance()
    expect(blocks.sync).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        upserts: expect.arrayContaining([
          expect.objectContaining({ id: 'a', type: 'divider', content: '{"text":""}' })
        ])
      })
    )
  })

  it('deleteBlocks sin vecino textual añade un párrafo enfocado', async () => {
    installApi([
      makeBlock({ id: 'd', type: 'divider', content: '{"text":""}', position: 0 }),
      makeBlock({ id: 'a', content: '{"text":"uno"}', position: 1 })
    ])
    await load()

    state().deleteBlocks(['a'])

    expect(state().blocks.map((block) => block.type)).toEqual(['divider', 'paragraph'])
    expect(state().blocks[1].text).toBe('')
    expect(state().focusRequest).toMatchObject({ blockId: state().blocks[1].id, caret: 0 })
  })
})
