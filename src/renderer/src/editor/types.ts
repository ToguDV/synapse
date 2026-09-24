import type { TodoStatus } from '../../../shared/content'
import type { BlockType } from '../../../shared/types'

export interface EditorBlock {
  id: string
  type: BlockType
  text: string
  indent: number
  status?: TodoStatus
}

export interface FocusTarget {
  blockId: string
  caret: number
}

export interface BlockTextPoint {
  blockId: string
  offset: number
}

export interface BlockTextRange {
  start: BlockTextPoint
  end: BlockTextPoint
}

export interface TextRangeReplaceOptions {
  focus?: FocusTarget
  preserveBlockBoundary?: boolean
}

export interface TransformResult {
  blocks: EditorBlock[]
  focus?: FocusTarget
}

export interface RectAnchor {
  left: number
  top: number
  right: number
  bottom: number
}
