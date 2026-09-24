export interface Debouncer {
  schedule(fn: () => void): void
  cancel(): void
}

export function createDebouncer(delayMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    schedule(fn: () => void): void {
      clearTimeout(timer)
      timer = setTimeout(fn, delayMs)
    },
    cancel(): void {
      clearTimeout(timer)
      timer = undefined
    }
  }
}
