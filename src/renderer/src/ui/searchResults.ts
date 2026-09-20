export interface Snippet {
  before: string
  match: string
  after: string
  ellipsisStart: boolean
  ellipsisEnd: boolean
}

export function findMatch(
  text: string,
  term: string
): { start: number; end: number } | null {
  if (term === '') return null
  const start = text.toLowerCase().indexOf(term.toLowerCase())
  if (start === -1) return null
  return { start, end: start + term.length }
}

export function buildSnippet(text: string, term: string, radius = 40): Snippet {
  const match = findMatch(text, term)
  if (!match) {
    const end = Math.min(text.length, radius * 2)
    return {
      before: text.slice(0, end),
      match: '',
      after: '',
      ellipsisStart: false,
      ellipsisEnd: end < text.length
    }
  }
  const start = Math.max(0, match.start - radius)
  const end = Math.min(text.length, match.end + radius)
  return {
    before: text.slice(start, match.start),
    match: text.slice(match.start, match.end),
    after: text.slice(match.end, end),
    ellipsisStart: start > 0,
    ellipsisEnd: end < text.length
  }
}
