import type { TodoStatus } from '../../../shared/content'
import type { BlockType } from '../../../shared/types'
import { getBlockDefinition } from './registry'
import type { EditorBlock, TransformResult } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function blockAt(
  blocks: EditorBlock[],
  id: string
): { block: EditorBlock; index: number } | null {
  const index = blocks.findIndex((block) => block.id === id)
  if (index === -1) return null
  return { block: blocks[index], index }
}

export function maxIndentFor(blocks: EditorBlock[], index: number): number {
  if (index <= 0) return 0
  return blocks[index - 1].indent + 1
}

export function isTextualBlock(block: EditorBlock): boolean {
  return getBlockDefinition(block.type).textual
}

export function nearestTextualBlock(
  blocks: EditorBlock[],
  fromIndex: number,
  direction: -1 | 1
): EditorBlock | null {
  for (let index = fromIndex; index >= 0 && index < blocks.length; index += direction) {
    if (isTextualBlock(blocks[index])) return blocks[index]
  }
  return null
}

export function updateText(blocks: EditorBlock[], id: string, text: string): EditorBlock[] {
  const found = blockAt(blocks, id)
  if (!found || found.block.text === text) return blocks
  return blocks.map((block) => (block.id === id ? { ...block, text } : block))
}

export function updateStatus(blocks: EditorBlock[], id: string, status: TodoStatus): EditorBlock[] {
  const found = blockAt(blocks, id)
  if (!found || (found.block.status ?? 'todo') === status) return blocks
  return blocks.map((block) => (block.id === id ? { ...block, status } : block))
}

export function changeType(blocks: EditorBlock[], id: string, type: BlockType): EditorBlock[] {
  const found = blockAt(blocks, id)
  if (!found || found.block.type === type) return blocks
  return blocks.map((block) => (block.id === id ? { ...block, type } : block))
}

export function splitBlock(
  blocks: EditorBlock[],
  id: string,
  offset: number,
  newBlockId: string
): TransformResult {
  const found = blockAt(blocks, id)
  if (!found) return { blocks }
  const { block, index } = found
  const caret = clamp(offset, 0, block.text.length)
  const next: EditorBlock[] = blocks.map((candidate) =>
    candidate.id === id ? { ...candidate, text: block.text.slice(0, caret) } : candidate
  )
  next.splice(index + 1, 0, {
    id: newBlockId,
    type: getBlockDefinition(block.type).continuation,
    text: block.text.slice(caret),
    indent: block.indent,
    ...(block.type === 'todo' ? { status: 'todo' as TodoStatus } : {})
  })
  return { blocks: next, focus: { blockId: newBlockId, caret: 0 } }
}

export function mergeWithPrevious(blocks: EditorBlock[], id: string): TransformResult {
  const found = blockAt(blocks, id)
  if (!found || found.index === 0) return { blocks }
  const { block, index } = found
  const previous = blocks[index - 1]
  const next = blocks
    .filter((candidate) => candidate.id !== id)
    .map((candidate) =>
      candidate.id === previous.id
        ? { ...candidate, text: previous.text + block.text }
        : candidate
    )
  return { blocks: next, focus: { blockId: previous.id, caret: previous.text.length } }
}

export function mergeWithNext(blocks: EditorBlock[], id: string): TransformResult {
  const found = blockAt(blocks, id)
  if (!found) return { blocks }
  const nextBlock = blocks[found.index + 1]
  if (!nextBlock) return { blocks }
  const next = blocks
    .filter((candidate) => candidate.id !== nextBlock.id)
    .map((candidate) =>
      candidate.id === id ? { ...candidate, text: found.block.text + nextBlock.text } : candidate
    )
  return { blocks: next, focus: { blockId: id, caret: found.block.text.length } }
}

export function removeBlocks(blocks: EditorBlock[], ids: Iterable<string>): TransformResult {
  const removing = new Set(ids)
  const firstIndex = blocks.findIndex((block) => removing.has(block.id))
  if (firstIndex === -1) return { blocks }
  const next = blocks.filter((block) => !removing.has(block.id))
  const previous = nearestTextualBlock(next, firstIndex - 1, -1)
  if (previous) {
    return { blocks: next, focus: { blockId: previous.id, caret: previous.text.length } }
  }
  const following = nearestTextualBlock(next, firstIndex, 1)
  if (following) {
    return { blocks: next, focus: { blockId: following.id, caret: 0 } }
  }
  return { blocks: next }
}

export function removeBlock(blocks: EditorBlock[], id: string): TransformResult {
  return removeBlocks(blocks, [id])
}

export function duplicateBlocks(
  blocks: EditorBlock[],
  ids: Iterable<string>,
  makeId: () => string
): { blocks: EditorBlock[]; newIds: string[] } {
  const selected = new Set(ids)
  const lastIndex = blocks.reduce(
    (acc, block, index) => (selected.has(block.id) ? index : acc),
    -1
  )
  if (lastIndex === -1) return { blocks, newIds: [] }
  const copies: EditorBlock[] = blocks
    .filter((block) => selected.has(block.id))
    .map((block) => ({ ...block, id: makeId() }))
  const next = [...blocks]
  next.splice(lastIndex + 1, 0, ...copies)
  return { blocks: next, newIds: copies.map((copy) => copy.id) }
}

export interface InsertSpec {
  id: string
  type: BlockType
  text?: string
  indent?: number
  status?: TodoStatus
}

export function insertAfter(
  blocks: EditorBlock[],
  afterId: string,
  specs: InsertSpec[]
): EditorBlock[] {
  const index = blocks.findIndex((block) => block.id === afterId)
  if (index === -1 || specs.length === 0) return blocks
  const created: EditorBlock[] = specs.map((spec) => ({
    id: spec.id,
    type: spec.type,
    text: spec.text ?? '',
    indent: spec.indent ?? 0,
    ...(spec.status === undefined ? {} : { status: spec.status })
  }))
  const next = [...blocks]
  next.splice(index + 1, 0, ...created)
  return next
}

export function indentBlock(blocks: EditorBlock[], id: string): EditorBlock[] {
  const found = blockAt(blocks, id)
  if (!found || found.index === 0) return blocks
  const previous = blocks[found.index - 1]
  if (found.block.indent >= previous.indent + 1) return blocks
  return blocks.map((block) => (block.id === id ? { ...block, indent: block.indent + 1 } : block))
}

export function outdentBlock(blocks: EditorBlock[], id: string): EditorBlock[] {
  const found = blockAt(blocks, id)
  if (!found || found.block.indent === 0) return blocks
  return blocks.map((block) => (block.id === id ? { ...block, indent: block.indent - 1 } : block))
}

export function moveBlock(
  blocks: EditorBlock[],
  id: string,
  toIndex: number,
  indent?: number
): EditorBlock[] {
  const found = blockAt(blocks, id)
  if (!found) return blocks
  const target = clamp(toIndex, 0, blocks.length - 1)
  const next = [...blocks]
  next.splice(found.index, 1)
  const desired =
    indent === undefined ? found.block.indent : clamp(indent, 0, maxIndentFor(next, target))
  const moved = desired === found.block.indent ? found.block : { ...found.block, indent: desired }
  if (target === found.index && moved === found.block) return blocks
  next.splice(target, 0, moved)
  return next
}
