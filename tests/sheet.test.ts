import { describe, expect, it } from 'vitest'
import { SHEET_SWIPE_THRESHOLD_PX, shouldDismissSheet } from '../src/renderer/src/ui/Sheet'

describe('shouldDismissSheet', () => {
  it('cierra al superar el umbral hacia abajo', () => {
    expect(shouldDismissSheet(SHEET_SWIPE_THRESHOLD_PX)).toBe(true)
    expect(shouldDismissSheet(SHEET_SWIPE_THRESHOLD_PX + 40)).toBe(true)
  })

  it('no cierra con arrastres cortos o hacia arriba', () => {
    expect(shouldDismissSheet(0)).toBe(false)
    expect(shouldDismissSheet(SHEET_SWIPE_THRESHOLD_PX - 1)).toBe(false)
    expect(shouldDismissSheet(-20)).toBe(false)
  })
})
