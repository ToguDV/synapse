import { describe, expect, it } from 'vitest'
import {
  blockAt,
  changeType,
  duplicateBlocks,
  indentBlock,
  insertAfter,
  isTextualBlock,
  maxIndentFor,
  mergeWithNext,
  mergeWithPrevious,
  moveBlock,
  nearestTextualBlock,
  outdentBlock,
  removeBlock,
  removeBlocks,
  splitBlock,
  updateStatus,
  updateText
} from '../src/renderer/src/editor/transforms'
import type { EditorBlock } from '../src/renderer/src/editor/types'

function make(id: string, text: string, extra: Partial<EditorBlock> = {}): EditorBlock {
  return { id, type: 'paragraph', text, indent: 0, ...extra }
}

describe('blockAt / updateText / changeType', () => {
  it('localiza bloques por id', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos')]

    expect(blockAt(blocks, 'b')).toEqual({ block: blocks[1], index: 1 })
    expect(blockAt(blocks, 'zz')).toBeNull()
  })

  it('updateText devuelve la misma referencia si nada cambia', () => {
    const blocks = [make('a', 'uno')]

    expect(updateText(blocks, 'a', 'uno')).toBe(blocks)
    expect(updateText(blocks, 'a', 'otro')[0].text).toBe('otro')
  })

  it('changeType no muta el array original', () => {
    const blocks = [make('a', 'uno')]

    const result = changeType(blocks, 'a', 'heading')

    expect(result).not.toBe(blocks)
    expect(result[0].type).toBe('heading')
    expect(blocks[0].type).toBe('paragraph')
    expect(changeType(blocks, 'a', 'paragraph')).toBe(blocks)
  })

  it('changeType descarta status al convertir a un tipo que no es todo', () => {
    const done = [make('a', 'uno', { type: 'todo', status: 'done' })]

    const toParagraph = changeType(done, 'a', 'paragraph')
    expect(toParagraph[0].type).toBe('paragraph')
    expect('status' in toParagraph[0]).toBe(false)

    const sameType = changeType(done, 'a', 'todo')
    expect(sameType).toBe(done)

    const toBullet = changeType([make('a', 'uno', { type: 'todo', status: 'in-progress' })], 'a', 'bullet')
    expect(toBullet[0].type).toBe('bullet')
    expect('status' in toBullet[0]).toBe(false)
  })
})

describe('splitBlock', () => {
  it('parte en dos bloques y enfoca el nuevo al inicio', () => {
    const blocks = [make('a', 'hola mundo')]

    const result = splitBlock(blocks, 'a', 5, 'b')

    expect(result.blocks).toHaveLength(2)
    expect(result.blocks[0]).toMatchObject({ id: 'a', text: 'hola ' })
    expect(result.blocks[1]).toMatchObject({ id: 'b', text: 'mundo', type: 'paragraph' })
    expect(result.focus).toEqual({ blockId: 'b', caret: 0 })
  })

  it('parte al inicio y al final', () => {
    const atStart = splitBlock([make('a', 'texto')], 'a', 0, 'b')
    expect(atStart.blocks.map((block) => block.text)).toEqual(['', 'texto'])

    const atEnd = splitBlock([make('a', 'texto')], 'a', 99, 'b')
    expect(atEnd.blocks.map((block) => block.text)).toEqual(['texto', ''])
  })

  it('conserva tipo de lista y indent, pero heading pasa a paragraph', () => {
    const bullet = splitBlock([make('a', 'uno', { type: 'bullet', indent: 2 })], 'a', 3, 'b')
    expect(bullet.blocks[1]).toMatchObject({ type: 'bullet', indent: 2 })

    const todo = splitBlock([make('a', 'uno', { type: 'todo' })], 'a', 3, 'b')
    expect(todo.blocks[1].type).toBe('todo')

    const quote = splitBlock([make('a', 'uno', { type: 'quote' })], 'a', 3, 'b')
    expect(quote.blocks[1].type).toBe('quote')

    const code = splitBlock([make('a', 'uno', { type: 'code' })], 'a', 3, 'b')
    expect(code.blocks[1].type).toBe('code')

    const heading = splitBlock([make('a', 'uno', { type: 'heading' })], 'a', 3, 'b')
    expect(heading.blocks[1].type).toBe('paragraph')
  })

  it('ignora ids inexistentes', () => {
    const blocks = [make('a', 'uno')]

    const result = splitBlock(blocks, 'zz', 1, 'b')

    expect(result.blocks).toBe(blocks)
    expect(result.focus).toBeUndefined()
  })
})

describe('mergeWithPrevious / mergeWithNext', () => {
  it('fusiona con el anterior y deja el caret al final del texto previo', () => {
    const blocks = [make('a', 'hola '), make('b', 'mundo')]

    const result = mergeWithPrevious(blocks, 'b')

    expect(result.blocks).toEqual([make('a', 'hola mundo')])
    expect(result.focus).toEqual({ blockId: 'a', caret: 5 })
  })

  it('no fusiona el primer bloque', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos')]

    expect(mergeWithPrevious(blocks, 'a').blocks).toBe(blocks)
  })

  it('fusiona con el siguiente y mantiene el caret tras el texto propio', () => {
    const blocks = [make('a', 'hola '), make('b', 'mundo')]

    const result = mergeWithNext(blocks, 'a')

    expect(result.blocks).toEqual([make('a', 'hola mundo')])
    expect(result.focus).toEqual({ blockId: 'a', caret: 5 })
  })

  it('no fusiona el último bloque', () => {
    const blocks = [make('a', 'uno')]

    expect(mergeWithNext(blocks, 'a').blocks).toBe(blocks)
  })
})

describe('removeBlock', () => {
  it('enfoca el final del anterior', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos'), make('c', 'tres')]

    const result = removeBlock(blocks, 'b')

    expect(result.blocks.map((block) => block.id)).toEqual(['a', 'c'])
    expect(result.focus).toEqual({ blockId: 'a', caret: 3 })
  })

  it('si es el primero enfoca el inicio del siguiente', () => {
    const result = removeBlock([make('a', 'uno'), make('b', 'dos')], 'a')

    expect(result.blocks.map((block) => block.id)).toEqual(['b'])
    expect(result.focus).toEqual({ blockId: 'b', caret: 0 })
  })

  it('al quedar vacío no enfoca nada', () => {
    const result = removeBlock([make('a', 'uno')], 'a')

    expect(result.blocks).toEqual([])
    expect(result.focus).toBeUndefined()
  })
})

describe('indentBlock / outdentBlock', () => {
  it('indenta como máximo un nivel más que el bloque anterior', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos')]

    const once = indentBlock(blocks, 'b')
    expect(once[1].indent).toBe(1)
    expect(indentBlock(once, 'b')).toBe(once)

    const deeper = indentBlock([make('a', 'uno', { indent: 2 }), make('b', 'dos')], 'b')
    expect(deeper[1].indent).toBe(1)
  })

  it('no indenta el primer bloque', () => {
    const blocks = [make('a', 'uno')]

    expect(indentBlock(blocks, 'a')).toBe(blocks)
  })

  it('desindenta hasta 0', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos', { indent: 1 })]

    const result = outdentBlock(blocks, 'b')
    expect(result[1].indent).toBe(0)
    expect(outdentBlock(result, 'b')).toBe(result)
  })
})

describe('moveBlock', () => {
  it('mueve un bloque a otra posición', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos'), make('c', 'tres')]

    const result = moveBlock(blocks, 'a', 2)

    expect(result.map((block) => block.id)).toEqual(['b', 'c', 'a'])
    expect(blocks.map((block) => block.id)).toEqual(['a', 'b', 'c'])
  })

  it('recorta el índice destino y no hace nada si es la misma posición', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos')]

    expect(moveBlock(blocks, 'a', 1).map((block) => block.id)).toEqual(['b', 'a'])
    expect(moveBlock(blocks, 'a', 0)).toBe(blocks)
    expect(moveBlock(blocks, 'a', 99).map((block) => block.id)).toEqual(['b', 'a'])
    expect(moveBlock(blocks, 'a', -5).map((block) => block.id)).toEqual(['a', 'b'])
  })

  it('ignora ids inexistentes', () => {
    const blocks = [make('a', 'uno')]

    expect(moveBlock(blocks, 'zz', 0)).toBe(blocks)
  })
})

describe('bordes adicionales', () => {
  it('splitBlock recorta offsets negativos a 0', () => {
    const result = splitBlock([make('a', 'texto')], 'a', -3, 'b')

    expect(result.blocks.map((block) => block.text)).toEqual(['', 'texto'])
  })

  it('mergeWithNext conserva tipo e indent del bloque actual', () => {
    const blocks = [make('a', 'hola ', { type: 'bullet', indent: 2 }), make('b', 'mundo')]

    const result = mergeWithNext(blocks, 'a')

    expect(result.blocks[0]).toMatchObject({ type: 'bullet', indent: 2, text: 'hola mundo' })
  })

  it('removeBlock del último enfoca el final del anterior', () => {
    const result = removeBlock([make('a', 'uno'), make('b', 'dos')], 'b')

    expect(result.blocks.map((block) => block.id)).toEqual(['a'])
    expect(result.focus).toEqual({ blockId: 'a', caret: 3 })
  })

  it('mergeWithPrevious / mergeWithNext / removeBlock / indentBlock ignoran ids inexistentes', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos')]

    expect(mergeWithPrevious(blocks, 'zz').blocks).toBe(blocks)
    expect(mergeWithNext(blocks, 'zz').blocks).toBe(blocks)
    expect(removeBlock(blocks, 'zz').blocks).toBe(blocks)
    expect(indentBlock(blocks, 'zz')).toBe(blocks)
    expect(outdentBlock(blocks, 'zz')).toBe(blocks)
  })
})

describe('updateStatus', () => {
  it('cambia el estado sin mutar y devuelve la misma referencia si no cambia', () => {
    const blocks = [make('a', 'tarea', { type: 'todo' })]

    const done = updateStatus(blocks, 'a', 'done')
    expect(done[0].status).toBe('done')
    expect(blocks[0].status).toBeUndefined()
    expect(updateStatus(done, 'a', 'done')).toBe(done)
    expect(updateStatus(done, 'a', 'todo')[0].status).toBe('todo')
    expect(updateStatus(done, 'a', 'in-progress')[0].status).toBe('in-progress')
    expect(updateStatus(done, 'a', 'cancelled')[0].status).toBe('cancelled')
    expect(updateStatus(done, 'a', 'backlog')[0].status).toBe('backlog')
  })

  it('ignora ids inexistentes', () => {
    const blocks = [make('a', 'tarea', { type: 'todo' })]
    expect(updateStatus(blocks, 'zz', 'done')).toBe(blocks)
  })
})

describe('removeBlocks', () => {
  it('elimina varios bloques y enfoca el anterior al primero eliminado', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos'), make('c', 'tres'), make('d', 'cuatro')]

    const result = removeBlocks(blocks, ['b', 'c'])

    expect(result.blocks.map((block) => block.id)).toEqual(['a', 'd'])
    expect(result.focus).toEqual({ blockId: 'a', caret: 3 })
  })

  it('si el primero está en la selección enfoca el siguiente superviviente', () => {
    const result = removeBlocks(
      [make('a', 'uno'), make('b', 'dos'), make('c', 'tres')],
      ['a', 'b']
    )

    expect(result.blocks.map((block) => block.id)).toEqual(['c'])
    expect(result.focus).toEqual({ blockId: 'c', caret: 0 })
  })

  it('sin ids válidos devuelve la misma referencia', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos')]
    expect(removeBlocks(blocks, ['zz']).blocks).toBe(blocks)
  })

  it('splitBlock de un todo crea el nuevo bloque sin estado', () => {
    const result = splitBlock([make('a', 'uno', { type: 'todo', status: 'done' })], 'a', 3, 'b')

    expect(result.blocks[1]).toMatchObject({ type: 'todo', status: 'todo' })
  })
})

describe('duplicateBlocks', () => {
  it('duplica tras el último seleccionado conservando tipo, indent y status', () => {
    const blocks = [
      make('a', 'uno', { type: 'todo', status: 'done' }),
      make('b', 'dos'),
      make('c', 'tres', { indent: 1 })
    ]
    let counter = 0

    const result = duplicateBlocks(blocks, ['a', 'c'], () => `copy-${counter++}`)

    expect(result.blocks.map((block) => block.id)).toEqual(['a', 'b', 'c', 'copy-0', 'copy-1'])
    expect(result.blocks[3]).toMatchObject({ type: 'todo', status: 'done', indent: 0 })
    expect(result.blocks[4]).toMatchObject({ id: 'copy-1', text: 'tres', indent: 1 })
    expect(result.newIds).toEqual(['copy-0', 'copy-1'])
  })

  it('sin ids válidos no hace nada', () => {
    const blocks = [make('a', 'uno')]
    expect(duplicateBlocks(blocks, [], () => 'x').blocks).toBe(blocks)
    expect(duplicateBlocks(blocks, ['zz'], () => 'x').blocks).toBe(blocks)
    expect(duplicateBlocks(blocks, [], () => 'x').newIds).toEqual([])
  })
})

describe('insertAfter', () => {
  it('inserta tras el bloque indicado con los datos del spec', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos', { indent: 1 })]

    const result = insertAfter(blocks, 'a', [
      { id: 'n1', type: 'todo', status: 'todo' },
      { id: 'n2', type: 'divider', indent: 0 }
    ])

    expect(result.map((block) => block.id)).toEqual(['a', 'n1', 'n2', 'b'])
    expect(result[1]).toEqual({ id: 'n1', type: 'todo', text: '', indent: 0, status: 'todo' })
    expect(result[2]).toEqual({ id: 'n2', type: 'divider', text: '', indent: 0 })
  })

  it('ignora id inexistente o specs vacías', () => {
    const blocks = [make('a', 'uno')]
    expect(insertAfter(blocks, 'zz', [{ id: 'n', type: 'paragraph' }])).toBe(blocks)
    expect(insertAfter(blocks, 'a', [])).toBe(blocks)
  })
})

describe('moveBlock con indent', () => {
  it('aplica la indentación recortada al máximo permitido', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos'), make('c', 'tres')]

    const deep = moveBlock(blocks, 'c', 1, 2)
    expect(deep.map((block) => block.id)).toEqual(['a', 'c', 'b'])
    expect(deep[1].indent).toBe(1)

    const shallow = moveBlock(blocks, 'c', 0, 1)
    expect(shallow.map((block) => block.id)).toEqual(['c', 'a', 'b'])
    expect(shallow[0].indent).toBe(0)
  })

  it('misma posición e indentación devuelve la misma referencia', () => {
    const blocks = [make('a', 'uno'), make('b', 'dos')]

    expect(moveBlock(blocks, 'a', 0, 0)).toBe(blocks)

    const nested = [make('a', 'uno', { indent: 1 }), make('b', 'dos')]
    const sameSpot = moveBlock(nested, 'b', 1, 1)
    expect(sameSpot).not.toBe(nested)
    expect(sameSpot[1].indent).toBe(1)
  })

  it('maxIndentFor es 0 para el primer bloque y previo + 1 en el resto', () => {
    const blocks = [make('a', 'uno', { indent: 2 }), make('b', 'dos')]

    expect(maxIndentFor(blocks, 0)).toBe(0)
    expect(maxIndentFor(blocks, 1)).toBe(3)
  })
})

describe('bloques textuales', () => {
  it('isTextualBlock distingue divider del resto', () => {
    expect(isTextualBlock(make('a', 'uno'))).toBe(true)
    expect(isTextualBlock(make('a', '', { type: 'heading' }))).toBe(true)
    expect(isTextualBlock(make('a', '', { type: 'divider' }))).toBe(false)
  })

  it('nearestTextualBlock salta divisores en ambas direcciones', () => {
    const blocks = [
      make('a', 'uno'),
      make('d', '', { type: 'divider' }),
      make('b', 'dos'),
      make('d2', '', { type: 'divider' })
    ]

    expect(nearestTextualBlock(blocks, 0, 1)).toBe(blocks[0])
    expect(nearestTextualBlock(blocks, 1, 1)).toBe(blocks[2])
    expect(nearestTextualBlock(blocks, 3, -1)).toBe(blocks[2])
    expect(nearestTextualBlock(blocks, 2, -1)).toBe(blocks[2])
    expect(nearestTextualBlock(blocks, 3, 1)).toBeNull()
    expect(nearestTextualBlock(blocks, -1, -1)).toBeNull()
  })

  it('removeBlocks ignora divisores al elegir el foco', () => {
    const blocks = [
      make('a', 'uno'),
      make('d', '', { type: 'divider' }),
      make('b', 'dos')
    ]

    const removedLast = removeBlocks(blocks, ['b'])
    expect(removedLast.focus).toEqual({ blockId: 'a', caret: 3 })

    const removedFirst = removeBlocks(blocks, ['a'])
    expect(removedFirst.focus).toEqual({ blockId: 'b', caret: 0 })
  })
})
