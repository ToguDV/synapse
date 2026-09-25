// Runner E2E del drag & drop de páginas en el sidebar (Playwright + Chromium).
// Cubre: reordenar hermanas, mover a otra rama, soltar dentro (append), guarda de
// ciclos, umbral clic-vs-arrastre, auto-expand al pasar por encima, Escape y
// persistencia tras reload.
//
// Uso (desde el host, con el dev server del renderer en 5174):
//   docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/page-dnd.e2e.cjs
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
const note = (steps, name, detail) => steps.push({ name, ok: true, note: detail })
const settle = (page, ms = 200) => page.waitForTimeout(ms)
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })

const P = (id, title, parentId, position, createdAt) => ({
  id,
  title,
  parentId: parentId ?? null,
  icon: null,
  position,
  createdAt,
  updatedAt: createdAt
})

async function seed(page, pages) {
  await page.evaluate(
    (payload) => {
      localStorage.setItem('__synapse_e2e_mock__', JSON.stringify({ pages: payload, blocks: [] }))
    },
    pages
  )
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await page.waitForSelector('[data-page-id]')
  await settle(page, 250)
}

const DEFAULT_PAGES = () => [
  P('a', 'A', null, 0, 1),
  P('b', 'B', null, 1, 2),
  P('b1', 'B1', 'b', 0, 3),
  P('b2', 'B2', 'b', 1, 4),
  P('c', 'C', null, 2, 5)
]

const pagesDom = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-page-id]')].map((row) => ({
      id: row.getAttribute('data-page-id'),
      depth: Number(row.getAttribute('data-page-depth')),
      active: row.getAttribute('data-active') === 'true',
      expanded: row.querySelector('[data-page-toggle]')?.getAttribute('data-expanded') ?? null
    }))
  )

const dropState = (page) =>
  page.evaluate(() => ({
    drop: [...document.querySelectorAll('[data-page-drop]')].map((element) => ({
      id: element.getAttribute('data-page-id'),
      zone: element.getAttribute('data-page-drop')
    })),
    dragging: [...document.querySelectorAll('[data-page-dragging]')].map((element) =>
      element.getAttribute('data-page-id')
    )
  }))

const state = (page) => page.evaluate(() => window.__mockState())

const pageById = (persisted, id) => persisted.pages.find((candidate) => candidate.id === id)

async function box(page, id) {
  return page.locator(`[data-page-id="${id}"]`).boundingBox()
}

function zoneY(rect, zone) {
  if (zone === 'before') return rect.y + 2
  if (zone === 'after') return rect.y + rect.height - 2
  return rect.y + rect.height / 2
}

async function hoverDrop(page, fromId, toId, zone) {
  const from = await box(page, fromId)
  const to = await box(page, toId)
  if (!from || !to) return null
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, zoneY(to, zone), { steps: 12 })
  await settle(page, 150)
  return dropState(page)
}

const release = async (page) => {
  await page.mouse.up()
  await settle(page, 300)
}

// ------------------------------------------------- 1. reordenar entre hermanas
async function stageReorder(page) {
  const steps = []

  // 1 · A (raíz) pasa a ser la primera hija de B, antes de B1
  await seed(page, DEFAULT_PAGES())
  const during = await hoverDrop(page, 'a', 'b1', 'before')
  check(
    steps,
    '1a el indicador before aparece en B1 y A se marca como arrastrada',
    during?.drop.length === 1 &&
      during.drop[0].id === 'b1' &&
      during.drop[0].zone === 'before' &&
      during.dragging.join(',') === 'a',
    during
  )
  await shot(page, 'pagednd-01-before.png')
  await release(page)
  let rows = await pagesDom(page)
  check(
    steps,
    '1b A queda entre B y B1 (orden y profundidad)',
    rows.map((row) => row.id).join(',') === 'b,a,b1,b2,c' &&
      rows.map((row) => row.depth).join(',') === '0,1,1,1,0',
    rows
  )
  let persisted = await state(page)
  check(
    steps,
    '1c el mock persiste parentId b y posiciones renumeradas',
    pageById(persisted, 'a')?.parentId === 'b' &&
      pageById(persisted, 'a')?.position === 0 &&
      pageById(persisted, 'b1')?.position === 1 &&
      pageById(persisted, 'b2')?.position === 2,
    persisted.pages
  )
  check(
    steps,
    '1d el IPC de move recibe el índice de inserción',
    persisted.calls.some(
      (call) => call[0] === 'page-move' && call[1] === 'a' && call[2] === 'b' && call[3] === 0
    ),
    persisted.calls.filter((call) => call[0] === 'page-move')
  )

  // 2 · A (hija de B) pasa al final del nivel raíz, después de C
  await seed(page, DEFAULT_PAGES())
  await page.click('[data-page-id="c"] [data-page-title]')
  await settle(page, 150)
  const after = await hoverDrop(page, 'a', 'c', 'after')
  check(
    steps,
    '2a el indicador after aparece en C',
    after?.drop.length === 1 && after.drop[0].id === 'c' && after.drop[0].zone === 'after',
    after
  )
  await release(page)
  rows = await pagesDom(page)
  check(
    steps,
    '2b A queda tras C y B conserva a sus hijas renumeradas',
    rows.map((row) => row.id).join(',') === 'b,b1,b2,c,a',
    rows
  )
  persisted = await state(page)
  check(
    steps,
    '2c A es raíz con position 2 y B1/B2 se renumeran a 0 y 1',
    pageById(persisted, 'a')?.parentId === null &&
      pageById(persisted, 'a')?.position === 2 &&
      pageById(persisted, 'b1')?.position === 0 &&
      pageById(persisted, 'b2')?.position === 1,
    persisted.pages
  )
  rows = await pagesDom(page)
  check(steps, '2d arrastrar no cambia la página activa (C)', rows.find((row) => row.id === 'c')?.active === true, rows)

  // 3 · A cae dentro de B (append)
  await seed(page, DEFAULT_PAGES())
  const inside = await hoverDrop(page, 'a', 'b', 'inside')
  check(
    steps,
    '3a el indicador inside aparece en B',
    inside?.drop.length === 1 && inside.drop[0].id === 'b' && inside.drop[0].zone === 'inside',
    inside
  )
  await release(page)
  rows = await pagesDom(page)
  check(
    steps,
    '3b A se añade como última hija de B',
    rows.map((row) => row.id).join(',') === 'b,b1,b2,a,c' &&
      rows.map((row) => row.depth).join(',') === '0,1,1,1,0',
    rows
  )
  persisted = await state(page)
  check(
    steps,
    '3c A persiste como tercera hija (position 2)',
    pageById(persisted, 'a')?.parentId === 'b' && pageById(persisted, 'a')?.position === 2,
    persisted.pages
  )

  return { steps }
}

// ------------------------------------------------------- 2. guardas y no-ops
async function stageGuards(page) {
  const steps = []

  // 4 · no se puede soltar dentro del propio subárbol
  await seed(page, DEFAULT_PAGES())
  const cycle = await hoverDrop(page, 'b', 'b1', 'inside')
  check(
    steps,
    '4a arrastrar B sobre su descendiente B1 no produce destino',
    cycle?.drop.length === 0 && cycle.dragging.join(',') === 'b',
    cycle
  )
  await release(page)
  let persisted = await state(page)
  check(
    steps,
    '4b el estado no cambia tras soltar en el subárbol',
    pageById(persisted, 'b')?.parentId === null &&
      pageById(persisted, 'b')?.position === 1 &&
      pageById(persisted, 'b1')?.parentId === 'b' &&
      pageById(persisted, 'b1')?.position === 0 &&
      !persisted.calls.some((call) => call[0] === 'page-move'),
    persisted
  )

  // 5 · un clic normal selecciona sin mover
  await seed(page, DEFAULT_PAGES())
  let before = await state(page)
  await page.click('[data-page-id="c"] [data-page-title]')
  await settle(page, 200)
  persisted = await state(page)
  const rows = await pagesDom(page)
  check(
    steps,
    '5a clic simple selecciona C sin llamar a move',
    rows.find((row) => row.id === 'c')?.active === true &&
      !persisted.calls.some((call) => call[0] === 'page-move') &&
      pageById(persisted, 'c')?.parentId === null,
    { rows, calls: persisted.calls }
  )
  check(
    steps,
    '5b el mock no cambió ninguna posición con el clic',
    persisted.pages.every(
      (page) => page.position === pageById(before, page.id).position
    ),
    persisted.pages
  )

  // 6 · Escape cancela el arrastre en curso
  await seed(page, DEFAULT_PAGES())
  const cancelling = await hoverDrop(page, 'a', 'b1', 'before')
  await page.keyboard.press('Escape')
  await settle(page, 120)
  const afterEscape = await dropState(page)
  await page.mouse.up()
  await settle(page, 250)
  persisted = await state(page)
  check(
    steps,
    '6a Escape limpia el indicador antes de soltar',
    cancelling?.drop.length === 1 && afterEscape.drop.length === 0 && afterEscape.dragging.length === 0,
    { cancelling, afterEscape }
  )
  check(
    steps,
    '6b tras Escape el soltado no mueve nada',
    pageById(persisted, 'a')?.parentId === null &&
      pageById(persisted, 'a')?.position === 0 &&
      !persisted.calls.some((call) => call[0] === 'page-move'),
    persisted.pages
  )

  return { steps }
}

// ------------------------------------------- 3. auto-expand y persistencia
async function stageExpandAndPersist(page) {
  const steps = []

  // 7 · auto-expand de un padre colapsado al pasar por encima
  await seed(page, DEFAULT_PAGES())
  await page.click('[data-page-id="b"] [data-page-toggle]')
  await settle(page, 150)
  let rows = await pagesDom(page)
  check(
    steps,
    '7a B queda colapsada y sus hijas ocultas',
    rows.map((row) => row.id).join(',') === 'a,b,c' &&
      rows.find((row) => row.id === 'b')?.expanded === 'false',
    rows
  )
  const from = await box(page, 'c')
  const to = await box(page, 'b')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, zoneY(to, 'inside'), { steps: 10 })
  await settle(page, 700)
  rows = await pagesDom(page)
  const hovering = await dropState(page)
  check(
    steps,
    '7b tras 500 ms sobre B se auto-expande con el indicador inside',
    rows.find((row) => row.id === 'b')?.expanded === 'true' &&
      rows.some((row) => row.id === 'b1') &&
      hovering.drop.length === 1 &&
      hovering.drop[0].zone === 'inside',
    { rows, hovering }
  )
  await release(page)
  rows = await pagesDom(page)
  let persisted = await state(page)
  check(
    steps,
    '7c C se añade como última hija de B',
    rows.map((row) => row.id).join(',') === 'a,b,b1,b2,c' &&
      pageById(persisted, 'c')?.parentId === 'b' &&
      pageById(persisted, 'c')?.position === 2,
    { rows, pages: persisted.pages }
  )

  // 8 · la nueva estructura sobrevive al reload
  await seed(page, DEFAULT_PAGES())
  await hoverDrop(page, 'a', 'b', 'inside')
  await release(page)
  await page.reload()
  await page.waitForSelector('[data-page-id]')
  await settle(page, 300)
  rows = await pagesDom(page)
  persisted = await state(page)
  check(
    steps,
    '8a tras reload el árbol mantiene A dentro de B',
    rows.map((row) => row.id).join(',') === 'b,b1,b2,a,c' &&
      pageById(persisted, 'a')?.parentId === 'b' &&
      pageById(persisted, 'a')?.position === 2,
    rows
  )
  await shot(page, 'pagednd-08-reload.png')

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
  await page.goto(URL)
  await page.waitForSelector('div[contenteditable]')
  await page.evaluate(() => window.__mockReset())

  const stages = [
    ['1 · reordenar, mover y anidar', stageReorder],
    ['2 · guardas y no-ops', stageGuards],
    ['3 · auto-expand y persistencia', stageExpandAndPersist]
  ]
  for (const [name, fn] of stages) {
    try {
      const result = await fn(page)
      report.stages.push({ name, steps: result.steps })
    } catch (error) {
      report.stages.push({ name, fatal: String(error && error.stack ? error.stack : error) })
      try {
        await shot(page, `pagednd-fatal-${name.split(' ')[0]}.png`)
      } catch {}
    }
  }

  await browser.close()
  const failures = report.stages.flatMap((stage) =>
    (stage.steps ?? []).filter((step) => !step.ok).map((step) => `${stage.name}: ${step.name}`)
  )
  report.summary = {
    totalChecks: report.stages.flatMap((stage) =>
      (stage.steps ?? []).filter((step) => !step.note)
    ).length,
    failedChecks: failures,
    fatalStages: report.stages.filter((stage) => stage.fatal).map((stage) => stage.name),
    consoleErrors
  }
  fs.writeFileSync(
    path.join(OUT, 'e2e-page-dnd-report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
