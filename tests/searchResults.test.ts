import { describe, expect, it } from 'vitest'
import { buildSnippet, findMatch } from '../src/renderer/src/ui/searchResults'

describe('findMatch', () => {
  it('encuentra el término sin distinguir mayúsculas', () => {
    expect(findMatch('Hola Mundo', 'mundo')).toEqual({ start: 5, end: 10 })
  })

  it('devuelve null si no hay coincidencia o el término está vacío', () => {
    expect(findMatch('Hola', 'adios')).toBeNull()
    expect(findMatch('Hola', '')).toBeNull()
  })
})

describe('buildSnippet', () => {
  it('recorta el contexto alrededor de la coincidencia', () => {
    const text = `${'a'.repeat(60)} aguja ${'b'.repeat(60)}`

    const snippet = buildSnippet(text, 'aguja', 10)

    expect(snippet).toMatchObject({
      before: `${'a'.repeat(9)} `,
      match: 'aguja',
      after: ` ${'b'.repeat(9)}`,
      ellipsisStart: true,
      ellipsisEnd: true
    })
  })

  it('no añade puntos suspensivos cuando el texto cabe entero', () => {
    const snippet = buildSnippet('Comprar pan', 'pan', 40)

    expect(snippet).toEqual({
      before: 'Comprar ',
      match: 'pan',
      after: '',
      ellipsisStart: false,
      ellipsisEnd: false
    })
  })

  it('sin coincidencia muestra el inicio del texto', () => {
    const snippet = buildSnippet('x'.repeat(100), 'z', 10)

    expect(snippet).toEqual({
      before: 'x'.repeat(20),
      match: '',
      after: '',
      ellipsisStart: false,
      ellipsisEnd: true
    })
  })

  it('conserva la caja original del fragmento', () => {
    const snippet = buildSnippet('Canción de cuna', 'CANCIÓN')

    expect(snippet.match).toBe('Canción')
  })
})
