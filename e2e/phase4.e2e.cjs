// Runner E2E de la Fase 4 (bloques y UX Notion) con Playwright + Chromium.
// Cubre: atajos markdown, slash menu, checkbox de tareas, handle + menú,
// drag & drop con indentación, multi-selección y persistencia.
//
// Uso (desde el host, con el dev server del renderer en 5174):
//   docker compose run -d --rm dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/phase4.e2e.cjs
const { chromium } = require('/home/togu/.npm/_npx/86170c4cd1c5da32/node_modules/playwright')
const path = require('node:path')
const fs = require('node:fs')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = '/tmp/opencode'
const AUTOSAVE_MS = 750
fs.mkdirSync(OUT, { recursive: true })

const consoleErrors = []
const report = { stages: [], consoleErrors }

const check = (steps, name, ok, detail) => steps.push({ name, ok: !!ok, detail })

const dom = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].map((row) => {
      const editable = row.querySelector('div[contenteditable]')
      const lineDivs = editable ? [...editable.querySelectorAll(':scope > div')] : []
      return {
        id: row.getAttribute('data-row-id'),
        type: row.getAttribute('data-block-type'),
        text: editable
          ? lineDivs.length > 0
            ? lineDivs.map((line) => line.textContent).join('\n')
            : editable.textContent
          : '',
        marginLeft: row.style.marginLeft,
        checked: row.getAttribute('data-checked'),
        selected: row.getAttribute('data-selected') === 'true'
      }
    })
  )

const texts = (page) => dom(page).then((rows) => rows.map((row) => row.text))
const types = (page) => dom(page).then((rows) => rows.map((row) => row.type))
const state = (page) => page.evaluate(() => window.__mockState())
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const settle = (page, ms = 180) => page.waitForTimeout(ms)
const advanceAutosave = (page) => page.waitForTimeout(AUTOSAVE_MS)

async function setup(page) {
  await page.goto(URL)
  await page.waitForSelector('div[contenteditable]')
  await page.evaluate(() => window.__mockReset())
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 250)
}

async function seed(page, blocks) {
  await page.evaluate((seedBlocks) => {
    localStorage.setItem(
      '__synapse_e2e_mock__',
      JSON.stringify({
        pages: [
          {
            id: 'p1',
            title: 'Test',
            parentId: null,
            icon: null,
            position: 0,
            createdAt: 1,
            updatedAt: 1
          }
        ],
        blocks: seedBlocks
      })
    )
  }, blocks)
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 250)
}

function makeBlock(index, type, text, extra = {}) {
  return {
    id: `seed-${index}`,
    pageId: 'p1',
    type,
    content: JSON.stringify({ text }),
    position: index,
    indent: 0,
    createdAt: 1,
    updatedAt: 1,
    ...extra
  }
}

async function openSlash(page) {
  await page.keyboard.type('/')
  await page.waitForSelector('[data-slash-menu]')
}

async function openHandleMenu(page, index) {
  const row = page.locator('[data-row-id]').nth(index)
  await row.hover()
  await row.locator('[data-block-handle]').click()
  await page.waitForSelector('[data-block-menu]')
}

async function dragBlock(page, fromIndex, toY, dx = 0) {
  const handle = page.locator('[data-row-id]').nth(fromIndex).locator('[data-block-handle]')
  const box = await handle.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, toY, { steps: 12 })
  await settle(page, 100)
  await page.mouse.up()
  await settle(page, 220)
}

async function stage1Markdown(page) {
  const steps = []
  await setup(page)
  await page.locator('div[contenteditable]').first().click()

  await page.keyboard.type('# ')
  let rows = await dom(page)
  check(steps, '"# " convierte en heading vacío', rows.length === 1 && rows[0].type === 'heading' && rows[0].text === '', rows)

  await page.keyboard.type('Mi título')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- item uno')
  await page.keyboard.press('Enter')
  await page.keyboard.type('item dos')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    '"# título" + lista con viñetas continuada',
    rows.length === 3 &&
      rows[0].type === 'heading' &&
      rows[0].text === 'Mi título' &&
      rows[1].type === 'bullet' &&
      rows[2].type === 'bullet' &&
      rows[2].text === 'item dos',
    rows
  )
  await shot(page, 'e2e-p4-01-markdown.png')

  await page.keyboard.press('Enter')
  await page.keyboard.press('Backspace')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Backspace en viñeta vacía la convierte en párrafo', rows[3].type === 'paragraph', rows[3])

  await page.keyboard.type('[] tarea')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    '"[] " convierte en tarea sin marcar',
    rows[3].type === 'todo' && rows[3].text === 'tarea' && rows[3].checked === 'false',
    rows[3]
  )

  await page.keyboard.press('Enter')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Enter en tarea crea otra tarea vacía', rows[4].type === 'todo' && rows[4].text === '', rows[4])

  await page.keyboard.press('Backspace')
  await page.keyboard.type('> cita')
  await settle(page)
  rows = await dom(page)
  check(steps, '"> " convierte en cita', rows[4].type === 'quote' && rows[4].text === 'cita', rows[4])

  await page.keyboard.press('Enter')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('```')
  await settle(page)
  rows = await dom(page)
  check(steps, '``` convierte en bloque de código', rows[5].type === 'code' && rows[5].text === '', rows[5])

  await page.keyboard.type('const x = 1')
  await settle(page)
  rows = await dom(page)
  check(steps, 'el código escribe texto literal', rows[5].type === 'code' && rows[5].text === 'const x = 1', rows[5])

  await page.keyboard.press('Enter')
  await page.keyboard.type('y')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Enter en code inserta salto y teclea después',
    rows[5].text === 'const x = 1\ny',
    JSON.stringify(rows[5].text)
  )

  await advanceAutosave(page)
  const persisted = await state(page)
  check(
    steps,
    'la BD mock guarda los tipos convertidos',
    JSON.stringify(persisted.blocks.map((block) => block.type)) ===
      JSON.stringify(['heading', 'bullet', 'bullet', 'todo', 'quote', 'code']),
    persisted.blocks.map((block) => block.type)
  )
  return { steps, calls: persisted.calls }
}

async function stage2Slash(page) {
  const steps = []
  await setup(page)
  await page.locator('div[contenteditable]').first().click()

  await openSlash(page)
  let items = await page.evaluate(() =>
    [...document.querySelectorAll('[data-slash-item]')].map((el) => el.getAttribute('data-slash-item'))
  )
  check(steps, 'el slash menu lista los 7 tipos', items.length === 7, items)
  await shot(page, 'e2e-p4-02-slash.png')

  await page.keyboard.type('quote')
  items = await page.evaluate(() =>
    [...document.querySelectorAll('[data-slash-item]')].map((el) => el.getAttribute('data-slash-item'))
  )
  check(steps, 'el filtro "quote" deja solo quote', items.length === 1 && items[0] === 'quote', items)

  await page.keyboard.press('Enter')
  await settle(page)
  let rows = await dom(page)
  check(steps, 'Enter convierte el bloque vacío en quote', rows.length === 1 && rows[0].type === 'quote', rows)

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Escape')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Escape cierra el slash menu sin escribir', rows[0].text === '', rows[0])

  await openSlash(page)
  await page.keyboard.type('divider')
  await page.keyboard.press('Enter')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    '"divider" convierte en divider y añade párrafo',
    rows.length === 2 && rows[0].type === 'divider' && rows[1].type === 'paragraph',
    rows
  )
  const focused = await page.evaluate(() => document.activeElement?.getAttribute?.('data-block-id'))
  check(steps, 'el foco queda en el párrafo nuevo', focused === rows[1].id, { focused, expected: rows[1].id })

  await page.keyboard.type('después del divisor')
  await settle(page)
  rows = await dom(page)
  check(steps, 'se escribe tras el divisor', rows[1].text === 'después del divisor', rows[1])
  return { steps }
}

async function stage3Checkbox(page) {
  const steps = []
  await seed(page, [
    makeBlock(0, 'todo', 'comprar pan'),
    makeBlock(1, 'paragraph', 'nota')
  ])

  const checkbox = page.locator('[data-row-id]').first().locator('[data-todo-checkbox]')
  check(steps, 'la tarea renderiza checkbox', (await checkbox.count()) === 1)

  await checkbox.click()
  await settle(page)
  let rows = await dom(page)
  check(steps, 'click marca la tarea', rows[0].checked === 'true', rows[0])
  const struck = await page.evaluate(
    () => !!document.querySelector('[data-row-id] [data-block-id].line-through')
  )
  check(steps, 'el texto marcado queda tachado', struck)

  await checkbox.click()
  await settle(page)
  rows = await dom(page)
  check(steps, 'segundo click desmarca', rows[0].checked === 'false', rows[0])

  await checkbox.click()
  await advanceAutosave(page)
  const persisted = await state(page)
  check(
    steps,
    'el autosave guarda checked:true en el content',
    persisted.blocks.some((block) => block.content === '{"text":"comprar pan","checked":true}'),
    persisted.blocks.map((block) => block.content)
  )
  await shot(page, 'e2e-p4-03-checkbox.png')
  return { steps, calls: persisted.calls }
}

async function stage4HandleMenu(page) {
  const steps = []
  await seed(page, [
    makeBlock(0, 'paragraph', 'uno'),
    makeBlock(1, 'paragraph', 'dos'),
    makeBlock(2, 'paragraph', 'tres')
  ])

  await openHandleMenu(page, 0)
  const actions = await page.evaluate(() =>
    [...document.querySelectorAll('[data-menu-action]')].map((el) => el.getAttribute('data-menu-action'))
  )
  check(
    steps,
    'el menú del handle ofrece convertir/duplicar/mover/eliminar',
    ['convert', 'duplicate', 'move-up', 'move-down', 'delete'].every((action) =>
      actions.includes(action)
    ),
    actions
  )
  await shot(page, 'e2e-p4-04-handle-menu.png')

  await page.keyboard.press('Escape')
  await settle(page)
  check(steps, 'Escape cierra el menú', (await page.locator('[data-block-menu]').count()) === 0)

  await openHandleMenu(page, 0)
  await page.click('[data-menu-action="convert"]')
  await page.click('[data-menu-action="convert-heading"]')
  await settle(page)
  let rows = await dom(page)
  check(steps, 'Convertir en heading', rows[0].type === 'heading' && rows[0].text === 'uno', rows)

  await openHandleMenu(page, 0)
  await page.click('[data-menu-action="duplicate"]')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Duplicar inserta una copia debajo',
    rows.length === 4 && rows[1].type === 'heading' && rows[1].text === 'uno' && rows[2].text === 'dos',
    rows.map((row) => row.text)
  )

  await openHandleMenu(page, 1)
  const beforeMove = (await dom(page)).map((row) => row.id)
  await page.click('[data-menu-action="move-up"]')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Mover arriba intercambia el orden',
    rows[0].id === beforeMove[1] && rows[1].id === beforeMove[0],
    { before: beforeMove, after: rows.map((row) => row.id) }
  )

  await openHandleMenu(page, 0)
  await page.click('[data-menu-action="move-down"]')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Mover abajo lo devuelve a su sitio', rows[0].text === 'uno' && rows[1].text === 'uno', rows.map((row) => row.text))

  await openHandleMenu(page, 0)
  await page.click('[data-menu-action="delete"]')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Eliminar borra el bloque', rows.length === 3 && rows[0].text === 'uno', rows.map((row) => row.text))

  await advanceAutosave(page)
  const persisted = await state(page)
  const ordered = [...persisted.blocks].sort((a, b) => a.position - b.position)
  check(
    steps,
    'el orden final se persiste',
    JSON.stringify(ordered.map((block) => block.content)) ===
      JSON.stringify(['{"text":"uno"}', '{"text":"dos"}', '{"text":"tres"}']),
    ordered.map((block) => ({ p: block.position, c: block.content }))
  )
  return { steps, calls: persisted.calls }
}

async function stage5DragDrop(page) {
  const steps = []
  await seed(page, [
    makeBlock(0, 'paragraph', 'uno'),
    makeBlock(1, 'paragraph', 'dos'),
    makeBlock(2, 'paragraph', 'tres')
  ])

  let boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].map((row) => {
      const rect = row.getBoundingClientRect()
      return { top: rect.top, height: rect.height }
    })
  )
  await dragBlock(page, 2, boxes[0].top + 2)
  let rows = await dom(page)
  check(
    steps,
    'arrastrar el último arriba reordena',
    JSON.stringify(rows.map((row) => row.text)) === JSON.stringify(['tres', 'uno', 'dos']),
    rows.map((row) => row.text)
  )

  boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].map((row) => {
      const rect = row.getBoundingClientRect()
      return { top: rect.top, height: rect.height }
    })
  )
  await dragBlock(page, 2, boxes[2].top + boxes[2].height - 2, 30)
  rows = await dom(page)
  check(
    steps,
    'soltar a la derecha indenta un nivel',
    rows[2].text === 'dos' && rows[2].marginLeft === '24px',
    rows.map((row) => `${row.text}@${row.marginLeft}`)
  )
  await shot(page, 'e2e-p4-05-drag.png')

  boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].map((row) => {
      const rect = row.getBoundingClientRect()
      return { top: rect.top, height: rect.height }
    })
  )
  const handle = page.locator('[data-row-id]').first().locator('[data-block-handle]')
  const handleBox = await handle.boundingBox()
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2, boxes[2].top + boxes[2].height - 2, {
    steps: 10
  })
  await settle(page, 80)
  await page.keyboard.press('Escape')
  await settle(page, 80)
  await page.mouse.up()
  await settle(page, 200)
  rows = await dom(page)
  check(
    steps,
    'Escape cancela el arrastre en curso',
    JSON.stringify(rows.map((row) => row.text)) === JSON.stringify(['tres', 'uno', 'dos']),
    rows.map((row) => row.text)
  )

  await advanceAutosave(page)
  const persisted = await state(page)
  const ordered = [...persisted.blocks].sort((a, b) => a.position - b.position)
  check(
    steps,
    'reorden e indent se persisten',
    ordered[2].content === '{"text":"dos"}' &&
      ordered[2].indent === 1 &&
      ordered[0].content === '{"text":"tres"}',
    ordered.map((block) => ({ p: block.position, i: block.indent, c: block.content }))
  )
  return { steps, calls: persisted.calls }
}

async function stage6MultiSelect(page) {
  const steps = []
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c'),
    makeBlock(3, 'paragraph', 'd')
  ])

  await page.locator('[data-row-id]').nth(0).locator('div[contenteditable]').click()
  await page.locator('[data-row-id]').nth(2).click({ modifiers: ['Shift'] })
  await settle(page)
  let rows = await dom(page)
  check(
    steps,
    'Shift+click selecciona el rango a-c',
    rows.map((row) => row.selected).join(',') === 'true,true,true,false',
    rows.map((row) => row.selected)
  )
  await shot(page, 'e2e-p4-06-multiselect.png')

  await page.keyboard.press('Backspace')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Backspace borra la selección',
    rows.length === 1 && rows[0].text === 'd',
    rows.map((row) => row.text)
  )

  await page.keyboard.press('Control+z')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Ctrl+Z restaura los bloques borrados',
    rows.length === 4 && (await texts(page)).join('') === 'abcd',
    await texts(page)
  )

  await page.locator('[data-row-id]').first().locator('div[contenteditable]').click()
  await page.keyboard.press('Control+d')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Ctrl+D duplica el bloque activo', rows.length === 5 && rows[1].text === 'a', await texts(page))

  await page.locator('[data-row-id]').nth(0).locator('div[contenteditable]').click()
  await page.locator('[data-row-id]').nth(3).click({ modifiers: ['Shift'] })
  await settle(page)
  await page.keyboard.press('Control+d')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Ctrl+D duplica la multi-selección completa',
    rows.length === 9 && rows.filter((row) => row.selected).length === 4,
    rows.map((row) => `${row.text}${row.selected ? '*' : ''}`)
  )

  await page.keyboard.press('Escape')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Escape limpia la selección', rows.every((row) => !row.selected))

  await advanceAutosave(page)
  const persisted = await state(page)
  check(steps, 'la BD mock recibe 9 bloques', persisted.blocks.length === 9, persisted.blocks.length)
  return { steps, calls: persisted.calls }
}

async function stage7Persistence(page) {
  const steps = []
  await setup(page)
  await page.locator('div[contenteditable]').first().click()

  await page.keyboard.type('# ')
  await page.keyboard.type('Persistencia')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- uno')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('[] pendiente')
  await settle(page)
  const before = await dom(page)
  await advanceAutosave(page)

  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 300)
  const after = await dom(page)
  check(
    steps,
    'tipos y textos sobreviven al reload',
    JSON.stringify(after.map((row) => [row.type, row.text])) ===
      JSON.stringify(before.map((row) => [row.type, row.text])),
    { before: before.map((row) => [row.type, row.text]), after: after.map((row) => [row.type, row.text]) }
  )

  await page.locator('[data-row-id]').last().locator('[data-todo-checkbox]').click()
  await settle(page)
  await advanceAutosave(page)
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 300)
  const rows = await dom(page)
  check(
    steps,
    'checked sobrevive al reload',
    rows[rows.length - 1].type === 'todo' && rows[rows.length - 1].checked === 'true',
    rows[rows.length - 1]
  )
  const persisted = await state(page)
  check(steps, 'el mock guarda checked tras el reload', persisted.blocks.some((b) => b.content.includes('"checked":true')))
  await shot(page, 'e2e-p4-07-reload.png')
  return { steps, calls: persisted.calls }
}

async function stage8Regressions(page) {
  const steps = []
  const focused = () =>
    page.evaluate(() => document.activeElement?.getAttribute?.('data-block-id') ?? null)

  await seed(page, [makeBlock(0, 'paragraph', 'abc')])
  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('x')
  await settle(page)
  let rows = await dom(page)
  check(steps, 'Shift+Enter + tecleo queda tras el salto', rows[0].text === 'abc\nx', JSON.stringify(rows[0].text))

  await seed(page, [makeBlock(0, 'divider', ''), makeBlock(1, 'paragraph', 'texto')])
  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Backspace tras divider elimina el divider',
    rows.length === 1 && rows[0].type === 'paragraph' && rows[0].text === 'texto',
    rows
  )
  check(steps, 'el foco queda en el párrafo', (await focused()) === rows[0].id, await focused())

  await seed(page, [makeBlock(0, 'paragraph', 'abc'), makeBlock(1, 'divider', '')])
  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Delete')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'Delete antes de divider elimina el divider',
    rows.length === 1 && rows[0].type === 'paragraph' && (await focused()) === rows[0].id,
    { rows, focus: await focused() }
  )

  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'divider', ''),
    makeBlock(2, 'paragraph', 'b')
  ])
  await page.locator('div[contenteditable]').nth(1).click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowUp')
  await settle(page)
  check(steps, 'ArrowUp salta el divider', (await focused()) === 'seed-0', await focused())
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await settle(page)
  check(steps, 'ArrowDown salta el divider', (await focused()) === 'seed-2', await focused())

  await seed(page, [makeBlock(0, 'todo', 'tarea'), makeBlock(1, 'paragraph', 'nota')])
  await page.locator('[data-todo-checkbox]').click()
  await settle(page)
  check(steps, 'checkbox marcado sin foco en el editor', (await dom(page))[0].checked === 'true')
  await page.keyboard.press('Control+z')
  await settle(page)
  rows = await dom(page)
  check(steps, 'Ctrl+Z con foco en body deshace el check', rows[0].checked === 'false', rows[0])

  await seed(page, [makeBlock(0, 'paragraph', 'uno'), makeBlock(1, 'paragraph', 'dos')])
  await openHandleMenu(page, 0)
  await page.click('[data-menu-action="convert"]')
  await page.click('[data-menu-action="convert-divider"]')
  await advanceAutosave(page)
  const persisted = await state(page)
  const converted = persisted.blocks.find((block) => block.id === 'seed-0')
  check(
    steps,
    'convertir a divider limpia el texto oculto',
    converted.type === 'divider' && converted.content === '{"text":""}',
    converted
  )
  await shot(page, 'e2e-p4-08-regresiones.png')
  return { steps, calls: persisted.calls }
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
    ['stage1 · atajos markdown', stage1Markdown],
    ['stage2 · slash menu', stage2Slash],
    ['stage3 · checkbox de tareas', stage3Checkbox],
    ['stage4 · handle + menú', stage4HandleMenu],
    ['stage5 · drag & drop', stage5DragDrop],
    ['stage6 · multi-selección', stage6MultiSelect],
    ['stage7 · persistencia y reload', stage7Persistence],
    ['stage8 · regresiones de caret/divider/foco', stage8Regressions]
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
    (stage.steps ?? [])
      .filter((step) => !step.ok)
      .map((step) => `${stage.name}: ${step.name}`)
  )
  report.summary = {
    totalChecks: report.stages.flatMap((stage) => stage.steps ?? []).length,
    failedChecks: failures,
    fatalStages: report.stages.filter((stage) => stage.fatal).map((stage) => stage.name),
    consoleErrors
  }
  fs.writeFileSync(path.join(OUT, 'e2e-phase4-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
