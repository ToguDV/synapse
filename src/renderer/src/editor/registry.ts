import type { BlockType } from '../../../shared/types'

export interface BlockDefinition {
  type: BlockType
  label: string
  description: string
  icon: string
  keywords: string[]
  placeholder: string
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
    label: 'Texto',
    description: 'Párrafo simple',
    icon: '¶',
    keywords: ['texto', 'parrafo', 'párrafo', 'normal'],
    placeholder: "Escribe algo… ('/' para comandos)",
    textClasses: 'text-base leading-7 whitespace-pre-wrap break-words',
    continuation: 'paragraph',
    textual: true
  },
  heading: {
    type: 'heading',
    label: 'Título',
    description: 'Encabezado grande',
    icon: 'H1',
    keywords: ['titulo', 'título', 'encabezado', 'heading', 'h1', 'h2', 'h3'],
    placeholder: 'Título',
    textClasses: 'text-2xl font-semibold leading-9 whitespace-pre-wrap break-words',
    continuation: 'paragraph',
    textual: true
  },
  bullet: {
    type: 'bullet',
    label: 'Lista con viñetas',
    description: 'Elemento de lista',
    icon: '•',
    keywords: ['lista', 'viñeta', 'vineta', 'bullet', 'punto'],
    placeholder: 'Elemento de lista',
    textClasses: 'text-base leading-7 whitespace-pre-wrap break-words',
    continuation: 'bullet',
    textual: true
  },
  todo: {
    type: 'todo',
    label: 'Tarea',
    description: 'Casilla de por hacer',
    icon: '☑',
    keywords: ['tarea', 'todo', 'checkbox', 'casilla', 'por hacer'],
    placeholder: 'Por hacer',
    textClasses: 'text-base leading-7 whitespace-pre-wrap break-words',
    continuation: 'todo',
    textual: true
  },
  code: {
    type: 'code',
    label: 'Código',
    description: 'Bloque monoespaciado',
    icon: '</>',
    keywords: ['codigo', 'código', 'code', 'monoespaciado'],
    placeholder: 'Código',
    textClasses: 'font-mono text-sm leading-6 whitespace-pre-wrap break-words',
    continuation: 'code',
    textual: true
  },
  quote: {
    type: 'quote',
    label: 'Cita',
    description: 'Cita destacada',
    icon: '❝',
    keywords: ['cita', 'quote', 'blockquote'],
    placeholder: 'Cita',
    textClasses:
      'border-l-2 border-neutral-700 pl-3 text-base italic leading-7 text-neutral-300 whitespace-pre-wrap break-words',
    continuation: 'quote',
    textual: true
  },
  divider: {
    type: 'divider',
    label: 'Divisor',
    description: 'Línea separadora',
    icon: '—',
    keywords: ['divisor', 'separador', 'linea', 'línea', 'divider'],
    placeholder: '',
    textClasses: '',
    continuation: 'paragraph',
    textual: false
  }
}

export function getBlockDefinition(type: BlockType): BlockDefinition {
  return BLOCK_DEFINITIONS[type]
}
