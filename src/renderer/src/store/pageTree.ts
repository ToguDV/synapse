import type { Page } from '../../../shared/types'

export interface PageNode {
  page: Page
  children: PageNode[]
}

const byPosition = (a: Page, b: Page): number =>
  a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id)

function createsCycle(byId: Map<string, Page>, page: Page): boolean {
  const seen = new Set([page.id])
  let current = page.parentId
  while (current) {
    if (seen.has(current)) return true
    seen.add(current)
    current = byId.get(current)?.parentId ?? null
  }
  return false
}

export function buildPageTree(pages: Page[]): PageNode[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const nodes = new Map<string, PageNode>()
  for (const page of pages) nodes.set(page.id, { page, children: [] })
  const roots: PageNode[] = []
  for (const page of pages) {
    const node = nodes.get(page.id)!
    const parent = page.parentId ? nodes.get(page.parentId) : undefined
    const validParent = parent && parent !== node && !createsCycle(byId, page)
    if (validParent) parent!.children.push(node)
    else roots.push(node)
  }
  const sortNodes = (list: PageNode[]): void => {
    list.sort((a, b) => byPosition(a.page, b.page))
    for (const node of list) sortNodes(node.children)
  }
  sortNodes(roots)
  return roots
}

export function flattenPages(pages: Page[]): Page[] {
  const result: Page[] = []
  const visit = (nodes: PageNode[]): void => {
    for (const node of nodes) {
      result.push(node.page)
      visit(node.children)
    }
  }
  visit(buildPageTree(pages))
  return result
}

export function pageAncestors(pages: Page[], id: string): Page[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const chain: Page[] = []
  const seen = new Set([id])
  let current = byId.get(id)?.parentId ?? null
  while (current) {
    if (seen.has(current)) break
    seen.add(current)
    const parent = byId.get(current)
    if (!parent) break
    chain.unshift(parent)
    current = parent.parentId
  }
  return chain
}

export function collectDescendantIds(pages: Page[], id: string): string[] {
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

// `index` es un índice de inserción entre los hermanos del padre destino
// (excluyendo la propia página), igual que la semántica del repositorio.
export function movePage(
  pages: Page[],
  id: string,
  parentId: string | null,
  index: number
): Page[] {
  const target = pages.find((page) => page.id === id)
  if (!target) return pages
  if (parentId !== null) {
    if (!pages.some((page) => page.id === parentId)) return pages
    if (parentId === id || collectDescendantIds(pages, id).includes(parentId)) return pages
  }
  const siblingsOf = (pid: string | null): Page[] =>
    pages.filter((page) => page.parentId === pid && page.id !== id).sort(byPosition)
  const newSiblings = siblingsOf(parentId)
  const clamped = Math.max(0, Math.min(index, newSiblings.length))
  if (target.parentId === parentId) {
    const currentOrder = pages
      .filter((page) => page.parentId === parentId)
      .sort(byPosition)
    if (currentOrder.findIndex((page) => page.id === id) === clamped) return pages
  }
  const targetOrder = [...newSiblings]
  targetOrder.splice(clamped, 0, target)
  const positionById = new Map<string, number>()
  targetOrder.forEach((page, position) => positionById.set(page.id, position))
  if (target.parentId !== parentId) {
    siblingsOf(target.parentId).forEach((page, position) => positionById.set(page.id, position))
  }
  const moved = { ...target, parentId, position: clamped }
  return pages.map((page) => {
    if (page.id === id) return moved
    const nextPosition = positionById.get(page.id)
    if (nextPosition === undefined || nextPosition === page.position) return page
    return { ...page, position: nextPosition }
  })
}

export function nextPageAfterDelete(pages: Page[], id: string): string | null {
  const target = pages.find((page) => page.id === id)
  if (!target) return flattenPages(pages)[0]?.id ?? null
  if (target.parentId) return target.parentId
  const removed = new Set([id, ...collectDescendantIds(pages, id)])
  const flat = flattenPages(pages)
  const index = flat.findIndex((page) => page.id === id)
  for (let i = index - 1; i >= 0; i--) {
    if (!removed.has(flat[i].id)) return flat[i].id
  }
  for (let i = index + 1; i < flat.length; i++) {
    if (!removed.has(flat[i].id)) return flat[i].id
  }
  return null
}
