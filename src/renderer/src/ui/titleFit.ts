export const TITLE_FONT_MAX = 36
export const TITLE_FONT_MIN = 24
const TITLE_LINE_RATIO = 40 / 36

export function fitTitleFontSize(available: number, measure: (size: number) => number): number {
  if (available <= 0) return TITLE_FONT_MAX
  for (let size = TITLE_FONT_MAX; size > TITLE_FONT_MIN; size -= 1) {
    if (measure(size) <= available) return size
  }
  return TITLE_FONT_MIN
}

export function titleLineHeight(size: number): number {
  return Math.round(size * TITLE_LINE_RATIO)
}

export function titleIconOffset(size: number, iconSize: number): number {
  return (titleLineHeight(size) - iconSize) / 2
}
