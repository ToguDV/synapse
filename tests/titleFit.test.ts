import { describe, expect, it } from 'vitest'
import {
  fitTitleFontSize,
  titleIconOffset,
  titleLineHeight,
  TITLE_FONT_MAX,
  TITLE_FONT_MIN
} from '../src/renderer/src/ui/titleFit'

describe('fitTitleFontSize', () => {
  it('mantiene la fuente máxima si el texto cabe en una línea', () => {
    expect(fitTitleFontSize(500, () => 300)).toBe(TITLE_FONT_MAX)
  })

  it('reduce la fuente justo hasta que el texto cabe', () => {
    expect(fitTitleFontSize(300, (size) => size * 10)).toBe(30)
  })

  it('no baja del mínimo aunque el texto siga sin caber (hace wrap)', () => {
    expect(fitTitleFontSize(50, () => 1000)).toBe(TITLE_FONT_MIN)
  })

  it('devuelve la fuente máxima cuando aún no hay ancho disponible', () => {
    expect(fitTitleFontSize(0, () => 1000)).toBe(TITLE_FONT_MAX)
  })
})

describe('titleLineHeight', () => {
  it('escala la altura de línea con la fuente', () => {
    expect(titleLineHeight(TITLE_FONT_MAX)).toBe(40)
    expect(titleLineHeight(TITLE_FONT_MIN)).toBe(27)
  })
})

describe('titleIconOffset', () => {
  it('centra el icono con la primera línea del título', () => {
    expect(titleIconOffset(TITLE_FONT_MAX, 48)).toBe(-4)
    expect(titleIconOffset(TITLE_FONT_MIN, 48)).toBe(-10.5)
  })
})
