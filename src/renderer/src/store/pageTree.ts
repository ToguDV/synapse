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
