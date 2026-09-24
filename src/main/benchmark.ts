const enabled = process.env['SYNAPSE_BENCHMARK'] === '1'
const startedAt = process.hrtime.bigint()

export function isBenchmarkEnabled(): boolean {
  return enabled
}

export function benchmarkEvent(
  name: string,
  details: Record<string, unknown> = {}
): void {
  if (!enabled) return
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
  process.stdout.write(`SYNAPSE_BENCHMARK ${JSON.stringify({ name, elapsedMs, ...details })}\n`)
}

export function benchmarkMeasure<T>(
  name: string,
  operation: () => T,
  details?: (value: T) => Record<string, unknown>
): T {
  if (!enabled) return operation()
  const started = process.hrtime.bigint()
  try {
    const value = operation()
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000
    benchmarkEvent(name, { durationMs, ...details?.(value) })
    return value
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000
    benchmarkEvent(name, {
      durationMs,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}
