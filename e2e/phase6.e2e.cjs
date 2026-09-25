// Runner E2E de la Fase 6 (búsqueda global Ctrl+K) con Playwright + Chromium.
// Cubre: atajo Ctrl+K, disparador del sidebar, cierre con Esc/overlay, resultados
// agrupados con snippet resaltado, navegación con ↑↓/Enter, salto a página y a
// bloque con foco, y estado sin resultados.
//
// Uso (desde el host, con el dev server del renderer en 5174):
//   docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/phase6.e2e.cjs
const { chromium } = require('./playwright.cjs')
const path = require('node:path')
const fs = require('node:fs')

const URL = `http://localhost:${process.env.SYNAPSE_E2E_PORT || 5174}/`
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = path.join(require('node:os').tmpdir(), 'opencode')
fs.mkdirSync(OUT, { recursive: true })

const consoleErrors = []
const report = { stages: [], consoleErrors }

const check = (steps, name, ok, detail) => steps.push({ name, ok: !!ok, detail })

const P = (id, title, parentId, position, createdAt) => ({
  id,
  title,
  parentId: parentId ?? null,
  icon: null,
  position,
  createdAt,
  updatedAt: createdAt
})

const B = (id, pageId, type, text, position, createdAt) => ({
  id,
  pageId,
  type,
  content: JSON.stringify({ text }),
  position,
  indent: 0,
  createdAt,
  updatedAt: createdAt
})

const state = (page) => page.evaluate(() => window.__mockState())
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const settle = (page, ms = 200) => page.waitForTimeout(ms)
const paletteCount = (page) => page.locator('[data-search-palette]').count()

const paletteBox = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('[data-search-palette] > [role="dialog"]')
    if (!dialog) return null
    const rect = dialog.getBoundingClientRect()
    return { height: Math.round(rect.height), top: Math.round(rect.top) }
  })

const resultsDom = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-search-result]')].map((el) => ({
      kind: el.getAttribute('data-kind'),
      pageId: el.getAttribute('data-page-id'),
      blockId: el.getAttribute('data-block-id'),
      active: el.getAttribute('data-active') === 'true',
      text: el.textContent ?? '',
      mark: el.querySelector('mark')?.textContent ?? null,
      pageIdAttr: el.getAttribute('data-page-id')
    }))
  )

async function seed(page, data) {
  await page.evaluate((payload) => {
    localStorage.setItem('__synapse_e2e_mock__', JSON.stringify(payload))
  }, data)
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 250)
}

async function setup(page) {
  await page.goto(URL)
  await page.waitForSelector('div[contenteditable]')
  await page.evaluate(() => window.__mockReset())
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 200)
}

async function seedSearch(page) {
  await seed(page, {
    pages: [
      P('p-notes', 'Notas', null, 0, 1),
      P('p-recipes', 'Recetas', null, 1, 2),
      P('p-alpha', 'Alfa', null, 2, 3),
      P('p-alba', 'Alba', null, 3, 4)
    ],
    blocks: [
      B('b-song', 'p-recipes', 'paragraph', 'Canción de cuna con ñandú', 0, 1),
      B('b-pan', 'p-notes', 'paragraph', 'Comprar pan y café', 1, 2),
      B('b-alpha', 'p-alpha', 'heading', 'Algoritmo de búsqueda', 0, 3)
    ]
  })
}

async function openPalette(page) {
  await page.keyboard.press('Control+k')
  await page.waitForSelector('[data-search-palette]')
}

async function waitResults(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[data-search-result]').length === expected,
    count
  )
}

async function stage1Shortcut(page) {
  const steps = []
  await setup(page)
  await seedSearch(page)

  await openPalette(page)
  check(steps, 'Ctrl+K abre la paleta de búsqueda', (await paletteCount(page)) === 1)
  check(
    steps,
    'el input de búsqueda recibe el foco',
    await page.evaluate(
      () => document.activeElement === document.querySelector('[data-search-input]')
    )
  )
  await shot(page, 'e2e-p6-01-palette.png')

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })
  check(steps, 'Esc cierra la paleta', (await paletteCount(page)) === 0)

  await page.click('[data-search-trigger]')
  await page.waitForSelector('[data-search-palette]')
  check(steps, 'el botón Buscar del sidebar abre la paleta', (await paletteCount(page)) === 1)

  await page.mouse.click(20, 20)
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })
  check(steps, 'clic fuera de la paleta la cierra', (await paletteCount(page)) === 0)

  await openPalette(page)
  check(
    steps,
    'reabrir la paleta parte de una búsqueda vacía',
    (await page.locator('[data-search-input]').inputValue()) === ''
  )
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })

  return { steps }
}

async function stage2Grouped(page) {
  const steps = []
  await openPalette(page)
  await page.fill('[data-search-input]', 'canción')
  await waitResults(page, 1)

  const results = await resultsDom(page)
  check(
    steps,
    'busca en el contenido de los bloques y devuelve un único resultado',
    results.length === 1 && results[0].kind === 'block',
    results
  )
  check(
    steps,
    'el resultado de bloque apunta a su página y bloque',
    results[0]?.pageId === 'p-recipes' && results[0]?.blockId === 'b-song',
    results[0]
  )
  check(
    steps,
    'el snippet resalta la coincidencia conservando mayúsculas',
    results[0]?.mark === 'Canción',
    results[0]
  )
  check(
    steps,
    'la fila muestra el título de la página contenedora',
    results[0]?.text.includes('Recetas') && results[0]?.text.includes('Block'),
    results[0]?.text
  )
  check(
    steps,
    'solo aparece el grupo Bloques',
    (await page.locator('[data-search-group="pages"]').count()) === 0 &&
      (await page.locator('[data-search-group="blocks"]').count()) === 1
  )

  const mocked = await state(page)
  const lastSearch = [...mocked.calls].reverse().find((call) => call[0] === 'search')
  check(steps, 'la búsqueda se delega en la API', lastSearch?.[1] === 'canción', lastSearch)

  await shot(page, 'e2e-p6-02-results.png')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })
  return { steps }
}

async function stage3Keyboard(page) {
  const steps = []
  await openPalette(page)
  await page.fill('[data-search-input]', 'al')
  await waitResults(page, 3)

  let results = await resultsDom(page)
  check(
    steps,
    'los resultados llegan agrupados: páginas primero, bloques después',
    results.map((result) => result.kind).join(',') === 'page,page,block',
    results.map((result) => `${result.kind}:${result.blockId ?? result.pageId}`)
  )
  check(
    steps,
    'el primer resultado arranca activo',
    results[0]?.active === true && results.slice(1).every((result) => !result.active)
  )
  await shot(page, 'e2e-p6-03-keyboard.png')

  await page.keyboard.press('ArrowDown')
  results = await resultsDom(page)
  check(steps, 'ArrowDown mueve el resultado activo', results[1]?.active === true, results)

  await page.keyboard.press('ArrowUp')
  results = await resultsDom(page)
  check(steps, 'ArrowUp vuelve al resultado anterior', results[0]?.active === true, results)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })
  await page.waitForSelector('[data-page-id="p-alpha"][data-active="true"]')
  check(steps, 'Enter abre la página del resultado activo', true)

  return { steps }
}

async function stage4BlockJump(page) {
  const steps = []
  await openPalette(page)
  await page.fill('[data-search-input]', 'canción')
  await waitResults(page, 1)

  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })
  await page.waitForSelector('[data-page-id="p-recipes"][data-active="true"]')
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('data-block-id') === 'b-song'
  )
  check(steps, 'Enter en un bloque abre su página y enfoca el bloque', true)
  check(
    steps,
    'el caret queda al inicio del bloque encontrado',
    await page.evaluate(() => window.getSelection()?.anchorOffset === 0)
  )
  await shot(page, 'e2e-p6-04-block-focus.png')

  await settle(page, 300)
  const after = await state(page)
  const afterLists = after.calls.filter((call) => call[0] === 'list' && call[1] === 'p-recipes').length
  check(steps, 'la página se carga una sola vez al saltar desde la búsqueda', afterLists === 1, {
    afterLists
  })

  return { steps }
}

async function stage5Empty(page) {
  const steps = []
  await openPalette(page)
  await page.fill('[data-search-input]', 'zzzz')
  await page.waitForSelector('[data-search-empty]')
  check(
    steps,
    'sin coincidencias muestra el estado vacío',
    (await page.locator('[data-search-result]').count()) === 0 &&
      (await page.locator('[data-search-empty]').textContent()).includes('zzzz')
  )

  await page.fill('[data-search-input]', '')
  await settle(page, 250)
  check(
    steps,
    'al limpiar el término desaparecen resultados y estado vacío',
    (await page.locator('[data-search-result]').count()) === 0 &&
      (await page.locator('[data-search-empty]').count()) === 0
  )

  await page.evaluate(() => {
    const original = window.api.search.query
    window.__originalSearchQuery = original
    window.api.search.query = async (term, limit) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return original(term, limit)
    }
  })
  await page.locator('[data-search-input]').click()
  await page.keyboard.type('z')
  const sawSearching = await page
    .waitForSelector('[data-search-searching]', { timeout: 1500 })
    .then(() => true)
    .catch(() => false)
  const firstBox = await paletteBox(page)
  await page.keyboard.type('zz')
  const secondBox = await paletteBox(page)
  await page.waitForSelector('[data-search-empty]')
  const settledBox = await paletteBox(page)
  check(
    steps,
    'mientras busca sin resultados muestra el indicador en lugar del vacío',
    sawSearching && (await page.locator('[data-search-result]').count()) === 0
  )
  check(
    steps,
    'la paleta mantiene su altura y posición durante la búsqueda',
    [firstBox, secondBox].every(
      (box) => box && settledBox && box.height === settledBox.height && box.top === settledBox.top
    ),
    { firstBox, secondBox, settledBox }
  )
  await page.evaluate(() => {
    window.api.search.query = window.__originalSearchQuery
  })

  await page.fill('[data-search-input]', 'café')
  await waitResults(page, 1)
  const results = await resultsDom(page)
  check(
    steps,
    'los acentos del contenido se encuentran tal cual',
    results[0]?.blockId === 'b-pan' && results[0]?.mark === 'café',
    results[0]
  )

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })
  check(steps, 'Esc sigue cerrando tras varias búsquedas', (await paletteCount(page)) === 0)
  return { steps }
}

async function stage6Persistence(page) {
  const steps = []
  await openPalette(page)
  await page.fill('[data-search-input]', 'notas')
  await waitResults(page, 1)
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-page-id="p-notes"][data-active="true"]')
  check(steps, 'se puede navegar a una página desde la búsqueda', true)

  await openPalette(page)
  await page.fill('[data-search-input]', 'ñandú')
  await waitResults(page, 1)
  const results = await resultsDom(page)
  check(
    steps,
    'la búsqueda con eñes devuelve el bloque correcto',
    results[0]?.blockId === 'b-song' && results[0]?.mark === 'ñandú',
    results[0]
  )
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })

  const dom = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-row-id]').length,
    palette: document.querySelectorAll('[data-search-palette]').length
  }))
  check(
    steps,
    'el editor queda intacto tras buscar y cerrar',
    dom.rows === 1 && dom.palette === 0,
    dom
  )
  return { steps }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push('[console] ' + msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message))
  await page.addInitScript({ path: MOCK })

  const stages = [
    ['stage1 · atajo y cierre', stage1Shortcut],
    ['stage2 · resultados agrupados', stage2Grouped],
    ['stage3 · navegación con teclado', stage3Keyboard],
    ['stage4 · salto a bloque', stage4BlockJump],
    ['stage5 · vacío y acentos', stage5Empty],
    ['stage6 · navegación y persistencia', stage6Persistence]
  ]
  for (const [name, fn] of stages) {
    try {
      const result = await fn(page)
      report.stages.push({ name, steps: result.steps, calls: result.calls })
    } catch (error) {
      report.stages.push({ name, fatal: String(error && error.stack ? error.stack : error) })
    }
  }

  await browser.close()
  const failures = report.stages.flatMap((stage) =>
    (stage.steps ?? []).filter((step) => !step.ok).map((step) => `${stage.name}: ${step.name}`)
  )
  report.summary = {
    totalChecks: report.stages.flatMap((stage) => stage.steps ?? []).length,
    failedChecks: failures,
    fatalStages: report.stages.filter((stage) => stage.fatal).map((stage) => stage.name),
    consoleErrors
  }
  fs.writeFileSync(path.join(OUT, 'e2e-phase6-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
