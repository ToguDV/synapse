// Runner E2E de la Fase 5 (páginas) con Playwright + Chromium.
// Cubre: árbol anidado con expandir/colapsar, crear página raíz y subpágina,
// rename inline y desde el header, breadcrumbs, iconos, borrado con confirmación,
// autosave al cambiar de página y título multilínea con auto-ajuste de fuente.
//
// Uso (desde el host, con el dev server del renderer en 5174):
//   docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/phase5.e2e.cjs
const { chromium } = require('/home/togu/.npm/_npx/86170c4cd1c5da32/node_modules/playwright')
const path = require('node:path')
const fs = require('node:fs')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = '/tmp/opencode'
const AUTOSAVE_MS = 800
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

const makeBlock = (index, type, text, pageId = 'p-root') => ({
  id: `seed-${index}`,
  pageId,
  type,
  content: JSON.stringify({ text }),
  position: index,
  indent: 0,
  createdAt: 1,
  updatedAt: 1
})

const pagesDom = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-page-id]')].map((row) => {
      const title = row.querySelector('[data-page-title]')
      return {
        id: row.getAttribute('data-page-id'),
        depth: Number(row.getAttribute('data-page-depth')),
        title: title ? (title.lastElementChild?.textContent ?? title.textContent ?? '').trim() : null,
        icon: row.querySelector('[data-page-icon]')?.textContent ?? null,
        active: row.getAttribute('data-active') === 'true',
        expanded: row.querySelector('[data-page-toggle]')?.getAttribute('data-expanded') ?? null
      }
    })
  )

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
          : ''
      }
    })
  )

const state = (page) => page.evaluate(() => window.__mockState())
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const settle = (page, ms = 200) => page.waitForTimeout(ms)
const advanceAutosave = (page) => page.waitForTimeout(AUTOSAVE_MS)

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

async function selectPage(page, id) {
  await page.click(`[data-page-id="${id}"] [data-page-title]`)
  await settle(page, 150)
}

async function openPageMenu(page, id) {
  const row = page.locator(`[data-page-id="${id}"]`)
  await row.hover()
  await row.locator('[data-page-action="open-menu"]').click()
  await page.waitForSelector(`[data-page-menu="${id}"]`)
}

async function stage1Tree(page) {
  const steps = []
  await setup(page)
  await seed(page, {
    pages: [
      P('p-root', 'Raíz', null, 0, 1),
      P('p-child', 'Hija', 'p-root', 0, 2),
      P('p-grand', 'Nieta', 'p-child', 0, 3),
      P('p-other', 'Otra', null, 1, 4)
    ],
    blocks: []
  })

  let rows = await pagesDom(page)
  check(
    steps,
    'el árbol pinta las páginas anidadas con su profundidad',
    rows.length === 4 &&
      rows.map((row) => row.id).join(',') === 'p-root,p-child,p-grand,p-other' &&
      rows.map((row) => row.depth).join(',') === '0,1,2,0',
    rows
  )
  check(steps, 'la primera página queda activa', rows[0].active === true, rows[0])
  check(steps, 'los padres aparecen expandidos al cargar', rows[0].expanded === 'true' && rows[1].expanded === 'true', rows)

  await page.click('[data-page-id="p-root"] [data-page-toggle]')
  rows = await pagesDom(page)
  check(
    steps,
    'colapsar oculta a los descendientes',
    rows.map((row) => row.id).join(',') === 'p-root,p-other' && rows[0].expanded === 'false',
    rows
  )

  await page.click('[data-page-id="p-root"] [data-page-toggle]')
  rows = await pagesDom(page)
  check(steps, 'expandir vuelve a mostrar el subárbol', rows.length === 4, rows)

  await selectPage(page, 'p-grand')
  rows = await pagesDom(page)
  check(steps, 'seleccionar una página la marca activa', rows.find((row) => row.id === 'p-grand').active === true, rows)
  await shot(page, 'e2e-p5-01-arbol.png')
  return { steps, calls: (await state(page)).calls }
}

async function stage2Create(page) {
  const steps = []
  await setup(page)
  await seed(page, {
    pages: [P('p-root', 'Raíz', null, 0, 1)],
    blocks: [makeBlock(0, 'paragraph', 'texto raíz', 'p-root')]
  })

  await page.click('[data-page-action="new-root"]')
  await settle(page, 250)
  let rows = await pagesDom(page)
  check(
    steps,
    'crear página raíz la añade y la activa',
    rows.length === 2 && rows[1].active === true && rows[1].depth === 0,
    rows
  )
  const rootId = rows[1].id
  let mocked = await state(page)
  check(
    steps,
    'la página nueva se persiste con parentId null',
    mocked.pages.some((page) => page.id === rootId && page.parentId === null),
    mocked.pages
  )

  const rootRow = page.locator('[data-page-id="p-root"]')
  await rootRow.hover()
  await rootRow.locator('[data-page-action="add-child"]').click()
  await settle(page, 250)
  rows = await pagesDom(page)
  const childRow = rows.find((row) => row.depth === 1)
  check(
    steps,
    'crear subpágina la anida bajo el padre y la activa',
    !!childRow && childRow.active === true && rows.length === 3,
    rows
  )
  mocked = await state(page)
  check(
    steps,
    'la subpágina se persiste con su parentId',
    mocked.pages.some((page) => page.id === childRow.id && page.parentId === 'p-root'),
    mocked.pages
  )

  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.type('nota hija')
  await settle(page, 150)

  await selectPage(page, 'p-root')
  await advanceAutosave(page)
  let blocks = await dom(page)
  check(
    steps,
    'al volver al padre el editor muestra sus bloques',
    blocks.length === 1 && blocks[0].text === 'texto raíz',
    blocks
  )

  await selectPage(page, childRow.id)
  await advanceAutosave(page)
  blocks = await dom(page)
  check(
    steps,
    'la página hija conserva lo tecleado',
    blocks.some((block) => block.text === 'nota hija'),
    blocks
  )
  mocked = await state(page)
  check(
    steps,
    'los bloques de cada página quedan aislados en el mock',
    mocked.blocks.some((block) => block.pageId === 'p-root' && block.content.includes('texto raíz')) &&
      mocked.blocks.some((block) => block.pageId === childRow.id && block.content.includes('nota hija')),
    mocked.blocks
  )
  await shot(page, 'e2e-p5-02-crear.png')
  return { steps, calls: mocked.calls }
}

async function stage3RenameBreadcrumbs(page) {
  const steps = []
  await setup(page)
  await seed(page, {
    pages: [
      P('p-root', 'Raíz', null, 0, 1),
      P('p-child', 'Hija', 'p-root', 0, 2),
      P('p-grand', 'Nieta', 'p-child', 0, 3)
    ],
    blocks: []
  })

  await selectPage(page, 'p-grand')
  let crumbs = await page.evaluate(() => ({
    ancestors: [...document.querySelectorAll('[data-breadcrumb]')].map((node) => ({
      id: node.getAttribute('data-breadcrumb'),
      text: node.textContent.trim()
    })),
    current: document.querySelector('[data-breadcrumb-current]')?.textContent?.trim() ?? null
  }))
  check(
    steps,
    'los breadcrumbs listan los ancestros y la página actual',
    crumbs.ancestors.length === 2 &&
      crumbs.ancestors[0].id === 'p-root' &&
      crumbs.ancestors[1].id === 'p-child' &&
      crumbs.current === 'Nieta',
    crumbs
  )

  await page.click('[data-breadcrumb="p-root"]')
  await settle(page, 200)
  crumbs = await page.evaluate(() => ({
    ancestors: [...document.querySelectorAll('[data-breadcrumb]')].length,
    current: document.querySelector('[data-breadcrumb-current]')?.textContent?.trim() ?? null
  }))
  check(
    steps,
    'click en un breadcrumb navega a esa página',
    crumbs.ancestors === 0 && crumbs.current === 'Raíz',
    crumbs
  )

  await openPageMenu(page, 'p-child')
  await page.click('[data-menu-action="rename"]')
  await page.waitForSelector('[data-page-rename]')
  await page.fill('[data-page-rename]', 'Subpágina')
  await page.keyboard.press('Enter')
  await settle(page, 150)
  let rows = await pagesDom(page)
  check(
    steps,
    'renombrar desde el menú actualiza el árbol',
    rows.find((row) => row.id === 'p-child').title === 'Subpágina',
    rows
  )
  await advanceAutosave(page)
  let mocked = await state(page)
  check(
    steps,
    'el nombre se persiste por IPC',
    mocked.pages.find((page) => page.id === 'p-child').title === 'Subpágina',
    mocked.pages
  )

  const childRow = page.locator('[data-page-id="p-child"]')
  await childRow.locator('[data-page-title]').dblclick()
  await page.waitForSelector('[data-page-rename]')
  await page.fill('[data-page-rename]', 'Descartado')
  await page.keyboard.press('Escape')
  await settle(page, 150)
  rows = await pagesDom(page)
  check(
    steps,
    'Escape cancela el rename inline',
    rows.find((row) => row.id === 'p-child').title === 'Subpágina',
    rows
  )

  await selectPage(page, 'p-grand')
  const header = page.locator('[data-page-title-input]')
  await header.fill('Nieta renombrada')
  await advanceAutosave(page)
  rows = await pagesDom(page)
  check(
    steps,
    'renombrar desde el header actualiza el sidebar',
    rows.find((row) => row.id === 'p-grand').title === 'Nieta renombrada',
    rows
  )
  await shot(page, 'e2e-p5-03-breadcrumbs.png')
  return { steps, calls: (await state(page)).calls }
}

async function stage4Icons(page) {
  const steps = []
  await setup(page)
  await seed(page, {
    pages: [P('p-root', 'Raíz', null, 0, 1), P('p-other', 'Otra', null, 1, 2)],
    blocks: []
  })

  await page.click('[data-icon-button]')
  await page.waitForSelector('[data-icon-picker]')
  check(steps, 'el picker de iconos se abre desde el header', true)
  check(
    steps,
    'sin icono el botón del header muestra el placeholder',
    (await page.textContent('[data-icon-button]')).trim() === '😀',
    await page.textContent('[data-icon-button]')
  )

  await page.click('[data-icon-option="🚀"]')
  await settle(page, 200)
  check(steps, 'elegir un emoji lo pinta en el header', (await page.textContent('[data-icon-button]')).includes('🚀'))
  const iconTitleDelta = await page.evaluate(() => {
    const button = document.querySelector('[data-icon-button]')
    const title = document.querySelector('[data-page-title-input]')
    const b = button.getBoundingClientRect()
    const t = title.getBoundingClientRect()
    const line = Number.parseFloat(getComputedStyle(title).lineHeight)
    return Math.abs(b.top + b.height / 2 - (t.top + line / 2))
  })
  check(steps, 'el emoji del header queda centrado con el título', iconTitleDelta <= 1, iconTitleDelta)
  let rows = await pagesDom(page)
  check(
    steps,
    'el icono aparece también en el sidebar',
    rows.find((row) => row.id === 'p-root').icon === '🚀',
    rows
  )
  await advanceAutosave(page)
  let mocked = await state(page)
  check(
    steps,
    'el icono se persiste por IPC',
    mocked.pages.find((page) => page.id === 'p-root').icon === '🚀',
    mocked.pages
  )

  await page.click('[data-icon-button]')
  await page.waitForSelector('[data-icon-remove]')
  await page.click('[data-icon-remove]')
  await settle(page, 200)
  mocked = await state(page)
  check(
    steps,
    'quitar el icono lo limpia en UI y persistencia',
    (await page.textContent('[data-icon-button]')).trim() === '😀' &&
      mocked.pages.find((page) => page.id === 'p-root').icon === null,
    (await pagesDom(page))
  )

  await openPageMenu(page, 'p-other')
  await page.click('[data-menu-action="icon"]')
  await page.waitForSelector('[data-icon-picker]')
  await page.click('[data-icon-option="🔥"]')
  await settle(page, 200)
  rows = await pagesDom(page)
  check(
    steps,
    'el menú de página también permite asignar icono',
    rows.find((row) => row.id === 'p-other').icon === '🔥',
    rows
  )
  await shot(page, 'e2e-p5-04-iconos.png')
  return { steps, calls: mocked.calls }
}

async function stage5Delete(page) {
  const steps = []
  await setup(page)
  await seed(page, {
    pages: [
      P('p-root', 'Raíz', null, 0, 1),
      P('p-child', 'Hija', 'p-root', 0, 2),
      P('p-grand', 'Nieta', 'p-child', 0, 3),
      P('p-other', 'Otra', null, 1, 4)
    ],
    blocks: [makeBlock(0, 'paragraph', 'contenido hija', 'p-child')]
  })

  await selectPage(page, 'p-grand')
  await openPageMenu(page, 'p-child')
  await page.click('[data-menu-action="delete"]')
  await page.waitForSelector('[data-confirm-dialog]')
  check(
    steps,
    'el modal avisa de las subpáginas incluidas',
    (await page.textContent('[data-confirm-dialog]')).includes('1 subpage'),
    await page.textContent('[data-confirm-dialog]')
  )

  await page.click('[data-confirm-cancel]')
  await settle(page, 150)
  let rows = await pagesDom(page)
  check(
    steps,
    'cancelar conserva la página y sus descendientes',
    rows.some((row) => row.id === 'p-child') && rows.some((row) => row.id === 'p-grand'),
    rows
  )

  await openPageMenu(page, 'p-child')
  await page.click('[data-menu-action="delete"]')
  await page.waitForSelector('[data-confirm-dialog]')
  await page.click('[data-confirm-accept]')
  await settle(page, 300)
  rows = await pagesDom(page)
  check(
    steps,
    'confirmar borra la página y su subárbol',
    rows.map((row) => row.id).join(',') === 'p-root,p-other',
    rows
  )
  check(
    steps,
    'al borrar la página activa se selecciona el padre',
    rows.find((row) => row.id === 'p-root').active === true,
    rows
  )
  let mocked = await state(page)
  check(
    steps,
    'la cascada elimina los bloques en persistencia',
    !mocked.blocks.some((block) => block.pageId === 'p-child') &&
      mocked.pages.length === 2,
    mocked
  )

  await selectPage(page, 'p-root')
  await openPageMenu(page, 'p-root')
  await page.click('[data-menu-action="delete"]')
  await page.waitForSelector('[data-confirm-dialog]')
  await page.click('[data-confirm-accept]')
  await settle(page, 300)
  rows = await pagesDom(page)
  check(
    steps,
    'borrar la raíz activa selecciona la siguiente visible',
    rows.length === 1 && rows[0].id === 'p-other' && rows[0].active === true,
    rows
  )

  await openPageMenu(page, 'p-other')
  await page.click('[data-menu-action="delete"]')
  await page.waitForSelector('[data-confirm-dialog]')
  await page.click('[data-confirm-accept]')
  await settle(page, 400)
  rows = await pagesDom(page)
  mocked = await state(page)
  check(
    steps,
    'borrar la última página crea una por defecto',
    rows.length === 1 && mocked.pages.length === 1 && rows[0].id === mocked.pages[0].id,
    { rows, pages: mocked.pages }
  )
  check(
    steps,
    'la página de reemplazo queda activa y editable',
    rows[0].active === true && (await page.locator('div[contenteditable]').count()) === 1,
    rows
  )
  await shot(page, 'e2e-p5-05-borrado.png')
  return { steps, calls: mocked.calls }
}

async function stage6AutosaveOnSwitch(page) {
  const steps = []
  await setup(page)
  await seed(page, {
    pages: [P('p-root', 'Raíz', null, 0, 1), P('p-child', 'Hija', 'p-root', 0, 2)],
    blocks: []
  })

  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.type('cambio sin guardar')
  await selectPage(page, 'p-child')
  await advanceAutosave(page)
  await selectPage(page, 'p-root')
  await advanceAutosave(page)
  let blocks = await dom(page)
  check(
    steps,
    'cambiar de página fuerza el autosave pendiente',
    blocks.some((block) => block.text === 'cambio sin guardar'),
    blocks
  )

  await selectPage(page, 'p-child')
  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.type('se borra')
  await openPageMenu(page, 'p-child')
  await page.click('[data-menu-action="delete"]')
  await page.waitForSelector('[data-confirm-dialog]')
  await page.click('[data-confirm-accept]')
  await settle(page, 500)
  blocks = await dom(page)
  check(
    steps,
    'borrar la página activa con autosave pendiente no rompe el editor',
    blocks.length === 0 || blocks.every((block) => block.text !== 'se borra'),
    blocks
  )
  const mocked = await state(page)
  check(
    steps,
    'el borrado deja la selección en el padre',
    (await pagesDom(page))[0].active === true && mocked.pages.length === 1,
    mocked
  )
  await shot(page, 'e2e-p5-06-autosave.png')
  return { steps, calls: mocked.calls }
}

async function stage7TitleFit(page) {
  const steps = []
  await setup(page)
  const longTitle =
    'Un título larguísimo que no cabe a treinta y seis píxeles y tiene que envolverse en varias líneas'
  await seed(page, {
    pages: [P('p-root', longTitle, null, 0, 1)],
    blocks: []
  })

  const titleMetrics = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-page-title-input]')
      const style = getComputedStyle(el)
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        height: el.getBoundingClientRect().height,
        scrollHeight: el.scrollHeight,
        value: el.value
      }
    })

  let metrics = await titleMetrics()
  check(
    steps,
    'un título largo reduce la fuente hasta el mínimo de 24px',
    metrics.fontSize === 24,
    metrics
  )
  check(
    steps,
    'la altura de línea acompaña a la fuente mínima (27px)',
    metrics.lineHeight === 27,
    metrics.lineHeight
  )
  check(
    steps,
    'agotado el mínimo el título hace wrap en varias líneas',
    metrics.height >= metrics.lineHeight * 2 - 1,
    metrics
  )

  const iconTitleDelta = await page.evaluate(() => {
    const button = document.querySelector('[data-icon-button]')
    const title = document.querySelector('[data-page-title-input]')
    const b = button.getBoundingClientRect()
    const t = title.getBoundingClientRect()
    const line = Number.parseFloat(getComputedStyle(title).lineHeight)
    return Math.abs(b.top + b.height / 2 - (t.top + line / 2))
  })
  check(
    steps,
    'con el título envuelto a 24px el icono sigue centrado con la primera línea',
    iconTitleDelta <= 1,
    iconTitleDelta
  )

  await page.setViewportSize({ width: 640, height: 800 })
  await settle(page, 300)
  metrics = await titleMetrics()
  check(
    steps,
    'estrechar el viewport reajusta el alto sin recortar el texto',
    metrics.scrollHeight <= metrics.height + 1,
    metrics
  )
  check(
    steps,
    'tras estrechar el viewport la fuente sigue en el mínimo',
    metrics.fontSize === 24,
    metrics
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await settle(page, 300)

  const titleInput = page.locator('[data-page-title-input]')
  await page.evaluate(() => {
    const el = document.querySelector('[data-page-title-input]')
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
  const beforeEnter = await titleInput.inputValue()
  await page.keyboard.press('Enter')
  await settle(page, 150)
  const afterEnter = await titleInput.inputValue()
  check(
    steps,
    'Enter en el título no inserta salto de línea',
    afterEnter === beforeEnter && !afterEnter.includes('\n'),
    { before: beforeEnter.length, after: afterEnter.length }
  )

  await titleInput.fill('abcdef')
  await settle(page, 100)
  const inserted = await page.evaluate(() => {
    const el = document.querySelector('[data-page-title-input]')
    el.focus()
    el.setSelectionRange(3, 3)
    return document.execCommand('insertText', false, 'x\ny')
  })
  await settle(page, 150)
  const afterInsert = await page.evaluate(() => {
    const el = document.querySelector('[data-page-title-input]')
    return { value: el.value, start: el.selectionStart, end: el.selectionEnd }
  })
  check(
    steps,
    'insertar texto con salto de línea lo normaliza a espacio',
    inserted && afterInsert.value === 'abcx ydef',
    { inserted, afterInsert }
  )
  check(
    steps,
    'el caret se conserva tras normalizar el salto de línea',
    afterInsert.start === 6 && afterInsert.end === 6,
    afterInsert
  )
  await advanceAutosave(page)
  const mocked = await state(page)
  check(
    steps,
    'el título normalizado se persiste sin saltos de línea',
    mocked.pages.find((page) => page.id === 'p-root')?.title === 'abcx ydef',
    mocked.pages
  )
  await shot(page, 'e2e-p5-07-title-fit.png')
  return { steps, calls: mocked.calls }
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
    ['stage1 · árbol y expansión', stage1Tree],
    ['stage2 · crear páginas', stage2Create],
    ['stage3 · rename y breadcrumbs', stage3RenameBreadcrumbs],
    ['stage4 · iconos', stage4Icons],
    ['stage5 · borrado con confirmación', stage5Delete],
    ['stage6 · autosave al cambiar de página', stage6AutosaveOnSwitch],
    ['stage7 · título multilínea con auto-ajuste', stage7TitleFit]
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
  fs.writeFileSync(path.join(OUT, 'e2e-phase5-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
