import { describe, expect, it } from 'vitest'

describe('pipeline', () => {
  it('vitest funciona dentro de la sandbox', () => {
    expect(1 + 1).toBe(2)
  })
})
