import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../src/renderer/src/editor/editorStore'
import type { Block, BlockCreateInput, BlockUpdatePatch } from '../src/shared/types'

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
    })
  }
  vi.stubGlobal('window', { api: { blocks } })
  return { blocks, db }
}

const state = () => useEditorStore.getState()
const load = () => useEditorStore.getState().loadPage('p1')
const advance = (ms = 500) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
  useEditorStore.setState({
    pageId: null,
    blocks: [],
    loading: false,
    activeBlockId: null,
    focusRequest: null,
    selectedIds: [],
    selectionAnchor: null,
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
})

describe('editorStore · edición', () => {
  it('setText actualiza el estado y guarda con debounce', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a' })])
    await load()

    state().setText('a', 'Hola')
    expect(state().blocks[0].text).toBe('Hola')
    expect(blocks.update).not.toHaveBeenCalled()

    await advance()

    expect(blocks.update).toHaveBeenCalledWith('a', {
      type: 'paragraph',
      content: '{"text":"Hola"}',
      indent: 0
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

    expect(blocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ content: '{"text":"hola "}' })
    )
    expect(blocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: created.id, content: '{"text":"mundo"}', position: 1 })
    )
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

    expect(blocks.remove).toHaveBeenCalledWith('b')
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

    expect(blocks.remove).toHaveBeenCalledWith('b')
  })

  it('Backspace sobre bloque vacío no párrafo lo convierte en párrafo', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', type: 'heading' })])
    await load()

    state().mergeBackward('a')

    expect(state().blocks[0].type).toBe('paragraph')
    expect(blocks.remove).not.toHaveBeenCalled()
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

    expect(blocks.update).toHaveBeenCalledWith('b', expect.objectContaining({ indent: 1 }))
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
    expect(blocks.remove).toHaveBeenCalledWith('b')

    state().undo()
    await advance()

    expect(blocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b', content: '{"text":"mundo"}', position: 1 })
    )
    expect(blocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ content: '{"text":"hola "}' })
    )
  })
})

describe('editorStore · acciones restantes', () => {
  it('setBlockType cambia el tipo y lo persiste', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":"T"}' })])
    await load()

    state().setBlockType('a', 'heading')
    expect(state().blocks[0].type).toBe('heading')

    await advance()

    expect(blocks.update).toHaveBeenCalledWith('a', expect.objectContaining({ type: 'heading' }))
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

    expect(blocks.remove).toHaveBeenCalledWith('b')
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

    expect(blocks.reorder).toHaveBeenCalledWith('p1', ['a', insertedId, 'b', 'c'])
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

    expect(blocks.update).not.toHaveBeenCalled()
    expect(blocks.create).not.toHaveBeenCalled()
    expect(blocks.remove).not.toHaveBeenCalled()
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

    expect(blocks.update).not.toHaveBeenCalled()
    expect(blocks.create).not.toHaveBeenCalled()
    expect(blocks.remove).not.toHaveBeenCalled()
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

    expect(blocks.update).toHaveBeenCalledTimes(1)
    expect(blocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ content: '{"text":"Hola!!!"}' })
    )

    await advance(700)
    state().setText('a', 'Hola!!!!')
    expect(state().past).toHaveLength(2)

    await advance(800)

    expect(blocks.update).toHaveBeenCalledTimes(2)
    expect(blocks.update).toHaveBeenLastCalledWith(
      'a',
      expect.objectContaining({ content: '{"text":"Hola!!!!"}' })
    )
  })
})

describe('editorStore · markdown y checked', () => {
  it('applyInput convierte "# " en heading y quita el disparador', async () => {
    const { blocks } = installApi([makeBlock({ id: 'a', content: '{"text":""}' })])
    await load()

    state().applyInput('a', '# ')

    expect(state().blocks[0]).toMatchObject({ type: 'heading', text: '' })
    expect(state().focusRequest).toMatchObject({ blockId: 'a', caret: 0 })

    await advance()

    expect(blocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ type: 'heading', content: '{"text":""}' })
    )
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

  it('toggleChecked actualiza, persiste y se deshace', async () => {
    const { blocks } = installApi([
      makeBlock({ id: 'a', type: 'todo', content: '{"text":"tarea"}' })
    ])
    await load()

    state().toggleChecked('a')
    expect(state().blocks[0].checked).toBe(true)

    await advance()
    expect(blocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ content: '{"text":"tarea","checked":true}' })
    )

    state().undo()
    expect(state().blocks[0].checked).toBeUndefined()

    await advance()
    expect(blocks.update).toHaveBeenLastCalledWith(
      'a',
      expect.objectContaining({ content: '{"text":"tarea"}' })
    )
  })

  it('carga checked desde el content JSON', async () => {
    installApi([
      makeBlock({ id: 'a', type: 'todo', content: '{"text":"tarea","checked":true}' }),
      makeBlock({ id: 'b', type: 'todo', content: '{"text":"otra"}', position: 1 })
    ])
    await load()

    expect(state().blocks[0].checked).toBe(true)
    expect(state().blocks[1].checked).toBeUndefined()
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
    expect(state().blocks[1]).toMatchObject({ text: '', indent: 1, checked: false })
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

    expect(blocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: '{"text":"uno"}', position: 1 })
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

    expect(blocks.remove).toHaveBeenCalledWith('b')
    expect(blocks.remove).toHaveBeenCalledWith('c')
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

    expect(blocks.reorder).toHaveBeenLastCalledWith('p1', ['c', 'b', 'a'])
    expect(blocks.update).toHaveBeenCalledWith('b', expect.objectContaining({ indent: 1 }))
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
    expect(blocks.remove).toHaveBeenCalledWith('a')
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
    expect(blocks.remove).toHaveBeenCalledWith('d')
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
    expect(blocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ type: 'divider', content: '{"text":""}' })
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
