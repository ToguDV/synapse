import type { BlockType } from '../../../shared/types'

export interface BlockDefinition {
  type: BlockType
  icon: string
  textClasses: string
  continuation: BlockType
  textual: boolean
}

export const BLOCK_MENU_ORDER: BlockType[] = [
  'paragraph',
  'heading',
  'bullet',
  'todo',
  'code',
  'quote',
  'divider'
]

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  paragraph: {
    type: 'paragraph',
    icon: '¶',
    textClasses: 'text-base leading-7 whitespace-pre-wrap break-words',
    continuation: 'paragraph',
    textual: true
  },
  heading: {
    type: 'heading',
    icon: 'H1',
    textClasses: 'text-2xl font-semibold leading-9 whitespace-pre-wrap break-words',
    continuation: 'paragraph',
    textual: true
  },
  bullet: {
    type: 'bullet',
    icon: '•',
    textClasses: 'text-base leading-7 whitespace-pre-wrap break-words',
    continuation: 'bullet',
    textual: true
  },
  todo: {
    type: 'todo',
    icon: '☑',
    textClasses: 'text-base leading-7 whitespace-pre-wrap break-words',
    continuation: 'todo',
    textual: true
  },
  code: {
    type: 'code',
    icon: '</>',
    textClasses: 'font-mono text-sm leading-6 whitespace-pre-wrap break-words',
    continuation: 'code',
    textual: true
  },
  quote: {
    type: 'quote',
    icon: '❝',
    textClasses:
      'border-l-2 border-border-strong pl-3 text-base italic leading-7 text-ink-soft whitespace-pre-wrap break-words',
    continuation: 'quote',
    textual: true
  },
  divider: {
    type: 'divider',
    icon: '—',
    textClasses: '',
    continuation: 'paragraph',
    textual: false
  }
}

export function getBlockDefinition(type: BlockType): BlockDefinition {
  return BLOCK_DEFINITIONS[type]
}
