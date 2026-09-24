#!/usr/bin/env node
'use strict'

const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { performance } = require('node:perf_hooks')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_SIZES = [100, 1_000, 5_000, 10_000, 20_000, 50_000]
const PROFILES = ['flat-fixed', 'flat-per-page', 'tree-per-page']
const STARTUP_SLO_MS = 3_000
const SEARCH_UI_SLO_MS = 1_000
const STARTUP_TIMEOUT_MS = 60_000
const ACTION_TIMEOUT_MS = 15_000
const CDP_CONNECT_TIMEOUT_MS = 30_000
const CDP_COMMAND_TIMEOUT_MS = 20_000
// Let the 120ms UI debounce and its initial searching state settle before sampling.
const SEARCH_SETTLE_MS = 130
const DIRECT_TERMS = ['group-hit', 'page-needle', 'body-hit', 'block-needle', 'missing-needle']
const UI_TERMS = ['group-hit', 'body-hit', 'missing-needle']

function parseArgs(args) {
  const options = {
    sizes: DEFAULT_SIZES,
    profiles: PROFILES,
    startupRuns: 3,
    queryRuns: 30,
    uiRuns: 10,
    report: path.join(os.tmpdir(), 'synapse-pages-stress-report.json')
  }

  for (let index = 0; index < args.length; index += 1) {
    const part = args[index]
    if (part === '--help' || part === '-h') {
      options.help = true
      continue
    }
    if (!part.startsWith('--')) throw new Error(`Unexpected argument: ${part}`)
    const equals = part.indexOf('=')
    const key = part.slice(2, equals === -1 ? undefined : equals)
    const value = equals === -1 ? args[++index] : part.slice(equals + 1)
    if (value === undefined) throw new Error(`Missing value for --${key}`)
    if (key === 'sizes') options.sizes = value.split(',').map(Number)
    else if (key === 'profiles') options.profiles = value.split(',')
    else if (key === 'startup-runs') options.startupRuns = Number(value)
    else if (key === 'query-runs') options.queryRuns = Number(value)
    else if (key === 'ui-runs') options.uiRuns = Number(value)
    else if (key === 'report') options.report = path.resolve(value)
    else throw new Error(`Unknown option: --${key}`)
  }

  if (options.help) return options
  if (
    options.sizes.length === 0 ||
    options.sizes.some((size) => !Number.isSafeInteger(size) || size < 1 || size > 50_000)
  ) {
    throw new Error('Sizes must be integers between 1 and 50000')
  }
  if (options.profiles.length === 0 || options.profiles.some((profile) => !PROFILES.includes(profile))) {
    throw new Error(`Profiles must be selected from: ${PROFILES.join(', ')}`)
  }
  for (const [name, value] of [
    ['startup-runs', options.startupRuns],
    ['query-runs', options.queryRuns],
    ['ui-runs', options.uiRuns]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
      throw new Error(`--${name} must be an integer between 1 and 100`)
    }
  }
  options.sizes = [...new Set(options.sizes)].sort((a, b) => a - b)
  return options
}

function printHelp() {
  process.stdout.write(`Usage: npm run bench:pages -- [options]

Runs the packaged Electron app against real SQLite data in an isolated HOME.

Options:
  --sizes 100,1000,5000,10000,20000,50000
  --profiles flat-fixed,flat-per-page,tree-per-page
  --startup-runs 3     Fresh app processes per dataset
  --query-runs 30      Direct window.api.search.query samples per term
  --ui-runs 10         UI samples per common/no-result query
  --report PATH        JSON report destination (default: /tmp/synapse-pages-stress-report.json)
`)
}

function runCompose(args, options = {}) {
  return execFileSync('docker', ['compose', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: options.timeout ?? 30_000,
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function ensurePrerequisites() {
  const releaseDir = path.join(ROOT, 'release')
  const version = require('../package.json').version
  const appImageName = `Synapse-${version}-x86_64.AppImage`
  if (!fs.existsSync(path.join(releaseDir, appImageName))) {
    throw new Error('No Linux AppImage found. Build it first with: docker compose run --rm builder npm run dist:linux')
  }

  const running = runCompose(['ps', '--status', 'running', '-q', 'dev']).trim()
  if (!running) throw new Error('The dev container is not running. Start it with: docker compose up -d dev')
  return appImageName
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForExit(exit, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    exit.then((result) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

function captureProcess(child, run) {
  let stdoutBuffer = ''
  let stderrBuffer = ''

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const match = line.match(/SYNAPSE_BENCHMARK (\{.*\})/)
      if (!match) continue
      try {
        const event = JSON.parse(match[1])
        run.events.push({ ...event, observedAt: performance.now() })
        recordMemory(run, event)
      } catch {
        run.logErrors.push(`Could not parse benchmark event: ${line}`)
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    stderrBuffer = `${stderrBuffer}${chunk.toString()}`.slice(-8_000)
  })

  return () => {
    if (stdoutBuffer.trim() !== '') {
      const match = stdoutBuffer.match(/SYNAPSE_BENCHMARK (\{.*\})/)
      if (match) {
        try {
          const event = JSON.parse(match[1])
          run.events.push({ ...event, observedAt: performance.now() })
          recordMemory(run, event)
        } catch {
          run.logErrors.push(`Could not parse benchmark event: ${stdoutBuffer}`)
        }
      }
    }
    return stderrBuffer
  }
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.closed = false
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), {
        once: true
      })
    })

    this.socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      } catch {
        return
      }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result ?? {})
        return
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
    })

    this.socket.addEventListener('close', () => {
      this.closed = true
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error('CDP WebSocket closed'))
        this.pending.delete(id)
      }
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? []
    listeners.push(listener)
    this.listeners.set(method, listeners)
  }

  async send(method, params = {}, timeoutMs = CDP_COMMAND_TIMEOUT_MS) {
    await this.ready
    if (this.closed) throw new Error('CDP WebSocket is closed')
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP command timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression, timeoutMs = CDP_COMMAND_TIMEOUT_MS) {
    const response = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true, userGesture: true },
      timeoutMs
    )
    if (response.exceptionDetails) {
      const details = response.exceptionDetails
      throw new Error(details.exception?.description ?? details.text ?? 'Renderer evaluation failed')
    }
    return response.result?.value
  }

  disconnect() {
    if (!this.closed) this.socket.close()
  }
}

async function waitForTarget(port, child, timeoutMs = CDP_CONNECT_TIMEOUT_MS) {
  const deadline = performance.now() + timeoutMs
  const endpoint = `http://127.0.0.1:${port}/json/list`
  let lastError = null
  while (performance.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`App exited before CDP was available (${child.exitCode})`)
    try {
      const response = await fetch(endpoint)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
        if (target) return target
      }
    } catch (error) {
      lastError = error
    }
    await sleep(100)
  }
  throw new Error(`Timed out waiting for Electron DevTools${lastError ? `: ${lastError}` : ''}`)
}

async function waitForExpression(cdp, expression, { timeoutMs, description, pollMs = 50 }) {
  const deadline = performance.now() + timeoutMs
  let lastError = null
  while (performance.now() < deadline) {
    if (cdp.closed) throw new Error('Electron renderer closed while waiting for the UI')
    try {
      const value = await cdp.evaluate(expression, Math.min(CDP_COMMAND_TIMEOUT_MS, timeoutMs))
      if (value) return { value, observedAt: performance.now() }
    } catch (error) {
      lastError = error
      if (cdp.closed) throw error
    }
    await sleep(pollMs)
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`)
}

function findEvent(events, name) {
  return events.find((event) => event.name === name) ?? null
}

function recordMemory(run, event) {
  if (event.name !== 'memory-sample' || !Array.isArray(event.processes)) return
  const byType = new Map()
  let totalWorkingSetKb = 0
  for (const processInfo of event.processes) {
    const value = Number(processInfo.workingSetSizeKb) || 0
    totalWorkingSetKb += value
    byType.set(processInfo.type, (byType.get(processInfo.type) ?? 0) + value)
  }
  run.memory.peakTotalWorkingSetKb = Math.max(run.memory.peakTotalWorkingSetKb, totalWorkingSetKb)
  run.memory.processSamples += 1
  for (const [type, value] of byType) {
    run.memory.peakWorkingSetKbByType[type] = Math.max(
      run.memory.peakWorkingSetKbByType[type] ?? 0,
      value
    )
  }
}

function createRunState() {
  const run = {
    events: [],
    logErrors: [],
    runtimeErrors: [],
    consoleErrors: [],
    memory: {
      peakTotalWorkingSetKb: 0,
      peakWorkingSetKbByType: {},
      processSamples: 0
    }
  }
  return run
}

function summarize(samples) {
  const values = samples.map((sample) => Number(sample)).filter(Number.isFinite).sort((a, b) => a - b)
  if (values.length === 0) return null
  const percentile = (fraction) => values[Math.max(0, Math.ceil(fraction * values.length) - 1)]
  const rounded = (value) => Number(value.toFixed(2))
  return {
    samples: values.length,
    minMs: rounded(values[0]),
    medianMs: rounded(percentile(0.5)),
    p95Ms: rounded(percentile(0.95)),
    maxMs: rounded(values[values.length - 1]),
    meanMs: rounded(values.reduce((sum, value) => sum + value, 0) / values.length)
  }
}

function setMainMetrics(run) {
  return {
    appReadyMs: findEvent(run.events, 'app-ready')?.elapsedMs ?? null,
    databaseOpenMs: findEvent(run.events, 'database-open')?.elapsedMs ?? null,
    ipcReadyMs: findEvent(run.events, 'ipc-ready')?.elapsedMs ?? null,
    windowReadyMs: findEvent(run.events, 'window-ready')?.elapsedMs ?? null,
    initialPagesList: run.events.find((event) => event.name === 'pages:list') ?? null,
    initialBlocksList: run.events.find((event) => event.name === 'blocks:list') ?? null
  }
}

function keyCodes(key) {
  if (key === 'k') return { code: 'KeyK', windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75 }
  if (key === 'Escape') return { code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
  throw new Error(`Unsupported benchmark key: ${key}`)
}

async function pressKey(cdp, key, modifiers = 0) {
  const keyCode = keyCodes(key)
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    ...keyCode,
    modifiers
  })
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    ...keyCode,
    modifiers: 0
  })
}

async function openPalette(cdp) {
  await cdp.evaluate('window.__synapseBenchStartedAt = performance.now()')
  await pressKey(cdp, 'k', 2)
  await waitForExpression(cdp, "Boolean(document.querySelector('[data-search-input]'))", {
    timeoutMs: ACTION_TIMEOUT_MS,
    description: 'search palette'
  })
  return cdp.evaluate('performance.now() - window.__synapseBenchStartedAt')
}

async function enterSearchTerm(cdp, term) {
  await cdp.evaluate("document.querySelector('[data-search-input]')?.focus()")
  await cdp.evaluate('window.__synapseBenchStartedAt = performance.now()')
  await cdp.send('Input.insertText', { text: term })
  await waitForExpression(
    cdp,
    `(() => performance.now() - window.__synapseBenchStartedAt >= ${SEARCH_SETTLE_MS} &&
      !document.querySelector('[data-search-searching]') &&
      (document.querySelectorAll('[data-search-result]').length > 0 || Boolean(document.querySelector('[data-search-empty]'))))()`,
    { timeoutMs: ACTION_TIMEOUT_MS, description: `results for ${term}` }
  )
  await cdp.evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  return cdp.evaluate(`(() => ({
    durationMs: performance.now() - window.__synapseBenchStartedAt,
    resultCount: document.querySelectorAll('[data-search-result]').length,
    empty: Boolean(document.querySelector('[data-search-empty]'))
  }))()`)
}

async function closePalette(cdp) {
  if (cdp.closed) return
  await pressKey(cdp, 'Escape')
  await waitForExpression(cdp, "!document.querySelector('[data-search-palette]')", {
    timeoutMs: ACTION_TIMEOUT_MS,
    description: 'search palette close'
  })
}

async function clickFirstResult(cdp) {
  const point = await cdp.evaluate(`(() => {
    const element = document.querySelector('[data-search-result]')
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  if (!point) {
    const state = await cdp.evaluate(`(() => ({
      paletteOpen: Boolean(document.querySelector('[data-search-palette]')),
      inputValue: document.querySelector('[data-search-input]')?.value ?? null,
      resultCount: document.querySelectorAll('[data-search-result]').length,
      searching: Boolean(document.querySelector('[data-search-searching]')),
      empty: Boolean(document.querySelector('[data-search-empty]'))
    }))()`)
    throw new Error(`Search did not render a clickable result: ${JSON.stringify(state)}`)
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none'
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1
  })
}

async function runDirectSearches(cdp, queryRuns) {
  const results = {}
  for (const term of DIRECT_TERMS) {
    const samples = await cdp.evaluate(`(async () => {
      const samples = []
      for (let index = 0; index < ${queryRuns}; index += 1) {
        const startedAt = performance.now()
        const result = await window.api.search.query(${JSON.stringify(term)})
        samples.push({
          durationMs: performance.now() - startedAt,
          resultCount: result.length,
          pageResults: result.filter((item) => item.kind === 'page').length,
          blockResults: result.filter((item) => item.kind === 'block').length
        })
      }
      return samples
    })()`)
    results[term] = {
      firstQueryMs: samples[0]?.durationMs ?? null,
      all: summarize(samples.map((sample) => sample.durationMs)),
      repeated: summarize(samples.slice(1).map((sample) => sample.durationMs)),
      sampleResultCounts: samples.map((sample) => sample.resultCount)
    }
  }
  return results
}

async function runUiSearches(cdp, uiRuns) {
  const results = {}
  for (const term of UI_TERMS) {
    const paletteOpenSamples = []
    const resultSamples = []
    for (let index = 0; index < uiRuns; index += 1) {
      paletteOpenSamples.push(await openPalette(cdp))
      const result = await enterSearchTerm(cdp, term)
      resultSamples.push(result)
      await closePalette(cdp)
    }
    results[term] = {
      paletteOpen: summarize(paletteOpenSamples),
      visibleResults: summarize(resultSamples.map((sample) => sample.durationMs)),
      sampleResultCounts: resultSamples.map((sample) => sample.resultCount),
      emptySamples: resultSamples.filter((sample) => sample.empty).length
    }
  }
  return results
}

async function runNavigation(cdp, pageCount) {
  const targetPageId = `bench-page-${String(pageCount - 1).padStart(6, '0')}`
  const targetBlockId = `bench-block-${String(pageCount - 1).padStart(6, '0')}`

  await openPalette(cdp)
  await enterSearchTerm(cdp, 'page-needle')
  await cdp.evaluate('window.__synapseBenchStartedAt = performance.now()')
  await clickFirstResult(cdp)
  try {
    await waitForExpression(
      cdp,
      `(() => {
        const rows = [...document.querySelectorAll('[data-page-depth]')]
        const active = rows.find((row) => row.dataset.pageId === ${JSON.stringify(targetPageId)} && row.dataset.active === 'true')
        const block = document.querySelector('[data-block-id="${targetBlockId}"]')
        return !document.querySelector('[data-search-palette]') && Boolean(active) && Boolean(block)
      })()`,
      { timeoutMs: ACTION_TIMEOUT_MS, description: 'page navigation from search' }
    )
  } catch (error) {
    const state = await cdp.evaluate(`(() => ({
      paletteOpen: Boolean(document.querySelector('[data-search-palette]')),
      activeRows: [...document.querySelectorAll('[data-page-depth][data-active="true"]')].slice(0, 3).map((row) => row.dataset.pageId),
      targetRow: [...document.querySelectorAll('[data-page-depth]')].some((row) => row.dataset.pageId === ${JSON.stringify(targetPageId)}),
      targetBlock: Boolean(document.querySelector('[data-block-id="${targetBlockId}"]')),
      visibleResults: [...document.querySelectorAll('[data-search-result]')].slice(0, 3).map((row) => ({kind: row.dataset.kind, pageId: row.dataset.pageId, blockId: row.dataset.blockId})),
      activeElement: {tag: document.activeElement?.tagName, blockId: document.activeElement?.getAttribute('data-block-id'), searchInput: document.activeElement?.hasAttribute('data-search-input'), value: document.activeElement?.value}
    }))()`)
    throw new Error(`${error.message}; navigation state=${JSON.stringify(state)}`)
  }
  const pageNavigationMs = await cdp.evaluate('performance.now() - window.__synapseBenchStartedAt')

  await openPalette(cdp)
  await enterSearchTerm(cdp, 'block-needle')
  await cdp.evaluate('window.__synapseBenchStartedAt = performance.now()')
  await clickFirstResult(cdp)
  await waitForExpression(
    cdp,
    `(() => document.activeElement?.getAttribute('data-block-id') === ${JSON.stringify(targetBlockId)})()`,
    { timeoutMs: ACTION_TIMEOUT_MS, description: 'block focus navigation from search' }
  )
  const blockNavigationMs = await cdp.evaluate('performance.now() - window.__synapseBenchStartedAt')

  return { pageNavigationMs, blockNavigationMs }
}

function summarizeMainSearch(events, options) {
  const samples = events.filter((event) => event.name === 'search:query')
  let offset = 0
  const take = (count) => {
    const selected = samples.slice(offset, offset + count)
    offset += count
    return {
      handler: summarize(selected.map((event) => event.durationMs)),
      resultCounts: selected.map((event) => event.count)
    }
  }

  const direct = {}
  for (const term of DIRECT_TERMS) direct[term] = take(options.queryRuns)
  const ui = {}
  for (const term of UI_TERMS) ui[term] = take(options.uiRuns)
  const navigation = {
    page: take(1),
    block: take(1)
  }
  return { direct, ui, navigation, totalSamples: samples.length }
}

function seedDatabase({ home, pageCount, profile }) {
  const configHome = path.posix.join(home, '.config')
  const dbPath = path.posix.join(configHome, 'synapse', 'synapse.db')
  const output = runCompose(
    [
      'exec',
      '-T',
      'dev',
      'node',
      '/app/benchmarks/seed-pages.cjs',
      '--db',
      dbPath,
      '--pages',
      String(pageCount),
      '--profile',
      profile
    ],
    { timeout: 120_000 }
  )
  const line = output.match(/SYNAPSE_BENCH_SEED (\{.*\})/)
  if (!line) throw new Error(`Seeder did not return its summary: ${output}`)
  return JSON.parse(line[1])
}

function launchApp({ appImageName, home, port }) {
  const startedAt = performance.now()
  const child = spawn(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-e',
      `HOME=${home}`,
      '-e',
      `XDG_CONFIG_HOME=${path.posix.join(home, '.config')}`,
      '-e',
      'SYNAPSE_BENCHMARK=1',
      'dev',
      'xvfb-run',
      '-a',
      '-s',
      '-screen 0 1280x800x24',
      `/app/release/${appImageName}`,
      '--appimage-extract-and-run',
      '--no-sandbox',
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*'
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const run = createRunState()
  const readStderr = captureProcess(child, run)
  const exit = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', (error) => resolve({ code: null, signal: null, error: error.message }))
  })
  return { child, run, readStderr, exit, startedAt }
}

async function stopApp({ child, cdp, exit, port }) {
  if (cdp && !cdp.closed) {
    try {
      await cdp.send('Page.close', {}, 2_000)
    } catch {
      // The target may already be closing.
    }
  }

  let exitResult = await waitForExit(exit, 5_000)
  if (!exitResult) {
    try {
      runCompose(['exec', '-T', 'dev', 'pkill', '-f', `[r]emote-debugging-port=${port}`], {
        timeout: 5_000
      })
    } catch {
      // The app may have exited between the timeout and the cleanup command.
    }
    child.kill('SIGTERM')
    exitResult = await waitForExit(exit, 3_000)
  }
  if (!exitResult) child.kill('SIGKILL')
  cdp?.disconnect()
  return exitResult
}

async function benchmarkProcess({ appImageName, home, pageCount, firstRun, options }) {
  const port = await allocatePort()
  const session = launchApp({ appImageName, home, port })
  let cdp = null
  let stderr = ''
  let result = null
  try {
    const target = await waitForTarget(port, session.child)
    cdp = new CdpClient(target.webSocketDebuggerUrl)
    cdp.on('Runtime.exceptionThrown', (event) => {
      session.run.runtimeErrors.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? 'Renderer exception')
    })
    cdp.on('Runtime.consoleAPICalled', (event) => {
      if (event.type !== 'error') return
      const text = (event.args ?? []).map((argument) => argument.value ?? argument.description ?? '').join(' ')
      session.run.consoleErrors.push(text)
    })
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    const usable = await waitForExpression(
      cdp,
      `(() => {
        const editor = document.querySelector('div[contenteditable]')
        const pageRows = document.querySelectorAll('[data-page-depth]').length
        return editor && pageRows >= ${pageCount}
          ? { pageRows, editorBlockId: editor.getAttribute('data-block-id') }
          : null
      })()`,
      {
        timeoutMs: STARTUP_TIMEOUT_MS,
        description: `usable editor and ${pageCount} rendered sidebar rows`
      }
    )

    const mainStart = findEvent(session.run.events, 'main-start')
    const mainStartHostTime = mainStart ? mainStart.observedAt - mainStart.elapsedMs : null
    const startup = {
      launchToUsableMs: Number((usable.observedAt - session.startedAt).toFixed(2)),
      mainStartToUsableMs:
        mainStartHostTime === null ? null : Number((usable.observedAt - mainStartHostTime).toFixed(2)),
      mainStartToWindowReadyMs: findEvent(session.run.events, 'window-ready')?.elapsedMs ?? null,
      launchToWindowReadyObservedMs: (() => {
        const ready = findEvent(session.run.events, 'window-ready')
        return ready ? Number((ready.observedAt - session.startedAt).toFixed(2)) : null
      })(),
      sidebarRows: usable.value.pageRows,
      initialEditorBlockId: usable.value.editorBlockId,
      main: setMainMetrics(session.run)
    }

    let search = null
    let navigation = null
    let workloadFailure = null
    if (firstRun) {
      search = { directIpc: null, ui: null, mainHandler: null }
      try {
        search.directIpc = await runDirectSearches(cdp, options.queryRuns)
        search.ui = await runUiSearches(cdp, options.uiRuns)
        navigation = await runNavigation(cdp, pageCount)
        search.mainHandler = summarizeMainSearch(session.run.events, options)
        await sleep(600)
      } catch (error) {
        workloadFailure = error instanceof Error ? error.message : String(error)
      }
    }

    stderr = session.readStderr()
    result = {
      startup,
      search,
      navigation,
      failure: workloadFailure,
      memory: session.run.memory,
      runtimeErrors: session.run.runtimeErrors,
      consoleErrors: session.run.consoleErrors,
      logErrors: session.run.logErrors,
      stderr: stderr || null
    }
    return result
  } finally {
    const exitResult = await stopApp({ child: session.child, cdp, exit: session.exit, port })
    stderr = session.readStderr()
    session.finalExit = exitResult
    if (result) {
      result.processExit = exitResult
      result.stderr = stderr || result.stderr
    }
  }
}

function computeCapacity(cases) {
  const result = {}
  for (const profile of PROFILES) {
    const profileCases = cases.filter((item) => item.profile === profile)
    const stable = profileCases.filter((item) => item.status === 'stable')
    const passing = stable.filter((item) => item.slo?.passed)
    result[profile] = {
      maxStableTested: stable.length ? Math.max(...stable.map((item) => item.pages)) : null,
      maxWithinSlo: passing.length ? Math.max(...passing.map((item) => item.pages)) : null,
      firstFailure: profileCases.find((item) => item.status !== 'stable')?.failure ?? null,
      firstSloBreach: stable.find((item) => !item.slo?.passed)?.pages ?? null
    }
  }
  return result
}

function summarizeUiSearches(search) {
  const result = {}
  for (const term of UI_TERMS) {
    const samples = search?.ui?.[term]
    if (!samples) continue
    result[term] = samples.visibleResults
  }
  return result
}

async function benchmarkCase({ appImageName, containerRoot, pageCount, profile, options }) {
  const home = path.posix.join(containerRoot, `${profile}-${pageCount}`, 'home')
  const database = seedDatabase({ home, pageCount, profile })
  const runs = []
  let failure = null

  for (let index = 0; index < options.startupRuns; index += 1) {
    const label = `run ${index + 1}/${options.startupRuns}`
    process.stdout.write(`    ${label}: launching app\n`)
    try {
      const measured = await benchmarkProcess({
        appImageName,
        home,
        pageCount,
        firstRun: index === 0,
        options
      })
      runs.push(measured)
      if (measured.failure) throw new Error(measured.failure)
      if (measured.startup.sidebarRows !== pageCount) {
        throw new Error(`Expected ${pageCount} sidebar rows, got ${measured.startup.sidebarRows}`)
      }
      if (measured.runtimeErrors.length > 0) {
        throw new Error(`Renderer errors: ${measured.runtimeErrors.join(' | ')}`)
      }
      process.stdout.write(
        `      usable=${measured.startup.mainStartToUsableMs === null ? 'n/a' : `${measured.startup.mainStartToUsableMs}ms`}, ready=${measured.startup.mainStartToWindowReadyMs === null ? 'n/a' : `${measured.startup.mainStartToWindowReadyMs}ms`}, sidebar=${measured.startup.sidebarRows}\n`
      )
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
      process.stdout.write(`      FAILED: ${failure}\n`)
      break
    }
  }

  const startupStats = summarize(runs.map((run) => run.startup.mainStartToUsableMs).filter(Number.isFinite))
  const launchStats = summarize(runs.map((run) => run.startup.launchToUsableMs))
  const uiStats = summarizeUiSearches(runs.find((run) => run.search)?.search)
  const uiP95Values = Object.values(uiStats).map((stat) => stat?.p95Ms).filter(Number.isFinite)
  const searchUiP95Ms = uiP95Values.length ? Math.max(...uiP95Values) : null
  const slo = {
    startupP95Ms: startupStats?.p95Ms ?? null,
    searchUiP95Ms,
    startupPassed: startupStats !== null && startupStats.p95Ms <= STARTUP_SLO_MS,
    searchPassed: searchUiP95Ms !== null && searchUiP95Ms <= SEARCH_UI_SLO_MS
  }
  slo.passed = !failure && slo.startupPassed && slo.searchPassed

  return {
    profile,
    pages: pageCount,
    status: failure ? 'failed' : 'stable',
    failure,
    dataset: database,
    repetitions: runs.length,
    startup: {
      mainStartToUsable: startupStats,
      launchToUsable: launchStats,
      samples: runs.map((run) => run.startup),
      pageListMs: runs.map((run) => run.startup.main.initialPagesList?.durationMs ?? null),
      blockListMs: runs.map((run) => run.startup.main.initialBlocksList?.durationMs ?? null)
    },
    search: {
      directIpc: runs.find((run) => run.search)?.search?.directIpc ?? null,
      ui: runs.find((run) => run.search)?.search?.ui ?? null,
      mainHandler: runs.find((run) => run.search)?.search?.mainHandler ?? null,
      uiSummary: uiStats
    },
    navigation: runs.find((run) => run.navigation)?.navigation ?? null,
    memory: {
      peakTotalWorkingSetKb: Math.max(0, ...runs.map((run) => run.memory.peakTotalWorkingSetKb)),
      peakWorkingSetKbByType: runs.reduce((combined, run) => {
        for (const [type, value] of Object.entries(run.memory.peakWorkingSetKbByType)) {
          combined[type] = Math.max(combined[type] ?? 0, value)
        }
        return combined
      }, {}),
      samples: runs.reduce((sum, run) => sum + run.memory.processSamples, 0)
    },
    runtimeErrors: runs.flatMap((run) => run.runtimeErrors),
    consoleErrors: runs.flatMap((run) => run.consoleErrors),
    slo
  }
}

function environmentInfo() {
  return {
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    node: process.version,
    cpuModel: os.cpus()[0]?.model ?? null,
    cpuCount: os.availableParallelism?.() ?? os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    display: 'Xvfb, 1280x800x24',
    gpu: 'Electron GPU disabled in the dev container'
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const appImageName = ensurePrerequisites()
  const containerRoot = `/tmp/synapse-pages-stress-${process.pid}-${Date.now()}`
  const report = {
    benchmark: 'pages-scalability',
    startedAt: new Date().toISOString(),
    appImage: appImageName,
    environment: environmentInfo(),
    criteria: {
      usableStartupP95Ms: STARTUP_SLO_MS,
      visibleSearchP95Ms: SEARCH_UI_SLO_MS,
      maxPages: 50_000,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      actionTimeoutMs: ACTION_TIMEOUT_MS,
      queryRuns: options.queryRuns,
      uiRunsPerTerm: options.uiRuns,
      startupRunsPerDataset: options.startupRuns,
      note: 'UI search includes the current 120ms debounce. Main-start timings exclude AppImage/Electron boot and the Xvfb/Docker launcher overhead; launch-to-usable timings include Docker, Xvfb and --appimage-extract-and-run.'
    },
    results: [],
    capacity: null
  }

  let interrupted = false
  const onSigint = () => {
    interrupted = true
    process.stdout.write('\nInterrupted; finishing cleanup.\n')
  }
  process.once('SIGINT', onSigint)

  try {
    const totalCases = options.profiles.length * options.sizes.length
    let completedCases = 0
    for (const profile of options.profiles) {
      let stopProfile = false
      for (const pageCount of options.sizes) {
        if (interrupted) break
        if (stopProfile) break
        completedCases += 1
        process.stdout.write(
          `[${completedCases}/${totalCases}] ${profile}, ${pageCount.toLocaleString()} pages\n`
        )
        const result = await benchmarkCase({ appImageName, containerRoot, pageCount, profile, options })
        report.results.push(result)
        const startup = result.startup.mainStartToUsable
        const search = result.slo.searchUiP95Ms
        process.stdout.write(
          `    summary: startup p95=${startup ? `${startup.p95Ms}ms` : 'n/a'}, UI search p95=${search === null ? 'n/a' : `${search}ms`}, within SLO=${result.slo.passed ? 'yes' : 'no'}\n`
        )
        if (result.status !== 'stable') stopProfile = true
      }
    }

    report.capacity = computeCapacity(report.results)
    report.finishedAt = new Date().toISOString()
    report.interrupted = interrupted
    fs.mkdirSync(path.dirname(options.report), { recursive: true })
    fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(`\nReport written to ${options.report}\n`)
    process.stdout.write(`${JSON.stringify({ capacity: report.capacity }, null, 2)}\n`)
    if (report.results.some((result) => result.status !== 'stable')) process.exitCode = 1
  } finally {
    process.removeListener('SIGINT', onSigint)
    try {
      runCompose([
        'exec',
        '-T',
        'dev',
        'node',
        '-e',
        `require('node:fs').rmSync(${JSON.stringify(containerRoot)}, { recursive: true, force: true })`
      ])
    } catch {
      process.stderr.write(`Could not remove temporary benchmark data ${containerRoot}\n`)
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
