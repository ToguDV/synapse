import type { Page } from './types'

// Semántica de dominio pura compartida por main (repositorios SQLite) y renderer
// (stores). e2e/mock-api.js la replica en JavaScript plano (se inyecta como
// script clásico vía addInitScript, sin resolución de módulos); la copia está
// pineada por tests/mockFidelity.test.ts. Sin dependencias de Node ni Electron.

export interface PageOrderKey {
  id: string
  position: number
  createdAt: number
}

// Orden canónico de hermanos y de listado: posición, luego createdAt, luego id
// como desempate determinista. El repositorio lo usa en JS (ordenar hermanos al
// mover); en SQL la regla equivalente es `ORDER BY position, created_at` con el
// mismo desempate cuando el orden es relevante para la semántica del move.
export function comparePageOrder(a: PageOrderKey, b: PageOrderKey): number {
  return a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
}

// Descendientes transitivos de una página (BFS determinista por orden de
// entrada; tolera ciclos). El repositorio consigue lo mismo con FK
// `ON DELETE CASCADE`; el renderer y el mock la usan explícitamente.
export function collectDescendantIds(pages: readonly Page[], id: string): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const page of pages) {
    if (!page.parentId) continue
    const list = childrenOf.get(page.parentId)
    if (list) list.push(page.id)
    else childrenOf.set(page.parentId, [page.id])
  }
  const result: string[] = []
  const seen = new Set([id])
  const queue = [...(childrenOf.get(id) ?? [])]
  while (queue.length > 0) {
    const next = queue.shift()!
    if (seen.has(next)) continue
    seen.add(next)
    result.push(next)
    queue.push(...(childrenOf.get(next) ?? []))
  }
  return result
}

export interface PageMovePlan {
  parentId: string | null
  // Índice final de la página movida dentro de su nuevo padre (recortado a
  // [0, hermanos]). `position` es un índice de inserción entre los hermanos
  // del padre destino, excluyendo a la propia página.
  position: number
  // Posiciones nuevas SOLO de las páginas que cambian (sin la movida, que la
  // escribe el consumidor con parentId/position).
  updates: Map<string, number>
  // true si el move no altera el orden resultante (para devolver la misma
  // referencia en el renderer; el repositorio igualmente escribe y toca
  // updated_at).
  noop: boolean
}

// Calcula las posiciones resultantes de mover `id` al padre `parentId` en el
// índice de inserción `index`. Devuelve null para movimientos inválidos:
// página o padre inexistente, mover bajo sí misma o dentro de su propio
// subárbol. Consumidores: pageTree.movePage (renderer), repositorio pages.move
// (main, tras validar con sus mensajes de error) y la réplica del mock.
export function planPageMove(
  pages: readonly Page[],
  id: string,
  parentId: string | null,
  index: number
): PageMovePlan | null {
  const target = pages.find((page) => page.id === id)
  if (!target) return null
  if (parentId !== null) {
    const parentExists = pages.some((page) => page.id === parentId)
    if (!parentExists) return null
    if (parentId === id || collectDescendantIds(pages, id).includes(parentId)) return null
  }
  const siblingsOf = (pid: string | null): Page[] =>
    pages.filter((page) => page.parentId === pid && page.id !== id).sort(comparePageOrder)
  const newSiblings = siblingsOf(parentId)
  const position = Math.max(0, Math.min(index, newSiblings.length))
  let noop = false
  if (target.parentId === parentId) {
    const currentOrder = pages.filter((page) => page.parentId === parentId).sort(comparePageOrder)
    noop = currentOrder.findIndex((page) => page.id === id) === position
  }
  const targetOrder = [...newSiblings]
  targetOrder.splice(position, 0, target)
  const updates = new Map<string, number>()
  targetOrder.forEach((page, nextPosition) => {
    if (page.id !== id && nextPosition !== page.position) updates.set(page.id, nextPosition)
  })
  if (target.parentId !== parentId) {
    siblingsOf(target.parentId).forEach((page, nextPosition) => {
      if (nextPosition !== page.position) updates.set(page.id, nextPosition)
    })
  }
  return { parentId, position, updates, noop }
}
