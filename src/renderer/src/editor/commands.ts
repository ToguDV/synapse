import type { BlockType } from '../../../shared/types'
import { t, tList } from '../i18n'
import { BLOCK_MENU_ORDER, getBlockDefinition } from './registry'

interface InputRule {
  pattern: RegExp
  type: BlockType
}

export interface InputRuleMatch {
  type: BlockType
  text: string
}

export const INPUT_RULES: InputRule[] = [
  { pattern: /^#{1,3}\s/, type: 'heading' },
  { pattern: /^[-*+]\s/, type: 'bullet' },
  { pattern: /^\[\s?\]\s/, type: 'todo' },
  { pattern: /^>\s/, type: 'quote' },
  { pattern: /^`{3}$/, type: 'code' },
  { pattern: /^(---|\*\*\*|___)$/, type: 'divider' }
]

export function matchInputRule(text: string): InputRuleMatch | null {
  for (const rule of INPUT_RULES) {
    const match = rule.pattern.exec(text)
    if (match) return { type: rule.type, text: text.slice(match[0].length) }
  }
  return null
}

export interface SlashCommand {
  type: BlockType
  label: string
  description: string
  icon: string
  keywords: string[]
}

export function buildSlashCommands(): SlashCommand[] {
  return BLOCK_MENU_ORDER.map((type) => {
    const definition = getBlockDefinition(type)
    return {
      type,
      label: t(`blocks.${type}.label`),
      description: t(`blocks.${type}.description`),
      icon: definition.icon,
      keywords: [type, ...tList(`blocks.${type}.keywords`)]
    }
  })
}

export function filterSlashCommands(query: string, commands: SlashCommand[]): SlashCommand[] {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return commands
  return commands.filter((command) =>
    command.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))
  )
}
