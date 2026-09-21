export const TODO_STATUSES = ['backlog', 'todo', 'in-progress', 'done', 'cancelled'] as const

export type TodoStatus = (typeof TODO_STATUSES)[number]

export interface BlockContent {
  text: string
  status: TodoStatus
}

export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (TODO_STATUSES as readonly string[]).includes(value)
}

export function parseBlockContent(raw: string): BlockContent {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') {
      const data = parsed as { text?: unknown; checked?: unknown; status?: unknown }
      if (typeof data.text === 'string') {
        const status: TodoStatus = isTodoStatus(data.status)
          ? data.status
          : data.checked === true
            ? 'done'
            : 'todo'
        return { text: data.text, status }
      }
    }
  } catch {
    // contenido corrupto: mejor vacío que romper el editor
  }
  return { text: '', status: 'todo' }
}

export function parseContent(raw: string): string {
  return parseBlockContent(raw).text
}

export function serializeContent(text: string, status: TodoStatus = 'todo'): string {
  return status === 'todo' ? JSON.stringify({ text }) : JSON.stringify({ text, status })
}
