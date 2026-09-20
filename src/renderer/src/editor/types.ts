import type { BlockType } from '../../../shared/types'

export interface EditorBlock {
  id: string
  type: BlockType
  text: string
  indent: number
  checked?: boolean
}

export interface FocusTarget {
  blockId: string
  caret: number
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
