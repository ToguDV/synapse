import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RectAnchor } from '../src/renderer/src/editor/types'
import { anchoredPosition, rectAnchorIfConnected } from '../src/renderer/src/ui/rectAnchor'

const VIEWPORT = { innerWidth: 1000, innerHeight: 800 }

function makeAnchor(partial: Partial<RectAnchor> = {}): RectAnchor {
  return { left: 100, top: 100, right: 200, bottom: 120, ...partial }
}

beforeEach(() => {
  vi.stubGlobal('window', { ...VIEWPORT })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('anchoredPosition', () => {
  it('abre debajo del ancla alineado a la izquierda por defecto', () => {
    expect(anchoredPosition(makeAnchor(), { width: 200, height: 300 })).toEqual({
      left: 100,
      top: 126
    })
  })

  it('alinea a la derecha del ancla con align right', () => {
    const position = anchoredPosition(makeAnchor(), { width: 200, height: 300 }, { align: 'right' })
    expect(position.left).toBe(206)
  })

  it('respeta gap y margin personalizados', () => {
    const position = anchoredPosition(
      makeAnchor(),
      { width: 200, height: 300 },
      { gap: 20, margin: 4 }
    )
    expect(position.top).toBe(140)
    expect(position.left).toBe(100)
  })

  it('clampa contra el borde derecho', () => {
    const position = anchoredPosition(makeAnchor({ left: 950, right: 1050 }), {
      width: 200,
      height: 300
    })
    expect(position.left).toBe(792)
  })

  it('clampa contra el borde izquierdo', () => {
    const position = anchoredPosition(makeAnchor({ left: -50, right: 50 }), {
      width: 200,
      height: 300
    })
    expect(position.left).toBe(8)
  })

  it('deja el margen cuando el popover es más ancho que el viewport', () => {
    const position = anchoredPosition(makeAnchor(), { width: 1200, height: 300 })
    expect(position.left).toBe(8)
  })

  it('abre hacia arriba cuando no cabe debajo', () => {
    const position = anchoredPosition(makeAnchor({ top: 680, bottom: 700 }), {
      width: 200,
      height: 300
    })
    expect(position.top).toBe(374)
  })

  it('nunca deja el top por encima del margen superior', () => {
    const position = anchoredPosition(makeAnchor({ top: 100, bottom: 120 }), {
      width: 200,
      height: 900
    })
    expect(position.top).toBe(8)
  })

  it('clampa al margen cuando anchor.bottom + gap es negativo', () => {
    const position = anchoredPosition(makeAnchor({ top: -120, bottom: -100 }), {
      width: 200,
      height: 300
    })
    expect(position.top).toBe(8)
  })

  it('clampa contra el borde inferior cuando el ancla está por debajo del viewport', () => {
    const position = anchoredPosition(makeAnchor({ top: 1200, bottom: 1220 }), {
      width: 200,
      height: 300
    })
    expect(position.top).toBe(492)
  })

  it('usa la misma fórmula de apertura hacia arriba con align right', () => {
    const position = anchoredPosition(
      makeAnchor({ top: 680, bottom: 700 }),
      { width: 200, height: 300 },
      { align: 'right' }
    )
    expect(position).toEqual({ left: 206, top: 374 })
  })

  it('deja el margen con align right y popover más ancho que el viewport', () => {
    const position = anchoredPosition(
      makeAnchor(),
      { width: 1200, height: 300 },
      { align: 'right' }
    )
    expect(position.left).toBe(8)
  })
})

describe('rectAnchorIfConnected', () => {
  const fallback: RectAnchor = { left: 1, top: 2, right: 3, bottom: 4 }

  it('devuelve el rect del elemento conectado', () => {
    const element = {
      isConnected: true,
      getBoundingClientRect: () => ({ left: 10, top: 20, right: 30, bottom: 40 })
    } as unknown as HTMLElement

    expect(rectAnchorIfConnected(element, fallback)).toEqual({
      left: 10,
      top: 20,
      right: 30,
      bottom: 40
    })
  })

  it('usa el fallback si el elemento es null o está desmontado', () => {
    const detached = { isConnected: false } as unknown as HTMLElement

    expect(rectAnchorIfConnected(null, fallback)).toBe(fallback)
    expect(rectAnchorIfConnected(detached, fallback)).toBe(fallback)
  })
})
