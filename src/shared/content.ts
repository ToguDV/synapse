export interface BlockContent {
  text: string
  checked: boolean
}

export function parseBlockContent(raw: string): BlockContent {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') {
      const data = parsed as { text?: unknown; checked?: unknown }
      if (typeof data.text === 'string') {
        return { text: data.text, checked: data.checked === true }
      }
    }
  } catch {
    // contenido corrupto: mejor vacío que romper el editor
  }
  return { text: '', checked: false }
}

export function parseContent(raw: string): string {
  return parseBlockContent(raw).text
}

export function serializeContent(text: string, checked = false): string {
  return checked ? JSON.stringify({ text, checked: true }) : JSON.stringify({ text })
}
