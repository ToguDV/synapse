import { describe, expect, it } from 'vitest'
import type { Page } from '../src/shared/types'
import {
  buildPageTree,
  collectDescendantIds,
  flattenPages,
  nextPageAfterDelete,
  pageAncestors
} from '../src/renderer/src/store/pageTree'

let counter = 0

function makePage(partial: Partial<Page> & { id: string }): Page {
  counter += 1
  return {
    title: partial.id,
    parentId: null,
    icon: null,
    position: 0,
    createdAt: counter,
    updatedAt: counter,
    ...partial
  }
}

describe('buildPageTree', () => {
  it('anida hijas y ordena por posición', () => {
    const pages = [
      makePage({ id: 'root-b', position: 1 }),
      makePage({ id: 'root-a', position: 0 }),
      makePage({ id: 'child-b', parentId: 'root-a', position: 1 }),
      makePage({ id: 'child-a', parentId: 'root-a', position: 0 }),
      makePage({ id: 'grandchild', parentId: 'child-a', position: 0 })
    ]

    const tree = buildPageTree(pages)

    expect(tree.map((node) => node.page.id)).toEqual(['root-a', 'root-b'])
    expect(tree[0].children.map((node) => node.page.id)).toEqual(['child-a', 'child-b'])
    expect(tree[0].children[0].children.map((node) => node.page.id)).toEqual(['grandchild'])
  })

  it('ordena por createdAt si la posición empata', () => {
    const pages = [
      makePage({ id: 'late', position: 0, createdAt: 20 }),
      makePage({ id: 'early', position: 0, createdAt: 10 })
    ]

    expect(buildPageTree(pages).map((node) => node.page.id)).toEqual(['early', 'late'])
  })

  it('trata huérfanas y ciclos como raíces sin colgarse', () => {
    const pages = [
      makePage({ id: 'orphan', parentId: 'no-existe' }),
      makePage({ id: 'a', parentId: 'b' }),
      makePage({ id: 'b', parentId: 'a' })
    ]

    const tree = buildPageTree(pages)
    const ids = tree.flatMap((node) => [node.page.id, ...node.children.map((c) => c.page.id)])

    expect(ids).toContain('orphan')
    expect(tree).toHaveLength(3)
  })
})

describe('flattenPages', () => {
  it('aplana en orden de árbol (padre antes que hijas)', () => {
    const pages = [
      makePage({ id: 'root', position: 0 }),
      makePage({ id: 'child', parentId: 'root', position: 0 }),
      makePage({ id: 'sibling', position: 1 })
    ]

    expect(flattenPages(pages).map((page) => page.id)).toEqual(['root', 'child', 'sibling'])
  })
})

describe('pageAncestors', () => {
  it('devuelve la cadena de ancestros de raíz a padre', () => {
    const pages = [
      makePage({ id: 'root' }),
      makePage({ id: 'child', parentId: 'root' }),
      makePage({ id: 'grandchild', parentId: 'child' })
    ]

    expect(pageAncestors(pages, 'grandchild').map((page) => page.id)).toEqual(['root', 'child'])
    expect(pageAncestors(pages, 'root')).toEqual([])
    expect(pageAncestors(pages, 'no-existe')).toEqual([])
  })

  it('corta cadenas cíclicas', () => {
    const pages = [
      makePage({ id: 'a', parentId: 'b' }),
      makePage({ id: 'b', parentId: 'a' })
    ]

    expect(pageAncestors(pages, 'a').map((page) => page.id)).toEqual(['b'])
  })
})

describe('collectDescendantIds', () => {
  it('recoge descendientes en todos los niveles', () => {
    const pages = [
      makePage({ id: 'root' }),
      makePage({ id: 'child', parentId: 'root' }),
      makePage({ id: 'grandchild', parentId: 'child' }),
      makePage({ id: 'other' })
    ]

    expect(collectDescendantIds(pages, 'root')).toEqual(['child', 'grandchild'])
    expect(collectDescendantIds(pages, 'other')).toEqual([])
  })
})

describe('nextPageAfterDelete', () => {
  it('prefiere al padre', () => {
    const pages = [
      makePage({ id: 'root' }),
      makePage({ id: 'child', parentId: 'root' }),
      makePage({ id: 'grandchild', parentId: 'child' })
    ]

    expect(nextPageAfterDelete(pages, 'child')).toBe('root')
  })

  it('sin padre elige la página anterior visible', () => {
    const pages = [
      makePage({ id: 'first', position: 0 }),
      makePage({ id: 'second', position: 1 }),
      makePage({ id: 'third', position: 2 })
    ]

    expect(nextPageAfterDelete(pages, 'third')).toBe('second')
  })

  it('si no hay anterior elige la siguiente fuera del subárbol', () => {
    const pages = [
      makePage({ id: 'first', position: 0 }),
      makePage({ id: 'second', position: 1 }),
      makePage({ id: 'child', parentId: 'first' })
    ]

    expect(nextPageAfterDelete(pages, 'first')).toBe('second')
  })

  it('devuelve null cuando no queda ninguna página', () => {
    const pages = [makePage({ id: 'only' })]

    expect(nextPageAfterDelete(pages, 'only')).toBeNull()
  })
})
