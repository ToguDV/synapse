import type { BlockType } from '../../../shared/types'

export type BlockLayout = 'text' | 'boxed' | 'divider'
export type BlockPrefix = 'none' | 'bullet' | 'todo'

export interface BlockDefinition {
  type: BlockType
  icon: string
  textClasses: string
  continuation: BlockType
  textual: boolean
  layout: BlockLayout
  prefixKind: BlockPrefix
  hasStatus: boolean
  appendsParagraph: boolean
  softLineBreaks: boolean
  containerClasses?: string
  boxClasses?: string
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
    textClasses: 'text-base leading-[1.6] whitespace-pre-wrap break-words',
    continuation: 'paragraph',
    textual: true,
    layout: 'text',
    prefixKind: 'none',
    hasStatus: false,
    appendsParagraph: false,
    softLineBreaks: false
  },
  heading: {
    type: 'heading',
    icon: 'H1',
    textClasses: 'text-2xl font-semibold tracking-[-0.02em] leading-tight whitespace-pre-wrap break-words',
    continuation: 'paragraph',
    textual: true,
    layout: 'text',
    prefixKind: 'none',
    hasStatus: false,
    appendsParagraph: false,
    softLineBreaks: false,
    containerClasses: 'mt-[22px]'
  },
  bullet: {
    type: 'bullet',
    icon: '•',
    textClasses: 'text-base leading-[1.6] whitespace-pre-wrap break-words',
    continuation: 'bullet',
    textual: true,
    layout: 'text',
    prefixKind: 'bullet',
    hasStatus: false,
    appendsParagraph: false,
    softLineBreaks: false
  },
  todo: {
    type: 'todo',
    icon: '☑',
    textClasses: 'text-base leading-[1.6] whitespace-pre-wrap break-words',
    continuation: 'todo',
    textual: true,
    layout: 'text',
    prefixKind: 'todo',
    hasStatus: true,
    appendsParagraph: false,
    softLineBreaks: false
  },
  code: {
    type: 'code',
    icon: '</>',
    textClasses: 'font-mono text-sm leading-[1.7] text-ink-soft whitespace-pre-wrap break-words',
    continuation: 'code',
    textual: true,
    layout: 'boxed',
    prefixKind: 'none',
    hasStatus: false,
    appendsParagraph: false,
    softLineBreaks: true,
    boxClasses: 'my-2 w-full rounded-lg border border-border bg-code px-4 py-3.5'
  },
  quote: {
    type: 'quote',
    icon: '❝',
    textClasses:
      'my-2 border-l-[3px] border-accent pl-3.5 text-base leading-[1.6] text-ink-soft whitespace-pre-wrap break-words',
    continuation: 'quote',
    textual: true,
    layout: 'text',
    prefixKind: 'none',
    hasStatus: false,
    appendsParagraph: false,
    softLineBreaks: false
  },
  divider: {
    type: 'divider',
    icon: '—',
    textClasses: '',
    continuation: 'paragraph',
    textual: false,
    layout: 'divider',
    prefixKind: 'none',
    hasStatus: false,
    appendsParagraph: true,
    softLineBreaks: false
  }
}

export function getBlockDefinition(type: BlockType): BlockDefinition {
  return BLOCK_DEFINITIONS[type]
}
